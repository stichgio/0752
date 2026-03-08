import { ZoomIn, ZoomOut } from 'lucide-react';

export default function ZoomControls({ zoom, onZoomChange, min = 0.15, max = 0.6, step = 0.05 }) {
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => onZoomChange(Math.max(min, zoom - step))}
                disabled={zoom <= min}
                className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
                <ZoomOut size={14} />
            </button>
            <span className="text-sm text-neutral-400 font-mono min-w-[48px] text-center">
                {Math.round(zoom * 100)}%
            </span>
            <button
                onClick={() => onZoomChange(Math.min(max, zoom + step))}
                disabled={zoom >= max}
                className="p-1.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
                <ZoomIn size={14} />
            </button>
        </div>
    );
}
