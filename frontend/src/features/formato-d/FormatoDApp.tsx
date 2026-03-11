import React, { startTransition, useState, useEffect, useRef } from 'react';
import { FileDown, Loader2, ScanLine, ChevronRight, AlertCircle, RefreshCw, Layers } from 'lucide-react';

declare global {
    interface Window { pdfjsLib: any; }
}

const API_URL = '/api/formato-d/generate';
const MAX_PAGES = 500;
const PREVIEW_DEBOUNCE_MS = 800;
const PREVIEW_MAX_PAGES = 30;

function pad(n: number) {
    return String(n).padStart(7, '0');
}

/* ─── Types ──────────────────────────────────────────────────── */
interface PageImg {
    url: string;
    pageNum: number;
}

/* ─── Multi-page PDF Viewer ──────────────────────────────────── */
function PdfMultiViewer({ blob, desde, total }: { blob: Blob | null; desde: number; total: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pageImgs, setPageImgs] = useState<PageImg[]>([]);
    const [renderingPage, setRenderingPage] = useState(0);

    useEffect(() => {
        if (!blob) {
            setPageImgs([]);
            setRenderingPage(0);
            return;
        }

        let cancelled = false;
        const createdUrls: string[] = [];
        setPageImgs([]);

        async function renderAll() {
            const ab = await blob!.arrayBuffer();
            if (cancelled) return;

            const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
            if (cancelled) return;
            const numPages = pdf.numPages;

            // Measure actual container width for full-bleed rendering
            const containerW = (containerRef.current?.clientWidth ?? 1100) - 32;
            // Use devicePixelRatio (capped at 2) so text is pixel-perfect on HiDPI screens
            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            const offscreen = document.createElement('canvas');

            for (let i = 1; i <= numPages; i++) {
                if (cancelled) break;
                // Yield between pages so the shell/sidebar can repaint smoothly while pdf.js works.
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => resolve());
                });
                startTransition(() => {
                    setRenderingPage(i);
                });

                const page = await pdf.getPage(i);
                if (cancelled) break;

                const unscaled = page.getViewport({ scale: 1 });
                // Render at (containerW / pageWidth) * dpr → 1 canvas px = 1 physical px
                const scale = (containerW / unscaled.width) * dpr;
                const viewport = page.getViewport({ scale });

                offscreen.width = viewport.width;
                offscreen.height = viewport.height;
                const ctx = offscreen.getContext('2d')!;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, viewport.width, viewport.height);

                await page.render({ canvasContext: ctx, viewport }).promise;
                if (cancelled) break;

                // PNG for lossless sharpness (docs compress very well)
                const url = await new Promise<string>(res =>
                    offscreen.toBlob(b => res(URL.createObjectURL(b!)), 'image/png')
                );
                createdUrls.push(url);
                if (cancelled) break;

                startTransition(() => {
                    setPageImgs(prev => [...prev, { url, pageNum: i }]);
                });
            }

            if (!cancelled) {
                startTransition(() => {
                    setRenderingPage(0);
                });
            }
        }

        renderAll().catch(e => {
            if (e?.name !== 'RenderingCancelledException') console.warn('render error', e);
            if (!cancelled) {
                startTransition(() => {
                    setRenderingPage(0);
                });
            }
        });

        return () => {
            cancelled = true;
            createdUrls.forEach(u => URL.revokeObjectURL(u));
        };
    }, [blob]);

    const isCapped = total > PREVIEW_MAX_PAGES;
    const previewCount = Math.min(total, PREVIEW_MAX_PAGES);

    return (
        <div
            ref={containerRef}
            className="w-full h-full overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent' }}
        >
            <div className="px-4 py-4 space-y-4 flex flex-col items-center">
                {pageImgs.map((p) => (
                    <div key={p.pageNum} className="relative w-full">
                        <img
                            src={p.url}
                            alt={`Página ${p.pageNum}`}
                            className="w-full rounded shadow-2xl shadow-black/60 block"
                            draggable={false}
                            /* img pixel width = containerW*dpr; display at containerW CSS px → crisp */
                            style={{ imageRendering: 'auto' }}
                        />
                        {/* Page number badge */}
                        <div
                            className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 bg-black/80 border border-amber-400/25 rounded px-2 py-1"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            <span className="text-[8px] text-neutral-600">N°</span>
                            <span className="text-[10px] font-medium text-amber-400 tracking-widest">
                                {pad(desde + p.pageNum - 1)}
                            </span>
                        </div>
                    </div>
                ))}

                {/* Rendering progress */}
                {renderingPage > 0 && (
                    <div className="flex items-center gap-2.5 py-4 text-neutral-600">
                        <RefreshCw size={11} className="animate-spin text-amber-400/40 flex-shrink-0" />
                        <span
                            className="text-[10px] tracking-widest"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            renderizando {renderingPage} / {previewCount}…
                        </span>
                    </div>
                )}

                {/* Capped notice */}
                {isCapped && renderingPage === 0 && pageImgs.length > 0 && (
                    <div className="w-full border border-amber-400/10 bg-amber-400/[0.03] rounded-md px-4 py-3 text-center">
                        <p
                            className="text-[10px] text-amber-400/50 tracking-wider"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            vista previa: {PREVIEW_MAX_PAGES} de {total} páginas
                        </p>
                    </div>
                )}

                <div className="h-2" />
            </div>
        </div>
    );
}

