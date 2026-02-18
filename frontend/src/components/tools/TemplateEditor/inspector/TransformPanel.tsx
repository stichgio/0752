import React from 'react';
import { TemplateElement } from '../canvasTypes';
import { Move, Maximize, RotateCcw, Eye } from 'lucide-react';

interface TransformPanelProps {
    element: TemplateElement;
    onUpdate: (id: string, updates: Partial<TemplateElement>) => void;
}

export function TransformPanel({ element, onUpdate }: TransformPanelProps) {
    const handleChange = (key: string, value: number) => {
        if (key === 'x' || key === 'y') {
            onUpdate(element.id, { position: { ...element.position, [key]: value } });
        } else if (key === 'width' || key === 'height') {
            onUpdate(element.id, { size: { ...element.size, [key]: Math.max(1, value) } });
        } else if (key === 'rotation') {
            onUpdate(element.id, { rotation: value });
        } else if (key === 'opacity') {
            onUpdate(element.id, { style: { ...element.style, opacity: Math.min(1, Math.max(0, value)) } });
        }
    };

    return (
        <div className="px-3 py-3 border-b border-neutral-100 space-y-3">
            {/* Position */}
            <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                    <Move size={10} className="text-neutral-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Posición</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <NumInput label="X" value={element.position.x} onChange={(v) => handleChange('x', v)} suffix="mm" />
                    <NumInput label="Y" value={element.position.y} onChange={(v) => handleChange('y', v)} suffix="mm" />
                </div>
            </div>

            {/* Size */}
            <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                    <Maximize size={10} className="text-neutral-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Tamaño</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <NumInput label="W" value={element.size.width} onChange={(v) => handleChange('width', v)} suffix="mm" />
                    <NumInput label="H" value={element.size.height} onChange={(v) => handleChange('height', v)} suffix="mm" />
                </div>
            </div>

            {/* Rotation & Opacity */}
            <div className="grid grid-cols-2 gap-1.5">
                <div>
                    <div className="flex items-center gap-1 mb-1.5">
                        <RotateCcw size={10} className="text-neutral-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Rotación</span>
                    </div>
                    <NumInput label="°" value={Math.round(element.rotation || 0)} onChange={(v) => handleChange('rotation', v)} step={1} />
                </div>
                <div>
                    <div className="flex items-center gap-1 mb-1.5">
                        <Eye size={10} className="text-neutral-400" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Opacidad</span>
                    </div>
                    <NumInput label="%" value={Math.round((element.style.opacity ?? 1) * 100)} onChange={(v) => handleChange('opacity', v / 100)} step={5} min={0} max={100} />
                </div>
            </div>
        </div>
    );
}

function NumInput({
    label,
    value,
    onChange,
    step = 1,
    min,
    max,
    suffix,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    step?: number;
    min?: number;
    max?: number;
    suffix?: string;
}) {
    return (
        <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400 focus-within:border-violet-400">
            <span className="text-[10px] font-semibold text-neutral-400 px-1.5 select-none">{label}</span>
            <input
                type="number"
                value={Math.round(value * 100) / 100}
                onChange={(e) => onChange(Number(e.target.value))}
                step={step}
                min={min}
                max={max}
                className="w-full h-full bg-transparent text-xs text-neutral-700 px-0.5 focus:outline-none appearance-textfield"
                style={{ MozAppearance: 'textfield' } as any}
            />
            {suffix && <span className="text-[9px] text-neutral-400 pr-1.5 select-none">{suffix}</span>}
        </div>
    );
}
