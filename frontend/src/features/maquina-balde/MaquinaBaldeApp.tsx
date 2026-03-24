import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft,
    ChevronRight,
    Download,
    ImagePlus,
    Loader2,
    Trash2,
    Upload,
    X,
    PaintBucket,
    FileText,
    MapPin,
    ClipboardList,
    ImageIcon,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { HTTP_TIMEOUTS, postBlob } from '../../utils/apiClient';

interface HeaderConfig {
    titulo: string;
    FECHA_TRABAJO: string;
    NIS: string;
    SGIO: string;
    DIRECCION: string;
    LOCALIDAD: string;
    DISTRITO: string;
    ACTIVIDAD: string;
}

interface PhotoFile {
    id: string;
    file: File;
    previewUrl: string;
}

const CHUNK_SIZE = 4;

function chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

const DEFAULT_HEADER: HeaderConfig = {
    titulo: 'Maquina de Balde',
    FECHA_TRABAJO: '',
    NIS: '',
    SGIO: '',
    DIRECCION: '',
    LOCALIDAD: '',
    DISTRITO: '',
    ACTIVIDAD: '',
};

const HEADER_FIELDS: Array<{ key: keyof HeaderConfig; label: string; wide?: boolean }> = [
    { key: 'titulo', label: 'Titulo del Reporte', wide: true },
    { key: 'FECHA_TRABAJO', label: 'Fecha de Trabajo' },
    { key: 'NIS', label: 'NIS' },
    { key: 'SGIO', label: 'SGIO' },
    { key: 'DIRECCION', label: 'Direccion', wide: true },
    { key: 'LOCALIDAD', label: 'Localidad' },
    { key: 'DISTRITO', label: 'Distrito' },
    { key: 'ACTIVIDAD', label: 'Actividad', wide: true },
];

