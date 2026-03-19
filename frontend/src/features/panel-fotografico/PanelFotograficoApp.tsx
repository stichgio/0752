import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Camera,
    ChevronLeft,
    ChevronRight,
    Download,
    ImagePlus,
    Loader2,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { postBlob } from '../../utils/apiClient';

// ─── types ───────────────────────────────────────────────────────────────────

interface HeaderConfig {
    titulo: string;
    CENTRO: string;
    NIS: string;
    FECHA_TRABAJO: string;
    DIRECCIONES_AFECTADAS: string;
    DISTRITO: string;
    ESTADO: string;
    ACTIVIDAD: string;
    CUADRILLA: string;
}

interface PhotoFile {
    id: string;
    file: File;
    previewUrl: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 4;

function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

const DEFAULT_HEADER: HeaderConfig = {
    titulo: 'Panel Fotográfico',
    CENTRO: '',
    NIS: '',
    FECHA_TRABAJO: '',
    DIRECCIONES_AFECTADAS: '',
    DISTRITO: '',
    ESTADO: '',
    ACTIVIDAD: '',
    CUADRILLA: '',
};

// ─── field config ─────────────────────────────────────────────────────────────

const HEADER_FIELDS: Array<{ key: keyof HeaderConfig; label: string; wide?: boolean }> = [
    { key: 'titulo', label: 'Título del Reporte', wide: true },
    { key: 'CENTRO', label: 'Centro de Servicios' },
    { key: 'NIS', label: 'NIS' },
    { key: 'FECHA_TRABAJO', label: 'Fecha de Trabajo' },
    { key: 'DIRECCIONES_AFECTADAS', label: 'Direcciones Afectadas', wide: true },
    { key: 'DISTRITO', label: 'Distrito' },
    { key: 'ESTADO', label: 'Estado' },
    { key: 'ACTIVIDAD', label: 'Actividad', wide: true },
    { key: 'CUADRILLA', label: 'Cuadrilla' },
];

// ─── sub-components ───────────────────────────────────────────────────────────

/** Single A4 preview sheet */
function SheetPreview({
    header,
    logoLeft,
    logoRight,
    images,
    pageNum,
    totalPages,
}: {
    header: HeaderConfig;
    logoLeft: string | null;
    logoRight: string | null;
    images: PhotoFile[];
    pageNum: number;
    totalPages: number;
}) {
    const slots = Array.from({ length: CHUNK_SIZE }, (_, i) => images[i] ?? null);

    return (
        <div
            className="bg-white text-black shadow-2xl"
            style={{
                width: '210mm',
                minHeight: '297mm',
                padding: '8mm',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '10px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '20mm',
                    paddingBottom: '4mm',
                    borderBottom: '2px solid #333',
                    marginBottom: '3mm',
                    flexShrink: 0,
                }}
            >
                <div style={{ width: '55mm', height: '18mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {logoLeft ? (
                        <img src={logoLeft} alt="Logo Izquierdo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: '55mm', height: '18mm', background: '#f3f4f6', borderRadius: '4px' }} />
                    )}
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {header.titulo || 'Panel Fotográfico'}
                    </div>
                    {totalPages > 1 && (
                        <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>
                            Hoja {pageNum}/{totalPages}
                        </div>
                    )}
                </div>
                <div style={{ width: '55mm', height: '18mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {logoRight ? (
                        <img src={logoRight} alt="Logo Derecho" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: '55mm', height: '18mm', background: '#f3f4f6', borderRadius: '4px' }} />
                    )}
                </div>
            </div>

            {/* Info bar */}
            <div
                style={{
                    display: 'flex',
                    border: '1px solid #ccc',
                    marginBottom: '2mm',
                    flexShrink: 0,
                }}
            >
                {[
                    { label: 'Centro de Servicios', value: header.CENTRO },
                    { label: 'NIS', value: header.NIS },
                    { label: 'Fecha de Trabajo', value: header.FECHA_TRABAJO },
                ].map((item, idx, arr) => (
                    <div
                        key={item.label}
                        style={{
                            flex: 1,
                            padding: '1.5mm 2mm',
                            borderRight: idx < arr.length - 1 ? '1px solid #ccc' : 'none',
                        }}
                    >
                        <div style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#666' }}>
                            {item.label}:
                        </div>
                        <div style={{ fontSize: '9pt', fontWeight: 600, color: '#000' }}>
                            {item.value || '-'}
                        </div>
                    </div>
                ))}
            </div>

