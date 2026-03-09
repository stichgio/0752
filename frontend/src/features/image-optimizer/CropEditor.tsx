import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, Crop, Move, RotateCw, X } from 'lucide-react';
import { CropOffset, ImageItem, AspectRatio } from './types';
import { getCropRectangle } from './utils';

interface CropEditorProps {
    image: ImageItem;
    aspectRatio: AspectRatio;
    onClose: () => void;
    onSave: (imageId: string, offset: CropOffset) => void;
}

export default function CropEditor({ image, aspectRatio, onClose, onSave }: CropEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const cropInfo = useMemo(() => {
        if (!image.sourceWidth || !image.sourceHeight) return null;
        return getCropRectangle(image.sourceWidth, image.sourceHeight, aspectRatio, image.overrides.customCropOffset);
    }, [aspectRatio, image]);

    const [offset, setOffset] = useState<CropOffset>(() => {
        if (image.overrides.customCropOffset) {
            return image.overrides.customCropOffset;
        }
        if (!cropInfo || cropInfo.cropType === 'none') {
            return { x: 0.5, y: 1 };
        }
        return cropInfo.cropType === 'vertical' ? { x: 0.5, y: 0 } : { x: 0, y: 1 };
    });

    const currentCrop = useMemo(() => {
        if (!image.sourceWidth || !image.sourceHeight || !cropInfo || cropInfo.cropType === 'none') {
            return null;
        }
        return getCropRectangle(image.sourceWidth, image.sourceHeight, aspectRatio, offset);
    }, [aspectRatio, cropInfo, image.sourceHeight, image.sourceWidth, offset]);

    const cropBoxStyle = useMemo(() => {
        if (!currentCrop || !image.sourceWidth || !image.sourceHeight) return {};
        return {
            left: `${(currentCrop.offsetX / image.sourceWidth) * 100}%`,
            top: `${(currentCrop.offsetY / image.sourceHeight) * 100}%`,
            width: `${(currentCrop.width / image.sourceWidth) * 100}%`,
            height: `${(currentCrop.height / image.sourceHeight) * 100}%`,
        };
    }, [currentCrop, image.sourceHeight, image.sourceWidth]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || !containerRef.current || !cropInfo || cropInfo.cropType === 'none') return;
        const imgElement = containerRef.current.querySelector('img');
        if (!imgElement || !image.sourceWidth || !image.sourceHeight) return;
        const imgRect = imgElement.getBoundingClientRect();

        if (cropInfo.cropType === 'vertical') {
            const relativeX = e.clientX - imgRect.left;
            const cropWidthPercent = cropInfo.width / image.sourceWidth;
            const maxOffset = 1 - cropWidthPercent;
            let nextOffset = relativeX / imgRect.width - cropWidthPercent / 2;
            nextOffset = Math.max(0, Math.min(maxOffset, nextOffset));
            setOffset((prev) => ({ ...prev, x: maxOffset > 0 ? nextOffset / maxOffset : 0.5 }));
            return;
        }

        const relativeY = e.clientY - imgRect.top;
        const cropHeightPercent = cropInfo.height / image.sourceHeight;
        const maxOffset = 1 - cropHeightPercent;
        let nextOffset = relativeY / imgRect.height - cropHeightPercent / 2;
        nextOffset = Math.max(0, Math.min(maxOffset, nextOffset));
        setOffset((prev) => ({ ...prev, y: maxOffset > 0 ? nextOffset / maxOffset : 1 }));
    }, [cropInfo, image.sourceHeight, image.sourceWidth, isDragging]);

    const handleMouseUp = useCallback(() => setIsDragging(false), []);

    const handleReset = useCallback(() => {
        if (!cropInfo || cropInfo.cropType === 'none') return;
        setOffset(cropInfo.cropType === 'vertical' ? { x: 0.5, y: 0 } : { x: 0, y: 1 });
    }, [cropInfo]);

    const handleSave = useCallback(() => {
        onSave(image.id, offset);
        onClose();
    }, [image.id, offset, onClose, onSave]);

    if (!cropInfo || cropInfo.cropType === 'none') {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/90 backdrop-blur-sm p-4"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className="flex max-h-[95vh] w-full max-w-6xl flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between rounded-xl border border-white/[0.03] bg-[#0a0a0a] px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <Crop size={16} className="text-white" />
                        <h3 className="font-mono text-[11px] uppercase tracking-widest text-white">Ajustar Recorte</h3>
                        <span className="rounded bg-[#151515] px-2 py-0.5 text-[10px] font-mono text-neutral-400 border border-white/5">{aspectRatio}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-[#0d0d0d] px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            <RotateCw size={12} />
                            Resetear
                        </button>
                        <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div
                    ref={containerRef}
                    className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.03] bg-[#0d0d0d] shadow-sm"
                    style={{ cursor: isDragging ? 'grabbing' : 'default' }}
                >
                    <div className="relative inline-block">
                        <img src={image.preview} alt={image.originalName} className="max-h-[64vh] w-auto select-none" draggable={false} />
                        <div className="pointer-events-none absolute inset-0 bg-black/70" />
                        <div
                            className="absolute cursor-grab border-[3px] border-primary-500 active:cursor-grabbing"
                            style={{ ...cropBoxStyle, boxShadow: '0 0 0 9999px rgba(0,0,0,0.7), 0 0 20px rgba(var(--color-primary-500), 0.3)' }}
                            onMouseDown={handleMouseDown}
                        >
                            <div
                                className="absolute inset-0 overflow-hidden"
                                style={{
                                    backgroundImage: `url(${image.preview})`,
                                    backgroundSize: `${(image.sourceWidth! / currentCrop!.width) * 100}% ${(image.sourceHeight! / currentCrop!.height) * 100}%`,
                                    backgroundPosition: `${currentCrop!.maxOffsetX > 0 ? (currentCrop!.offsetX / currentCrop!.maxOffsetX) * 100 : 50}% ${currentCrop!.maxOffsetY > 0 ? (currentCrop!.offsetY / currentCrop!.maxOffsetY) * 100 : 50}%`
                                }}
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="rounded-full bg-black/60 p-2.5 shadow-lg backdrop-blur-sm">
                                    <Move size={20} className="text-white" />
                                </div>
                            </div>
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
                                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
                                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
                                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-5 rounded-xl border border-white/[0.03] bg-[#0a0a0a] p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap gap-5 text-[10px] uppercase font-mono tracking-widest text-neutral-500">
                        <span className="flex items-center gap-2">Original <span className="text-white border border-white/5 bg-[#151515] px-1.5 py-0.5 rounded">{image.sourceWidth}x{image.sourceHeight}</span></span>
                        <span className="flex items-center gap-2">Resultado <span className="text-primary-400 border border-primary-500/10 bg-primary-500/5 px-1.5 py-0.5 rounded">{currentCrop?.width}x{currentCrop?.height}</span></span>
                        <span className="flex items-center gap-2">Offset <span className="text-amber-400 border border-amber-500/10 bg-amber-500/5 px-1.5 py-0.5 rounded">{cropInfo.cropType === 'vertical' ? `X ${Math.round(offset.x * 100)}%` : `Y ${Math.round(offset.y * 100)}%`}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="rounded-lg border border-white/5 bg-[#0d0d0d] px-4 py-2 text-[11px] font-mono uppercase tracking-widest text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="inline-flex items-center gap-2 rounded-lg bg-neutral-200 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-white"
                        >
                            <Check size={14} />
                            Aplicar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