const LOCALIZACION_FIELDS = ['DIRECCION', 'LOCALIDAD', 'DISTRITO'];
const TRABAJO_FIELDS = ['ACTIVIDAD'];

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
    const validCount = images.length;
    const slots = validCount === 3 ? images : Array.from({ length: CHUNK_SIZE }, (_, i) => images[i] ?? null);

    return (
        <div
            className="bg-white text-black shadow-2xl"
            style={{
                width: '210mm',
                height: '297mm',
                padding: '8mm',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '10px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}
        >
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
                        <div style={{ width: '55mm', height: '18mm' }} />
                    )}
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {header.titulo || 'Maquina de Balde'}
                    </div>
                    {totalPages > 1 && (
                        <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>
                            Pagina {pageNum}/{totalPages}
                        </div>
                    )}
                </div>
                <div style={{ width: '55mm', height: '18mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {logoRight ? (
                        <img src={logoRight} alt="Logo Derecho" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: '55mm', height: '18mm' }} />
                    )}
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    border: '1px solid #ccc',
                    marginBottom: '2mm',
                    flexShrink: 0,
                    background: '#f5f5f5',
                }}
            >
                {[
                    { label: 'Fecha de Trabajo', value: header.FECHA_TRABAJO },
                    { label: 'NIS', value: header.NIS },
                    { label: 'SGIO', value: header.SGIO },
                ].map((item, idx, arr) => (
                    <div
                        key={item.label}
                        style={{
                            flex: 1,
                            padding: '1.5mm 2mm',
                            borderRight: idx < arr.length - 1 ? '1px solid #ccc' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1mm',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <span style={{ fontSize: '9pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>
                            {item.label}:
                        </span>
                        <span style={{ fontSize: '9pt', color: '#000' }}>
                            {item.value || '-'}
                        </span>
                    </div>
                ))}
            </div>

            <div style={{ marginBottom: '2mm', flexShrink: 0 }}>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0066cc', textTransform: 'uppercase', marginBottom: '2mm', paddingBottom: '2px', borderBottom: '1px solid #0066cc' }}>
                    1.0 Localizacion
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#000', paddingRight: '6px', whiteSpace: 'nowrap' }}>Direccion:</td>
                            <td colSpan={3}>{header.DIRECCION || '-'}</td>
                        </tr>
                        <tr>
                            <td style={{ width: '50%' }}>
                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#000', marginRight: '6px' }}>Localidad:</span>
                                <span style={{ color: '#000' }}>{header.LOCALIDAD || '-'}</span>
                            </td>
                            <td style={{ width: '50%' }}>
                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#000', marginRight: '6px' }}>Distrito:</span>
                                <span style={{ color: '#000' }}>{header.DISTRITO || '-'}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style={{ marginBottom: '2mm', flexShrink: 0 }}>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0066cc', textTransform: 'uppercase', marginBottom: '2mm', paddingBottom: '2px', borderBottom: '1px solid #0066cc' }}>
                    2.0 Detalles de Orden de Trabajo
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#000', paddingRight: '6px', whiteSpace: 'nowrap' }}>Actividad:</td>
                            <td colSpan={3}>{header.ACTIVIDAD || '-'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '9pt', fontWeight: 'bold', color: '#0066cc', textTransform: 'uppercase', marginBottom: '2mm', paddingBottom: '2px', borderBottom: '1px solid #0066cc' }}>
                    3.0 Panel Fotografico
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
                                background: '#ffffff',
                                border: '1px solid #ddd',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                minWidth: 0,
                                minHeight: 0,
                                boxSizing: 'border-box',
                                ...(validCount === 3 && idx === 2 ? { gridColumn: 'span 2', width: 'calc(50% - 1mm)', justifySelf: 'center' } : { width: '100%' })
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

export default function MaquinaBaldeApp() {
    const [header, setHeader] = useState<HeaderConfig>({ ...DEFAULT_HEADER });
    const [photos, setPhotos] = useState<PhotoFile[]>([]);
    const [logoLeft, setLogoLeft] = useState<{ file: File; url: string } | null>(null);
    const [logoRight, setLogoRight] = useState<{ file: File; url: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [isDraggingImages, setIsDraggingImages] = useState(false);
    const [openSections, setOpenSections] = useState({
        header: true,
        localizacion: true,
        trabajo: true,
        logos: true,
        imagenes: true,
    });

    const imageInputRef = useRef<HTMLInputElement>(null);
    const logoLeftRef = useRef<HTMLInputElement>(null);
    const logoRightRef = useRef<HTMLInputElement>(null);

    const toggleSection = (key: keyof typeof openSections) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const chunks = chunkArray(photos, CHUNK_SIZE);
    const totalPages = chunks.length;
    const currentChunk = chunks[currentPage] ?? [];

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
                const newTotalPages = Math.ceil(updated.length / CHUNK_SIZE);
                return updated;
            });
            setCurrentPage(0);
        },
        []
    );

    const handleLogoLeftChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoLeft({ file, url: URL.createObjectURL(file) });
        }
    }, []);

    const handleLogoRightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoRight({ file, url: URL.createObjectURL(file) });
        }
    }, []);

    const handleExport = useCallback(async () => {
        if (photos.length === 0) {
            toast.error('Agrega al menos una imagen para generar el PDF');
            return;
        }

        setIsExporting(true);
        try {
            const formData = new FormData();
            formData.append('header_config', JSON.stringify(header));
            
            photos.forEach((photo) => {
                formData.append('images', photo.file);
            });

            if (logoLeft) {
                formData.append('logo_left', logoLeft.file);
            }
            if (logoRight) {
                formData.append('logo_right', logoRight.file);
            }

            const blob = await postBlob('/api/maquina-balde/render-pdf', formData, HTTP_TIMEOUTS.LONG);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'maquina_balde.pdf';
            a.click();
            URL.revokeObjectURL(url);
            toast.success('PDF generado exitosamente');
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Error al generar el PDF');
        } finally {
            setIsExporting(false);
        }
    }, [header, photos, logoLeft, logoRight]);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDraggingImages(false);
            handleImagesAdd(e.dataTransfer.files);
        },
        [handleImagesAdd]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingImages(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingImages(false);
    }, []);

    return (
        <div className="flex w-full h-full overflow-hidden bg-neutral-950 text-neutral-200">
            <aside className="w-72 shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full z-20">
                <div className="h-14 flex items-center gap-3 px-4 border-b border-neutral-800">
                    <div className="p-2 bg-neutral-800 rounded-lg">
                        <PaintBucket size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold tracking-wide text-white">Maquina de Balde</h1>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent' }}>
                    <section>
                        <button
                            onClick={() => toggleSection('header')}
                            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 hover:text-neutral-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <FileText size={14} />
                                Datos Generales
                            </span>
                            {openSections.header ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {openSections.header && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        Titulo del Reporte
                                    </label>
                                    <input
                                        type="text"
                                        value={header.titulo}
                                        onChange={(e) => handleHeaderChange('titulo', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                        placeholder="Maquina de Balde"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-1 uppercase tracking-wide">
                                        Logos (arrastra aqui)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div
                                            className="relative"
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const file = e.dataTransfer.files?.[0];
                                                if (file) {
                                                    setLogoLeft({ file, url: URL.createObjectURL(file) });
                                                }
                                            }}
                                        >
                                            <button
                                                onClick={() => logoLeftRef.current?.click()}
                                                className={`w-full h-12 border-2 border-dashed rounded-md text-xs transition-colors flex flex-col items-center justify-center gap-1 ${
                                                    logoLeft 
                                                        ? 'border-green-600 bg-green-900/20 text-green-400' 
                                                        : 'border-neutral-600 bg-neutral-800 hover:border-neutral-500 text-neutral-400'
                                                }`}
                                            >
                                                {logoLeft ? (
                                                    <>
                                                        <span className="truncate px-1">{logoLeft.file.name}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload size={14} />
                                                        <span>Logo Izq.</span>
                                                    </>
                                                )}
                                            </button>
                                            <input
                                                ref={logoLeftRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoLeftChange}
                                                className="hidden"
                                            />
                                        </div>
                                        <div
                                            className="relative"
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const file = e.dataTransfer.files?.[0];
                                                if (file) {
                                                    setLogoRight({ file, url: URL.createObjectURL(file) });
                                                }
                                            }}
                                        >
                                            <button
                                                onClick={() => logoRightRef.current?.click()}
                                                className={`w-full h-12 border-2 border-dashed rounded-md text-xs transition-colors flex flex-col items-center justify-center gap-1 ${
                                                    logoRight 
                                                        ? 'border-green-600 bg-green-900/20 text-green-400' 
                                                        : 'border-neutral-600 bg-neutral-800 hover:border-neutral-500 text-neutral-400'
                                                }`}
                                            >
                                                {logoRight ? (
                                                    <>
                                                        <span className="truncate px-1">{logoRight.file.name}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload size={14} />
                                                        <span>Logo Der.</span>
                                                    </>
                                                )}
                                            </button>
                                            <input
                                                ref={logoRightRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoRightChange}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        Fecha de Trabajo
                                    </label>
                                    <input
                                        type="date"
                                        value={header.FECHA_TRABAJO}
                                        onChange={(e) => handleHeaderChange('FECHA_TRABAJO', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        NIS
                                    </label>
                                    <input
                                        type="text"
                                        value={header.NIS}
                                        onChange={(e) => handleHeaderChange('NIS', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                        placeholder="NIS"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        SGIO
                                    </label>
                                    <input
                                        type="text"
                                        value={header.SGIO}
                                        onChange={(e) => handleHeaderChange('SGIO', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                        placeholder="SGIO"
                                    />
                                </div>
                            </div>
                        )}
                    </section>

                    <div className="h-px bg-neutral-800" />

                    <section>
                        <button
                            onClick={() => toggleSection('localizacion')}
                            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 hover:text-neutral-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <MapPin size={14} />
                                1.0 Localizacion
                            </span>
                            {openSections.localizacion ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {openSections.localizacion && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        Direccion
                                    </label>
                                    <textarea
                                        value={header.DIRECCION}
                                        onChange={(e) => handleHeaderChange('DIRECCION', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 resize-none focus:outline-none focus:border-neutral-500 transition-colors"
                                        rows={2}
                                        placeholder="Direccion del lugar"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        Localidad
                                    </label>
                                    <input
                                        type="text"
                                        value={header.LOCALIDAD}
                                        onChange={(e) => handleHeaderChange('LOCALIDAD', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                        placeholder="Localidad"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                        Distrito
                                    </label>
                                    <input
                                        type="text"
                                        value={header.DISTRITO}
                                        onChange={(e) => handleHeaderChange('DISTRITO', e.target.value)}
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                                        placeholder="Distrito"
                                    />
                                </div>
                            </div>
                        )}
                    </section>

                    <div className="h-px bg-neutral-800" />

                    <section>
                        <button
                            onClick={() => toggleSection('trabajo')}
                            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 hover:text-neutral-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <ClipboardList size={14} />
                                2.0 Orden de Trabajo
                            </span>
                            {openSections.trabajo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {openSections.trabajo && (
                            <div>
                                <label className="block text-[10px] font-medium text-neutral-400 mb-0.5 uppercase tracking-wide">
                                    Actividad
                                </label>
                                <textarea
                                    value={header.ACTIVIDAD}
                                    onChange={(e) => handleHeaderChange('ACTIVIDAD', e.target.value)}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 resize-none focus:outline-none focus:border-neutral-500 transition-colors"
                                    rows={3}
                                    placeholder="Descripcion de la actividad realizada"
                                />
                            </div>
                        )}
                    </section>

                    <div className="h-px bg-neutral-800" />

                    <section>
                        <button
                            onClick={() => toggleSection('imagenes')}
                            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3 hover:text-neutral-300 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <ImageIcon size={14} />
                                Panel Fotografico
                                {photos.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 bg-neutral-700 text-neutral-300 rounded text-[10px]">
                                        {photos.length}
                                    </span>
                                )}
                            </span>
                            {openSections.imagenes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {openSections.imagenes && (
                            <div className="space-y-3">
                                <div
                                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                                        isDraggingImages
                                            ? 'border-neutral-500 bg-neutral-800/50'
                                            : 'border-neutral-700 hover:border-neutral-600'
                                    }`}
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onClick={() => imageInputRef.current?.click()}
                                >
                                    <ImagePlus size={20} className="mx-auto mb-2 text-neutral-500" />
                                    <p className="text-xs text-neutral-400">Arrastra imagenes o haz clic</p>
                                    <p className="text-[10px] text-neutral-600 mt-1">JPG, PNG, WEBP</p>
                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={(e) => handleImagesAdd(e.target.files)}
                                        className="hidden"
                                    />
                                </div>

                                {photos.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-neutral-500">
                                                {photos.length} imagen{photos.length !== 1 ? 'es' : ''} • {totalPages} hoja{totalPages !== 1 ? 's' : ''}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setPhotos([]);
                                                    setCurrentPage(0);
                                                }}
                                                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                                            >
                                                Limpiar todo
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {photos.slice(0, 8).map((photo, idx) => (
                                                <div key={photo.id} className="relative group">
                                                    <img
                                                        src={photo.previewUrl}
                                                        alt={`Foto ${idx + 1}`}
                                                        className="w-full aspect-square object-cover rounded border border-neutral-700"
                                                    />
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemovePhoto(photo.id);
                                                        }}
                                                        className="absolute -top-1 -right-1 p-0.5 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X size={8} className="text-white" />
                                                    </button>
                                                    {idx === 7 && photos.length > 8 && (
                                                        <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
                                                            <span className="text-[10px] text-white">+{photos.length - 8}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>

                <div className="p-4 border-t border-neutral-800">
                    <button
                        onClick={handleExport}
                        disabled={isExporting || photos.length === 0}
                        className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 border border-neutral-700"
                    >
                        {isExporting ? (
                            <><Loader2 size={16} className="animate-spin" /> Generando PDF...</>
                        ) : (
                            <><Download size={16} /> Exportar PDF</>
                        )}
                    </button>
                </div>
            </aside>

            <div className="flex-1 overflow-auto bg-neutral-950 p-6">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                            disabled={currentPage === 0 || totalPages === 0}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 text-white" />
                        </button>
                        <span className="text-sm text-neutral-400">
                            Hoja {totalPages > 0 ? currentPage + 1 : 0} de {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage >= totalPages - 1 || totalPages === 0}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                        >
                            <ChevronRight className="w-4 h-4 text-white" />
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentPage}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="flex-shrink-0"
                        >
                            <SheetPreview
                                header={header}
                                logoLeft={logoLeft?.url ?? null}
                                logoRight={logoRight?.url ?? null}
                                images={currentChunk}
                                pageNum={currentPage + 1}
                                totalPages={totalPages}
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
