import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Mouse } from 'lucide-react';

interface StatusBarProps {
    zoom: number;
    onZoomChange: (z: number) => void;
    mousePos?: { x: number; y: number };
    selectionCount: number;
}

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];

export function StatusBar({ zoom, onZoomChange, mousePos, selectionCount }: StatusBarProps) {
    return (
        <div className="h-7 bg-white/90 backdrop-blur-sm border-t border-neutral-200 flex items-center justify-between px-3 text-[11px] text-neutral-500 select-none shrink-0">
            {/* Left: Zoom Controls */}
            <div className="flex items-center gap-1.5">
                <button
                    className="p-0.5 hover:text-neutral-800 rounded transition-colors"
                    onClick={() => onZoomChange(Math.max(10, zoom - 10))}
                    title="Alejar"
                >
                    <ZoomOut size={13} />
                </button>

                {/* Zoom slider */}
                <input
                    type="range"
                    min={10}
                    max={300}
                    value={zoom}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="w-20 h-1 accent-violet-500 cursor-pointer"
                />

                <button
                    className="p-0.5 hover:text-neutral-800 rounded transition-colors"
                    onClick={() => onZoomChange(Math.min(300, zoom + 10))}
                    title="Acercar"
                >
                    <ZoomIn size={13} />
                </button>

                <button
                    className="px-1.5 py-0.5 rounded font-medium hover:bg-neutral-100 hover:text-neutral-800 transition-colors tabular-nums min-w-[40px] text-center"
                    onClick={() => onZoomChange(100)}
                    title="Ajustar a 100%"
                >
                    {Math.round(zoom)}%
                </button>

                <div className="w-px h-3 bg-neutral-200 mx-1" />

                {/* Presets */}
                {ZOOM_PRESETS.map(z => (
                    <button
                        key={z}
                        onClick={() => onZoomChange(z)}
                        className={`px-1 py-0.5 rounded text-[10px] transition-colors ${Math.abs(zoom - z) < 5
                                ? 'bg-violet-100 text-violet-600 font-medium'
                                : 'hover:bg-neutral-100'
                            }`}
                    >
                        {z}%
                    </button>
                ))}
            </div>

            {/* Right: Info */}
            <div className="flex items-center gap-3">
                {selectionCount > 0 && (
                    <span className="text-violet-600 font-medium">{selectionCount} seleccionado{selectionCount > 1 ? 's' : ''}</span>
                )}
                {mousePos && (
                    <span className="font-mono text-[10px]">
                        <Mouse size={10} className="inline mr-0.5" />
                        {Math.round(mousePos.x)}, {Math.round(mousePos.y)}
                    </span>
                )}
            </div>
        </div>
    );
}
