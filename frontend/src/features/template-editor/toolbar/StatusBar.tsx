import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Mouse, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

export type SaveState = 'saved' | 'saving' | 'unsaved';

interface StatusBarProps {
    zoom: number;
    onZoomChange: (z: number) => void;
    onFitPage?: () => void;
    mousePos?: { x: number; y: number };
    selectionCount: number;
    selectedElementMetrics?: { x: number; y: number; width: number; height: number } | null;
    snapEnabled: boolean;
    snapGridSize: number;
    showGrid: boolean;
    onSnapEnabledChange: (enabled: boolean) => void;
    onSnapGridSizeChange: (size: number) => void;
    onShowGridChange: (show: boolean) => void;
    saveState?: SaveState;
    showRulers?: boolean;
    onShowRulersChange?: (show: boolean) => void;
}

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200];
const SNAP_GRID_OPTIONS = [1, 2, 5, 10];

export function StatusBar({
    zoom,
    onZoomChange,
    onFitPage,
    mousePos,
    selectionCount,
    selectedElementMetrics,
    snapEnabled,
    snapGridSize,
    showGrid,
    onSnapEnabledChange,
    onSnapGridSizeChange,
    onShowGridChange,
    saveState,
    showRulers,
    onShowRulersChange,
}: StatusBarProps) {
    const [editingZoom, setEditingZoom] = useState<string | null>(null);
    const escapeRef = useRef(false);

    return (
        <div className="h-8 bg-white/90 backdrop-blur-sm border-t border-neutral-200 flex items-center justify-between px-3 text-[11px] text-neutral-500 select-none shrink-0 gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
                <button
                    className="p-0.5 hover:text-neutral-800 rounded transition-colors"
                    onClick={() => onZoomChange(Math.max(10, zoom - 10))}
                    title="Alejar"
                >
                    <ZoomOut size={13} />
                </button>

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

                <input
                    type="text"
                    className="w-12 text-center text-[11px] bg-transparent border-none outline-none
                               focus:bg-white focus:border focus:border-blue-400 focus:rounded px-1 cursor-text"
                    value={editingZoom !== null ? editingZoom : `${Math.round(zoom)}%`}
                    onChange={(e) => setEditingZoom(e.target.value)}
                    onFocus={() => setEditingZoom(String(Math.round(zoom)))}
                    onBlur={() => {
                        if (escapeRef.current) {
                            escapeRef.current = false;
                            setEditingZoom(null);
                            return;
                        }
                        if (editingZoom !== null) {
                            const parsed = parseInt(editingZoom, 10);
                            if (!isNaN(parsed) && parsed > 0) onZoomChange(parsed);
                            setEditingZoom(null);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') {
                            escapeRef.current = true;
                            setEditingZoom(null);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                />

                {onFitPage && (
                    <button
                        className="px-1.5 py-0.5 rounded text-[10px] hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
                        onClick={onFitPage}
                        title="Ajustar página al área (Ctrl+0)"
                    >
                        Fit
                    </button>
                )}

                <div className="w-px h-3 bg-neutral-200 mx-1" />

                {ZOOM_PRESETS.map((preset) => (
                    <button
                        key={preset}
                        onClick={() => onZoomChange(preset)}
                        className={`px-1 py-0.5 rounded text-[10px] transition-colors ${Math.abs(zoom - preset) < 5
                            ? 'bg-violet-100 text-violet-600 font-medium'
                            : 'hover:bg-neutral-100'
                            }`}
                    >
                        {preset}%
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-[10px] text-neutral-600">
                    <input
                        type="checkbox"
                        checked={snapEnabled}
                        onChange={(e) => onSnapEnabledChange(e.target.checked)}
                        className="rounded border-neutral-300"
                    />
                    Snap
                </label>

                <select
                    value={snapGridSize}
                    onChange={(e) => onSnapGridSizeChange(Number(e.target.value))}
                    disabled={!snapEnabled}
                    className="h-6 px-1.5 rounded border border-neutral-200 text-[10px] bg-white disabled:opacity-50"
                    title="Tamaño de grilla (mm)"
                >
                    {SNAP_GRID_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                            {size} mm
                        </option>
                    ))}
                </select>

                <button
                    onClick={() => onShowGridChange(!showGrid)}
                    className={`px-2 h-6 rounded border text-[10px] transition-colors ${showGrid
                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600'
                        }`}
                    title={showGrid ? 'Ocultar grilla' : 'Mostrar grilla'}
                >
                    Grid
                </button>

                {onShowRulersChange !== undefined && (
                    <button
                        onClick={() => onShowRulersChange(!showRulers)}
                        className={`px-2 h-6 rounded border text-[10px] transition-colors ${showRulers
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600'
                            }`}
                        title={showRulers ? 'Ocultar reglas' : 'Mostrar reglas'}
                    >
                        Reglas
                    </button>
                )}

                <div className="w-px h-3 bg-neutral-200" />

                {selectionCount > 0 && (
                    <span className="text-violet-600 font-medium">
                        {selectionCount} seleccionado{selectionCount > 1 ? 's' : ''}
                    </span>
                )}

                {selectionCount === 1 && selectedElementMetrics && (
                    <span className="font-mono text-[10px] text-neutral-700">
                        {`X: ${selectedElementMetrics.x.toFixed(1)}  Y: ${selectedElementMetrics.y.toFixed(1)}  W: ${selectedElementMetrics.width.toFixed(1)}  H: ${selectedElementMetrics.height.toFixed(1)}`}
                    </span>
                )}

                {mousePos && (
                    <span className="font-mono text-[10px]">
                        <Mouse size={10} className="inline mr-0.5" />
                        {Math.round(mousePos.x)}, {Math.round(mousePos.y)}
                    </span>
                )}

                {saveState === 'saved' && (
                    <span className="text-green-600 text-xs flex items-center gap-1">
                        <CheckCircle size={12} />
                        Guardado
                    </span>
                )}
                {saveState === 'saving' && (
                    <span className="text-gray-400 text-xs flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" />
                        Guardando…
                    </span>
                )}
                {saveState === 'unsaved' && (
                    <span className="text-amber-500 text-xs flex items-center gap-1">
                        <AlertCircle size={12} />
                        Sin guardar
                    </span>
                )}
            </div>
        </div>
    );
}
