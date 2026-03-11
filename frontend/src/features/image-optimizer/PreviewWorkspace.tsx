import { CheckCircle2, Crop, Download, Eye, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { formatBytes } from '@/utils/formatBytes';
import { BatchSettings, CropRectangle, ImageItem, PreviewTab, PresetId } from './types';
import { BeforeAfterSlider, ItemSummary, ProgressBar } from './ui';
import { IMAGE_OPTIMIZER_PRESETS } from './presets';

interface PreviewWorkspaceProps {
    items: ImageItem[];
    activeItem: ImageItem | null;
    activeItemSettings: BatchSettings;
    activeItemOutputName: string;
    activeItemDownloadable: boolean;
    activeIsDirect: boolean;
    activeCropPreview: CropRectangle | null;
    previewTab: PreviewTab;
    processing: boolean;
    processingProgress: { current: number; total: number };
    processingMessage: string;
    primaryActionLabel: string;
    activeScopeLabel: string;
    viewMode: 'grid' | 'single';
    onChangePreviewTab: (tab: PreviewTab) => void;
    onViewModeChange: (mode: 'grid' | 'single') => void;
    onSetActiveItem: (id: string) => void;
    onDownloadSingle: (item: ImageItem) => void;
    onRemoveItem: (id: string) => void;
    onOpenCropEditor: (id?: string) => void;
    onUpdateCustomFilename: (id: string, value: string) => void;
    onUpdatePresetOverride: (id: string, value: PresetId | null) => void;
    onToggleSkipCompression: (id: string, value: boolean) => void;
    onToggleExcluded: (id: string, value: boolean) => void;
    onClearPresetOverride: (id: string) => void;
}

export default function PreviewWorkspace({
    items,
    activeItem,
    activeItemSettings,
    activeItemOutputName,
    activeItemDownloadable,
    activeIsDirect,
    activeCropPreview,
    previewTab,
    processing,
    processingProgress,
    processingMessage,
    primaryActionLabel,
    activeScopeLabel,
    viewMode,
    onChangePreviewTab,
    onViewModeChange,
    onSetActiveItem,
    onDownloadSingle,
    onRemoveItem,
    onOpenCropEditor,
    onUpdateCustomFilename,
    onUpdatePresetOverride,
    onToggleSkipCompression,
    onToggleExcluded,
    onClearPresetOverride,
}: PreviewWorkspaceProps) {
    if (items.length === 0) {
        return (
            <section className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[14px] border border-dashed border-white/[0.07] bg-[#111114] px-6 text-center shadow-sm">
                <div className="relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.07] bg-[#0A0A0C]">
                    <Sparkles size={20} className="text-zinc-600" />
                </div>
                <p className="relative z-10 font-mono text-[11px] uppercase tracking-widest text-zinc-600">Selecciona una imagen</p>
            </section>
        );
    }

    if (viewMode === 'grid') {
        return (
            <section className="relative flex h-full flex-col overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#111114] shadow-sm">
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                        {items.map((item) => {
                            const statusColor = item.excluded ? '#52525b'
                                : item.status === 'error' ? '#ef4444'
                                    : item.stale ? '#f59e0b'
                                        : item.status === 'completed' ? '#10b981'
                                            : item.status === 'processing' ? '#3b82f6'
                                                : '#3f3f46';
                            const thumb = item.resultPreview || item.preview;

                            return (
                                <div
                                    key={item.id}
                                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-white/[0.06] bg-[#0A0A0C] transition-all hover:border-white/[0.14] hover:bg-white/[0.02]"
                                    onClick={() => {
                                        onSetActiveItem(item.id);
                                        onViewModeChange('single');
                                    }}
                                >
                                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-900">
                                        {thumb ? (
                                            <img src={thumb} alt={item.originalName} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center">
                                                <Sparkles size={16} className="text-zinc-700" />
                                            </div>
                                        )}

                                        <div className="absolute inset-0 flex items-start justify-end p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenCropEditor(item.id);
                                                }}
                                                className="flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-zinc-300 transition-colors hover:bg-emerald-500/80 hover:text-white"
                                                title="Ajustar recorte"
                                            >
                                                <Crop size={11} />
                                            </button>
                                        </div>

                                        {item.status === 'processing' && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                <Loader2 size={16} className="animate-spin text-white" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                                        <div className="min-w-0 flex-1">
                                            <p className={`truncate text-[10px] font-mono leading-tight text-zinc-300 ${item.excluded ? 'line-through opacity-50' : ''}`}>
                                                {item.originalName}
                                            </p>
                                            <p className="mt-0.5 text-[9px] font-mono leading-tight text-zinc-600">
                                                {item.sourceWidth && item.sourceHeight ? `${item.sourceWidth}×${item.sourceHeight} · ` : ''}
                                                {formatBytes(item.originalSize)}
                                                {item.resultSize != null ? <span className="text-emerald-500"> → {formatBytes(item.resultSize)}</span> : null}
                                            </p>
                                        </div>
                                        <span
                                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.status === 'processing' ? 'animate-pulse' : ''}`}
                                            style={{ backgroundColor: statusColor }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
        );
    }

    if (!activeItem) {
        return null;
    }

    return (
        <section className="flex h-full flex-col gap-3 overflow-hidden">
            <div className="relative flex-1 overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#111114] p-4 shadow-sm flex flex-col gap-3">
                {/* Item header */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shrink-0">
                    <div className="min-w-0 flex items-center gap-2">
                        <p className="truncate font-mono text-sm tracking-wide text-white">{activeItem.originalName}</p>
                        {activeItem.status === 'completed' && !activeItem.stale ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0" /> : null}
                        {activeItem.excluded && <span className="shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono text-red-400">Excluida</span>}
                        {activeItem.stale && <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-400">Stale</span>}
                        {activeItem.overrides.skipCompression && <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono text-sky-400">Skip Comp</span>}
                        {activeItem.overrides.presetId && <span className="shrink-0 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-mono text-violet-400">Preset local</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => onViewModeChange('grid')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white"
                        >
                            ← Grid
                        </button>
                        <button
                            onClick={() => onDownloadSingle(activeItem)}
                            disabled={!activeItemDownloadable}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                        >
                            <Download size={12} />
                            Descargar
                        </button>
                        <button
                            onClick={() => onRemoveItem(activeItem.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-red-500/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                            <Trash2 size={12} />
                            Quitar
                        </button>
                    </div>
                </div>

                {/* Pill tab nav */}
                <div className="flex items-center gap-3 shrink-0 border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-0.5 rounded-full border border-white/[0.07] bg-[#0A0A0C] p-1">
                        {([
                            { value: 'original', label: 'Original' },
                            { value: 'crop', label: 'Recorte' },
                            { value: 'result', label: 'Resultado' },
                            { value: 'compare', label: 'Comparar' },
                        ] as const).map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => onChangePreviewTab(tab.value)}
                                className={`rounded-full px-3.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all ${previewTab === tab.value
                                        ? 'bg-white text-black font-semibold'
                                        : 'text-zinc-500 hover:text-zinc-200'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {processing && (
                        <div className="min-w-[14rem] flex-1">
                            <ProgressBar current={processingProgress.current} total={processingProgress.total} />
                            {processingMessage && <p className="mt-1.5 text-[10px] font-mono text-zinc-500 tracking-widest truncate">{processingMessage}</p>}
                        </div>
                    )}
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 overflow-auto flex flex-col gap-4">
                    {previewTab === 'original' ? (
                        <div className="flex flex-col gap-3">
                            <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#0A0A0C]">
                                <img src={activeItem.preview} alt={activeItem.originalName} className="max-h-[30rem] w-auto object-contain" />
                            </div>
                            <div className="shrink-0">
                                <ItemSummary item={activeItem} />
                            </div>
                        </div>
                    ) : null}

                    {previewTab === 'crop' ? (
                        activeCropPreview && activeItemSettings.operations.cropEnabled && activeItemSettings.crop.aspectRatio !== 'original' ? (
                            <div className="flex flex-col gap-3">
                                <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#0A0A0C]">
                                    <div className="relative inline-block">
                                        <img src={activeItem.preview} alt={activeItem.originalName} className="max-h-[30rem] w-auto object-contain" />
                                        <div className="absolute inset-0 bg-black/60" />
                                        <div
                                            className="absolute border border-primary-500 shadow-[0_0_15px_rgba(var(--color-primary-500),0.2)]"
                                            style={{
                                                left: `${(activeCropPreview.offsetX / activeItem.sourceWidth!) * 100}%`,
                                                top: `${(activeCropPreview.offsetY / activeItem.sourceHeight!) * 100}%`,
                                                width: `${(activeCropPreview.width / activeItem.sourceWidth!) * 100}%`,
                                                height: `${(activeCropPreview.height / activeItem.sourceHeight!) * 100}%`,
                                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[12px] border border-white/[0.06] bg-[#0A0A0C] p-3">
                                    <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        Recorte efectivo <span className="text-white bg-white/5 px-1.5 py-0.5 rounded border border-white/[0.07]">{activeCropPreview.width}x{activeCropPreview.height}</span>
                                    </div>
                                    <button
                                        onClick={() => onOpenCropEditor()}
                                        className="inline-flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-500/5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-primary-500 transition-colors hover:bg-primary-500/10"
                                    >
                                        <Wand2 size={13} />
                                        Ajustar manualmente
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-[12px] border border-dashed border-white/[0.07] text-center">
                                <Crop size={22} className="mb-3 text-zinc-700" />
                                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Sin recorte activo</p>
                                <p className="mt-2 max-w-[280px] text-[11px] font-mono leading-relaxed text-zinc-600">Activa la operación de recorte y elige una relación para ver la máscara.</p>
                            </div>
                        )
                    ) : null}

                    {previewTab === 'result' ? (
                        activeItemDownloadable ? (
                            <div className="flex flex-col gap-3">
                                <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#0A0A0C]">
                                    <img
                                        src={activeIsDirect ? activeItem.preview : activeItem.resultPreview || activeItem.preview}
                                        alt={`${activeItem.originalName} resultado`}
                                        className="max-h-[30rem] w-auto object-contain"
                                    />
                                </div>
                                <div className="shrink-0 rounded-[12px] border border-white/[0.06] bg-[#0A0A0C] p-3 text-[11px] font-mono text-zinc-500 text-center tracking-wide">
                                    {activeIsDirect
                                        ? 'Modo directo: se descargará el original con el nombre final.'
                                        : 'Artefacto final disponible para descarga.'}
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-[12px] border border-dashed border-white/[0.07] text-center">
                                <Sparkles size={22} className="mb-3 text-zinc-700" />
                                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Aún no hay resultado</p>
                                <p className="mt-2 max-w-[280px] text-[11px] font-mono leading-relaxed text-zinc-600">Procesa la imagen para obtener el preview final.</p>
                            </div>
                        )
                    ) : null}

                    {previewTab === 'compare' ? (
                        activeItem.resultPreview && !activeIsDirect ? (
                            <div className="relative flex h-full min-h-[200px] items-center justify-center overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#0A0A0C]">
                                <BeforeAfterSlider before={activeItem.preview} after={activeItem.resultPreview} alt={activeItem.originalName} />
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-[12px] border border-dashed border-white/[0.07] text-center">
                                <Eye size={22} className="mb-3 text-zinc-700" />
                                <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Comparación no disponible</p>
                                <p className="mt-2 max-w-[280px] text-[11px] font-mono leading-relaxed text-zinc-600">Aparece cuando exista un resultado procesado distinto del original.</p>
                            </div>
                        )
                    ) : null}

                    {/* Overrides & Summary — compact grid */}
                    <div className="grid gap-4 border-t border-white/[0.06] pt-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                        <div className="rounded-[14px] border border-white/[0.06] bg-[#0A0A0C] p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Ajustes de imagen</p>
                                {activeItem.overrides.presetId && (
                                    <button
                                        onClick={() => onClearPresetOverride(activeItem.id)}
                                        className="rounded-md border border-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-500 transition-colors hover:text-zinc-200"
                                    >
                                        Limpiar
                                    </button>
                                )}
                            </div>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                <label className="block space-y-1.5">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Nombre final</span>
                                    <input
                                        type="text"
                                        value={activeItem.overrides.customFilename}
                                        onChange={(e) => onUpdateCustomFilename(activeItem.id, e.target.value)}
                                        placeholder="Opcional"
                                        className="w-full rounded-lg border border-white/[0.07] bg-[#111114] px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors focus:border-white/20"
                                    />
                                </label>
                                <label className="block space-y-1.5">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">Preset local</span>
                                    <select
                                        value={activeItem.overrides.presetId || ''}
                                        onChange={(e) => onUpdatePresetOverride(activeItem.id, (e.target.value || null) as PresetId | null)}
                                        className="w-full appearance-none rounded-lg border border-white/[0.07] bg-[#111114] px-3 py-2 text-[11px] font-mono text-white outline-none transition-colors focus:border-white/20"
                                    >
                                        <option value="" className="bg-[#0a0a0a]">Global (sin override)</option>
                                        {IMAGE_OPTIMIZER_PRESETS.map((preset) => (
                                            <option key={preset.id} value={preset.id} className="bg-[#0a0a0a] text-white">{preset.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.07] bg-[#111114] px-3 py-2.5 transition-colors hover:bg-white/5">
                                    <span className="text-[11px] font-mono text-zinc-300">Omitir compresión</span>
                                    <input
                                        type="checkbox"
                                        checked={activeItem.overrides.skipCompression}
                                        onChange={(e) => onToggleSkipCompression(activeItem.id, e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-white/10 bg-[#0d0d0d] text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                                    />
                                </label>
                                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.07] bg-[#111114] px-3 py-2.5 transition-colors hover:bg-white/5">
                                    <span className="text-[11px] font-mono text-red-400">Excluir del lote</span>
                                    <input
                                        type="checkbox"
                                        checked={activeItem.excluded}
                                        onChange={(e) => onToggleExcluded(activeItem.id, e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-white/10 bg-[#0d0d0d] text-red-500 focus:ring-red-500 focus:ring-offset-0"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2.5 rounded-[14px] border border-white/[0.06] bg-[#0A0A0C] p-4 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                            <p className="text-[11px] text-zinc-300">Salida estimada</p>
                            <p className="break-all rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 font-mono text-[11px] normal-case tracking-normal text-zinc-200">{activeItemOutputName}</p>
                            <div className="space-y-1.5 pt-1">
                                <p className="flex items-center justify-between gap-2">Modo: <span className="text-right text-zinc-300 normal-case tracking-normal">{primaryActionLabel}</span></p>
                                <p className="flex items-center justify-between gap-2">Directa: <span className="text-right text-zinc-300 normal-case tracking-normal">{activeIsDirect ? 'Sí' : 'No'}</span></p>
                            </div>
                            {activeItem.error && (
                                <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-[10px] font-mono normal-case tracking-normal text-red-400">{activeItem.error}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