/* ─── Empty / Loading State ──────────────────────────────────── */
function EmptyPreview({ loading }: { loading: boolean }) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-neutral-700">
            {loading ? (
                <>
                    <Loader2 size={22} className="animate-spin text-amber-400/40" />
                    <span
                        className="text-[11px] tracking-widest"
                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                        cargando formatos…
                    </span>
                </>
            ) : (
                <>
                    <div className="w-20 h-20 border border-neutral-800 rounded-lg flex items-center justify-center">
                        <ScanLine size={28} className="text-neutral-800" />
                    </div>
                    <span
                        className="text-[11px] tracking-widest text-neutral-700"
                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                        sin vista previa
                    </span>
                </>
            )}
        </div>
    );
}

/* ─── Main App ───────────────────────────────────────────────── */
export default function FormatoDApp() {
    const [desde, setDesde] = useState<number>(1);
    const [hasta, setHasta] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewDesde, setPreviewDesde] = useState<number>(1);
    const [previewTotal, setPreviewTotal] = useState<number>(0);

    const total = Math.max(0, hasta - desde + 1);
    const isValid = desde >= 1 && hasta >= desde && total <= MAX_PAGES;

    /* ── Auto-preview on desde/hasta change ── */
    useEffect(() => {
        const capturedDesde = desde;
        const capturedHasta = hasta;
        const capturedTotal = capturedHasta - capturedDesde + 1;
        const previewHasta = Math.min(capturedHasta, capturedDesde + PREVIEW_MAX_PAGES - 1);

        const t = setTimeout(async () => {
            if (capturedDesde < 1 || capturedHasta < capturedDesde) return;
            setPreviewLoading(true);
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ desde: capturedDesde, hasta: previewHasta }),
                });
                if (res.ok) {
                    const blob = await res.blob();
                    setPreviewBlob(blob);
                    setPreviewDesde(capturedDesde);
                    setPreviewTotal(capturedTotal);
                }
            } catch { /* silent */ } finally {
                setPreviewLoading(false);
            }
        }, PREVIEW_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [desde, hasta]);

    /* ── Download handler ── */
    const handleGenerate = async () => {
        if (!isValid) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desde, hasta }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail ?? `Error ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = desde === hasta
                ? `formato_d_${pad(desde)}.pdf`
                : `formato_d_${pad(desde)}-${pad(hasta)}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error desconocido');
        } finally {
            setLoading(false);
        }
    };

    const previewPagesShown = Math.min(previewTotal, PREVIEW_MAX_PAGES);
    const isCapped = previewTotal > PREVIEW_MAX_PAGES;

    return (
        <div
            className="flex overflow-hidden bg-[#0a0a0a] text-white"
            style={{ height: 'calc(100vh - 0px)', fontFamily: "'Outfit', sans-serif" }}
        >
            {/* ── LEFT: PREVIEW ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 relative">

                {/* dot-grid background */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                {/* topbar */}
                <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-white/[0.05]">
                    <div className="flex items-center gap-2.5">
                        <ScanLine size={13} className="text-amber-400" />
                        <span
                            className="text-[10px] tracking-[0.22em] uppercase text-neutral-500"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            Vista Previa
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        {previewBlob && previewPagesShown > 0 && (
                            <div
                                className="flex items-center gap-1.5 border border-white/[0.08] rounded px-2.5 py-1 bg-white/[0.02]"
                                style={{ fontFamily: "'Roboto Mono', monospace" }}
                            >
                                <span className="text-[9px] tracking-wider text-neutral-600">N°</span>
                                <span className="text-[10px] font-medium text-white tracking-wider">
                                    {pad(previewDesde)}
                                    {previewTotal > 1 ? ` → ${pad(previewDesde + previewTotal - 1)}` : ''}
                                </span>
                            </div>
                        )}
                        {previewLoading && (
                            <div className="flex items-center gap-1.5">
                                <RefreshCw size={9} className="animate-spin text-amber-400/40" />
                                <span
                                    className="text-[9px] tracking-wider text-neutral-600"
                                    style={{ fontFamily: "'Roboto Mono', monospace" }}
                                >
                                    actualizando…
                                </span>
                            </div>
                        )}
                        {previewBlob && previewPagesShown > 0 && (
                            <div
                                className="flex items-center gap-1.5 border border-amber-400/25 rounded px-2.5 py-1 bg-amber-400/[0.04]"
                                style={{ fontFamily: "'Roboto Mono', monospace" }}
                            >
                                <Layers size={9} className="text-amber-400/60" />
                                <span className="text-[10px] font-medium text-amber-400 tracking-wider">
                                    {isCapped
                                        ? `${PREVIEW_MAX_PAGES} / ${previewTotal}`
                                        : previewPagesShown
                                    }{' '}
                                    {previewPagesShown === 1 ? 'pág.' : 'págs.'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* viewer area */}
                <div className="relative flex-1 overflow-hidden">
                    {previewBlob ? (
                        <PdfMultiViewer
                            blob={previewBlob}
                            desde={previewDesde}
                            total={previewTotal}
                        />
                    ) : (
                        <EmptyPreview loading={previewLoading} />
                    )}
                </div>
            </div>

            {/* ── RIGHT: SIDEBAR ────────────────────────────────────── */}
            <div
                className="w-[300px] flex-shrink-0 flex flex-col border-l border-white/[0.06]"
                style={{ background: '#0e0e0e' }}
            >
                {/* brand header */}
                <div className="px-6 pt-7 pb-6 border-b border-white/[0.05]">
                    <div
                        className="flex items-center gap-2 mb-2"
                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                        <span className="text-[9px] tracking-[0.3em] text-neutral-600 uppercase">C.P. 052-2024</span>
                        <span className="text-[9px] text-neutral-700">·</span>
                        <span className="text-[9px] tracking-[0.3em] text-neutral-600 uppercase">SEDAPAL</span>
                    </div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-white leading-none">
                        Formato D
                    </h1>
                    <p className="text-[11px] text-neutral-600 mt-1.5">Generador de PDFs</p>
                </div>

                {/* scrollable config */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {/* ─ Rango ─ */}
                    <section>
                        <p
                            className="text-[9px] tracking-[0.25em] uppercase text-neutral-600 mb-3"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            Rango de números
                        </p>
                        <div className="space-y-2.5">

                            {/* Desde */}
                            <div>
                                <div
                                    className="text-[9px] text-neutral-600 tracking-widest mb-1.5"
                                    style={{ fontFamily: "'Roboto Mono', monospace" }}
                                >
                                    DESDE
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={1} max={9999999}
                                        value={desde}
                                        onChange={e => setDesde(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full bg-black/60 border border-white/[0.08] hover:border-white/[0.14] focus:border-amber-400/40 rounded-md px-3 py-2.5 text-white text-sm focus:outline-none transition-colors pr-20"
                                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                                    />
                                    <span
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-amber-400/50 tracking-wider pointer-events-none"
                                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                                    >
                                        {pad(desde)}
                                    </span>
                                </div>
                            </div>

                            {/* Arrow connector */}
                            <div className="flex items-center gap-2 px-1">
                                <div className="flex-1 h-px bg-white/[0.05]" />
                                <ChevronRight size={10} className="text-neutral-700" />
                                <div className="flex-1 h-px bg-white/[0.05]" />
                            </div>

                            {/* Hasta */}
                            <div>
                                <div
                                    className="text-[9px] text-neutral-600 tracking-widest mb-1.5"
                                    style={{ fontFamily: "'Roboto Mono', monospace" }}
                                >
                                    HASTA
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={desde} max={9999999}
                                        value={hasta}
                                        onChange={e => setHasta(Math.max(desde, parseInt(e.target.value) || desde))}
                                        className="w-full bg-black/60 border border-white/[0.08] hover:border-white/[0.14] focus:border-amber-400/40 rounded-md px-3 py-2.5 text-white text-sm focus:outline-none transition-colors pr-20"
                                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                                    />
                                    <span
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-amber-400/50 tracking-wider pointer-events-none"
                                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                                    >
                                        {pad(hasta)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ─ Divider ─ */}
                    <div className="border-t border-white/[0.05]" />

                    {/* ─ Resumen ─ */}
                    <section>
                        <p
                            className="text-[9px] tracking-[0.25em] uppercase text-neutral-600 mb-3"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                        >
                            Resumen
                        </p>
                        <div className="rounded-md border border-white/[0.06] bg-black/30 divide-y divide-white/[0.04]">
                            <Row label="Tipo" value={total === 1 ? 'Individual' : 'Consolidado'} />
                            <Row
                                label="Páginas"
                                value={total > MAX_PAGES ? `${total} ✗` : String(total)}
                                valueClass={total > MAX_PAGES ? 'text-red-400' : 'text-amber-400'}
                            />
                            <Row
                                label="Correlativo"
                                value={
                                    total > MAX_PAGES
                                        ? `${pad(desde)} → ${pad(Math.min(hasta, desde + MAX_PAGES - 1))}`
                                        : total > 1
                                            ? `${pad(desde)} → ${pad(hasta)}`
                                            : pad(desde)
                                }
                            />
                            {total > 1 && total <= MAX_PAGES && (
                                <Row label="Rango" value={`${pad(desde)} → ${pad(hasta)}`} />
                            )}
                            {total > MAX_PAGES && (
                                <Row
                                    label="Límite"
                                    value={`máx. ${MAX_PAGES}`}
                                    valueClass="text-red-400/70"
                                />
                            )}
                        </div>
                    </section>

                    {/* ─ Error ─ */}
                    {error && (
                        <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/40 rounded-md p-3">
                            <AlertCircle size={11} className="text-red-400 mt-0.5 flex-shrink-0" />
                            <p
                                className="text-[11px] text-red-400 leading-relaxed"
                                style={{ fontFamily: "'Roboto Mono', monospace" }}
                            >
                                {error}
                            </p>
                        </div>
                    )}
                </div>

                {/* ─ Footer / Generate ─ */}
                <div className="px-6 pb-6 pt-4 border-t border-white/[0.05] space-y-3">
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !isValid}
                        className="w-full flex items-center justify-between gap-2 bg-black hover:bg-white border border-white text-white hover:text-black disabled:opacity-30 disabled:pointer-events-none font-medium rounded-lg py-3 px-4 transition-colors text-sm group"
                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                        <div className="flex items-center gap-2">
                            {loading
                                ? <Loader2 size={13} className="animate-spin" />
                                : <FileDown size={13} />
                            }
                            <span className="text-[11px] tracking-wider">
                                {loading
                                    ? 'Generando…'
                                    : total <= 1
                                        ? 'Generar PDF'
                                        : `Generar ${total} páginas`
                                }
                            </span>
                        </div>
                        {!loading && (
                            <ChevronRight size={12} className="opacity-40 group-hover:opacity-80 transition-opacity" />
                        )}
                    </button>

                    <p
                        className="text-center text-[9px] tracking-[0.2em] text-neutral-700 uppercase"
                        style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                        máx. {MAX_PAGES} páginas / descarga
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ─── Utility row ────────────────────────────────────────────── */
function Row({ label, value, valueClass = 'text-white' }: {
    label: string; value: string; valueClass?: string;
}) {
    return (
        <div className="flex items-center justify-between px-3 py-2">
            <span
                className="text-[10px] text-neutral-600"
                style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
                {label}
            </span>
            <span
                className={`text-[10px] font-medium ${valueClass}`}
                style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
                {value}
            </span>
        </div>
    );
}