            {/* Localización */}
            <div style={{ marginBottom: '2mm', flexShrink: 0 }}>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0066cc', textTransform: 'uppercase', marginBottom: '2mm', paddingBottom: '2px', borderBottom: '1px solid #0066cc' }}>
                    1.0 Localización
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#333', paddingRight: '6px', whiteSpace: 'nowrap' }}>Direcciones Afectadas:</td>
                            <td colSpan={3}>{header.DIRECCIONES_AFECTADAS || '-'}</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#333', paddingRight: '6px', whiteSpace: 'nowrap' }}>Distrito:</td>
                            <td colSpan={3}>{header.DISTRITO || '-'}</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#333', paddingRight: '6px', whiteSpace: 'nowrap' }}>Estado:</td>
                            <td colSpan={3}>{header.ESTADO || '-'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Detalles de Orden de Trabajo */}
            <div style={{ marginBottom: '2mm', flexShrink: 0 }}>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0066cc', textTransform: 'uppercase', marginBottom: '2mm', paddingBottom: '2px', borderBottom: '1px solid #0066cc' }}>
                    2.0 Detalles de Orden de Trabajo
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#333', paddingRight: '6px', whiteSpace: 'nowrap', width: '20%' }}>Actividad:</td>
                            <td style={{ width: '30%' }}>{header.ACTIVIDAD || '-'}</td>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#333', paddingRight: '6px', whiteSpace: 'nowrap', paddingLeft: '8px', width: '20%' }}>Cuadrilla:</td>
                            <td>{header.CUADRILLA || '-'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Photo Grid */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0066cc', textTransform: 'uppercase', marginBottom: '2mm', paddingBottom: '2px', borderBottom: '1px solid #0066cc' }}>
                    3.0 Panel Fotográfico
                </div>
                <div
                    style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
                        gap: '2mm',
                        width: '100%',
                        height: '100%',
                        border: '1px solid #0066cc',
                        padding: '2mm',
                        minHeight: 0,
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                    }}
                >
                    {slots.map((photo, idx) => (
                        <div
                            key={idx}
                            style={{
                                background: '#f5f5f5',
                                border: '1px solid #ddd',
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                minWidth: 0,
                                minHeight: 0,
                                boxSizing: 'border-box',
                            }}
                        >
                            {photo ? (
                                <img
                                    src={photo.previewUrl}
                                    alt={`Foto ${idx + 1}`}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                        objectPosition: 'center',
                                        display: 'block',
                                    }}
                                />
                            ) : (
                                <span
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#bbb',
                                        fontSize: '10px',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    Sin imagen
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── main app ─────────────────────────────────────────────────────────────────

export default function PanelFotograficoApp() {
    const [header, setHeader] = useState<HeaderConfig>({ ...DEFAULT_HEADER });
    const [photos, setPhotos] = useState<PhotoFile[]>([]);
    const [logoLeft, setLogoLeft] = useState<{ file: File; url: string } | null>(null);
    const [logoRight, setLogoRight] = useState<{ file: File; url: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [isDraggingImages, setIsDraggingImages] = useState(false);

    const imageInputRef = useRef<HTMLInputElement>(null);
    const logoLeftRef = useRef<HTMLInputElement>(null);
    const logoRightRef = useRef<HTMLInputElement>(null);

    const chunks = chunkArray(photos, CHUNK_SIZE);
    const totalPages = chunks.length;
    const currentChunk = chunks[currentPage] ?? [];

    // ── handlers ─────────────────────────────────────────────────────────────

    const handleHeaderChange = useCallback(
        (key: keyof HeaderConfig, value: string) => {
            setHeader((prev) => ({ ...prev, [key]: value }));
        },
        []
    );

    const handleImagesAdd = useCallback((files: FileList | null) => {
        if (!files) return;
        const newPhotos: PhotoFile[] = Array.from(files).map((file) => ({
            id: `${Date.now()}-${Math.random()}`,
            file,
            previewUrl: URL.createObjectURL(file),
        }));
        setPhotos((prev) => {
            const updated = [...prev, ...newPhotos];
            return updated;
        });
    }, []);

    const handleRemovePhoto = useCallback(
        (id: string) => {
            setPhotos((prev) => {
                const updated = prev.filter((p) => p.id !== id);
                // Adjust currentPage if needed
                const newTotalPages = Math.ceil(updated.length / CHUNK_SIZE);
                if (currentPage >= newTotalPages && newTotalPages > 0) {
                    setCurrentPage(newTotalPages - 1);
                }
                return updated;
            });
        },
        [currentPage]
    );

    const handleImageDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDraggingImages(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleImagesAdd(e.dataTransfer.files);
            }
        },
        [handleImagesAdd]
    );

    const handleLogoChange = useCallback(
        (side: 'left' | 'right', files: FileList | null) => {
            if (!files?.[0]) return;
            const file = files[0];
            const url = URL.createObjectURL(file);
            if (side === 'left') setLogoLeft({ file, url });
            else setLogoRight({ file, url });
        },
        []
    );

    const handleExport = useCallback(async () => {
        if (photos.length === 0) {
            toast.error('Agrega al menos una imagen antes de exportar.');
            return;
        }
        setIsExporting(true);
        try {
            const formData = new FormData();
            formData.append('header_config', JSON.stringify(header));
            photos.forEach((p) => formData.append('images', p.file, p.file.name));
            if (logoLeft) formData.append('logoLeft', logoLeft.file, logoLeft.file.name);
            if (logoRight) formData.append('logoRight', logoRight.file, logoRight.file.name);

            const blob = await postBlob('/api/panel-fotografico/render-pdf', formData, 120000);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'panel_fotografico.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('PDF exportado exitosamente.');
        } catch (err: unknown) {
            let message = 'Error al generar el PDF.';
            if (err instanceof Error) message = err.message;
            toast.error(message);
        } finally {
            setIsExporting(false);
        }
    }, [photos, header, logoLeft, logoRight]);

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex w-full min-h-[calc(100vh)] bg-neutral-950 text-neutral-200">
            {/* ── Sidebar ── */}
            <aside className="w-72 shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col sticky top-0 h-[calc(100vh)] z-20">
                {/* title */}
                <div className="h-14 flex items-center gap-3 px-4 border-b border-neutral-800">
                    <Camera size={18} className="text-white" />
                    <h1 className="text-sm font-semibold tracking-wide text-neutral-100"></h1>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent' }}>
                    {/* Header fields */}
                    <section>
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            Datos de Cabecera
                        </p>
                        <div className="space-y-3">
                            {/* Título del Reporte first */}
                            {(() => {
                                const { key, label } = HEADER_FIELDS[0];
                                return (
                                    <div key={key}>
                                        <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                            {label}
                                        </label>
                                        <input
                                            type="text"
                                            value={header[key]}
                                            onChange={(e) => handleHeaderChange(key, e.target.value)}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-400 transition-colors"
                                            placeholder={label}
                                        />
                                    </div>
                                );
                            })()}

                            {/* Logos block */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400 mb-1.5">
                                    Logos (opcional)
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Logo Left */}
                                    <div>
                                        <p className="text-[10px] text-neutral-500 mb-1">Izquierdo</p>
                                        <button
                                            onClick={() => logoLeftRef.current?.click()}
                                            className="w-full h-16 rounded-md border border-dashed border-neutral-700 flex items-center justify-center hover:border-neutral-400 transition-colors overflow-hidden"
                                        >
                                            {logoLeft ? (
                                                <img src={logoLeft.url} alt="Logo izq" className="h-full w-full object-contain p-1" />
                                            ) : (
                                                <Upload size={16} className="text-neutral-600" />
                                            )}
                                        </button>
                                        <input
                                            ref={logoLeftRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleLogoChange('left', e.target.files)}
                                        />
                                        {logoLeft && (
                                            <button
                                                onClick={() => setLogoLeft(null)}
                                                className="mt-1 text-[10px] text-red-400 hover:text-red-300"
                                            >
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                    {/* Logo Right */}
                                    <div>
                                        <p className="text-[10px] text-neutral-500 mb-1">Derecho</p>
                                        <button
                                            onClick={() => logoRightRef.current?.click()}
                                            className="w-full h-16 rounded-md border border-dashed border-neutral-700 flex items-center justify-center hover:border-neutral-400 transition-colors overflow-hidden"
                                        >
                                            {logoRight ? (
                                                <img src={logoRight.url} alt="Logo der" className="h-full w-full object-contain p-1" />
                                            ) : (
                                                <Upload size={16} className="text-neutral-600" />
                                            )}
                                        </button>
                                        <input
                                            ref={logoRightRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleLogoChange('right', e.target.files)}
                                        />
                                        {logoRight && (
                                            <button
                                                onClick={() => setLogoRight(null)}
                                                className="mt-1 text-[10px] text-red-400 hover:text-red-300"
                                            >
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Rest of the Header Fields */}
                            {HEADER_FIELDS.slice(1).map(({ key, label }) => (
                                <div key={key}>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        {label}
                                    </label>
                                    <input
                                        type="text"
                                        value={header[key]}
                                        onChange={(e) => handleHeaderChange(key, e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-400 transition-colors"
                                        placeholder={label}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Image list */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                                Imágenes ({photos.length})
                            </p>
                        </div>
                        <label className="block w-full cursor-pointer group mb-3">
                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
                                onDragEnter={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
                                onDragLeave={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                        setIsDraggingImages(false);
                                    }
                                }}
                                onDrop={handleImageDrop}
                                className={`border border-dashed rounded-lg p-3 text-center transition-colors
                                    ${isDraggingImages ? 'border-neutral-400 bg-neutral-800' : 'border-neutral-700 hover:bg-neutral-900'}`}
                            >
                                <div className={`text-[11px] transition-colors ${isDraggingImages ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
                                    {isDraggingImages ? 'Soltar aquí' : (
                                        <span className="flex items-center justify-center gap-1.5 font-medium">
                                            <ImagePlus size={14} /> 
                                            Agregar Imágenes
                                        </span>
                                    )}
                                </div>
                            </div>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    handleImagesAdd(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        <AnimatePresence initial={false}>
                            {photos.length === 0 ? null : (
                                <div className="grid grid-cols-3 gap-1.5">
                                    {photos.map((photo, idx) => (
                                        <motion.div
                                            key={photo.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            transition={{ duration: 0.15 }}
                                            className="relative group aspect-square rounded overflow-hidden bg-neutral-800 border border-neutral-700"
                                        >
                                            <img
                                                src={photo.previewUrl}
                                                alt={`foto ${idx + 1}`}
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                onClick={() => handleRemovePhoto(photo.id)}
                                                className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={10} className="text-white" />
                                            </button>
                                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-center text-white py-0.5">
                                                {idx + 1}
                                            </span>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
                    </section>
                </div>

                {/* Export button */}
                <div className="p-4 border-t border-neutral-800">
                    <button
                        onClick={handleExport}
                        disabled={isExporting || photos.length === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold transition-colors"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Generando PDF…
                            </>
                        ) : (
                            <>
                                <Download size={16} />
                                Exportar PDF
                            </>
                        )}
                    </button>
                    {photos.length > 0 && (
                        <p className="text-[10px] text-neutral-600 text-center mt-2">
                            {totalPages} {totalPages === 1 ? 'hoja' : 'hojas'} · {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
                        </p>
                    )}
                    {photos.length > 0 && (
                        <button
                            onClick={() => {
                                photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
                                setPhotos([]);
                                setCurrentPage(0);
                            }}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-700 text-neutral-500 hover:text-red-400 hover:border-red-800 text-xs transition-colors"
                        >
                            <Trash2 size={12} />
                            Limpiar todo
                        </button>
                    )}
                </div>
            </aside>

            {/* ── Preview workspace ── */}
            <main className="flex-1 flex flex-col bg-neutral-950 min-h-[calc(100vh)]">
                {/* Toolbar */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-neutral-800 shrink-0 sticky top-0 bg-neutral-950 z-10">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-neutral-400">Vista previa</span>
                        {totalPages > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono">
                                Hoja {currentPage + 1} / {totalPages}
                            </span>
                        )}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                disabled={currentPage === 0}
                                className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                                disabled={currentPage === totalPages - 1}
                                className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Sheet canvas */}
                <div className="flex-1 flex items-start justify-center py-8 px-8">
                    <AnimatePresence mode="wait">
                        {totalPages === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center justify-center gap-4 text-neutral-700 mt-20"
                            >
                                <Camera size={48} strokeWidth={1} />
                                <p className="text-sm font-medium">Agrega imágenes para ver la vista previa</p>
                                <button
                                    onClick={() => imageInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black text-sm font-medium transition-colors"
                                >
                                    <ImagePlus size={15} />
                                    Agregar imágenes
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={currentPage}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                                style={{ transformOrigin: 'top center' }}
                            >
                                <div
                                    style={{
                                        transform: 'scale(1)',
                                        transformOrigin: 'top center',
                                    }}
                                >
                                    <SheetPreview
                                        header={header}
                                        logoLeft={logoLeft?.url ?? null}
                                        logoRight={logoRight?.url ?? null}
                                        images={currentChunk}
                                        pageNum={currentPage + 1}
                                        totalPages={totalPages}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
