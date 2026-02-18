import React, { useMemo } from 'react';
import { TemplateElement } from '../canvasTypes';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Layers } from 'lucide-react';
import {
    Type, Heading, Image, Square, Circle, Minus,
    Table, PenTool, Braces, LayoutGrid, Box, SeparatorHorizontal, QrCode,
} from 'lucide-react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
    text: <Type size={12} />,
    heading: <Heading size={12} />,
    variable: <Braces size={12} />,
    image: <Image size={12} />,
    logo: <Image size={12} />,
    rectangle: <Square size={12} />,
    circle: <Circle size={12} />,
    line: <Minus size={12} />,
    shape: <Square size={12} />,
    divider: <SeparatorHorizontal size={12} />,
    qr: <QrCode size={12} />,
    table: <Table size={12} />,
    'photo-grid': <LayoutGrid size={12} />,
    signature: <PenTool size={12} />,
    container: <Box size={12} />,
};

interface LayersPanelProps {
    elements: TemplateElement[];
    selectedIds: string[];
    onSelect: (id: string, multi: boolean) => void;
    onToggleLock: (id: string) => void;
    onToggleVisible: (id: string) => void;
    onReorder: (dragIndex: number, hoverIndex: number) => void;
}

export function LayersPanel({
    elements,
    selectedIds,
    onSelect,
    onToggleLock,
    onToggleVisible,
}: LayersPanelProps) {
    const sortedElements = useMemo(() => {
        return [...elements].sort((a, b) => (b.style.zIndex || 0) - (a.style.zIndex || 0));
    }, [elements]);

    if (elements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center mb-2">
                    <Layers size={18} className="text-neutral-300" />
                </div>
                <p className="text-sm text-neutral-400">No hay capas</p>
                <p className="text-xs text-neutral-300 mt-0.5">Añade elementos desde la paleta</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col p-1.5 space-y-0.5">
            {sortedElements.map((el, index) => {
                const isSelected = selectedIds.includes(el.id);
                const isHidden = el.visible === false;
                const isLocked = !!el.locked;

                return (
                    <div
                        key={el.id}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all ${isSelected
                                ? 'bg-violet-50 ring-1 ring-violet-200 text-violet-800'
                                : 'hover:bg-neutral-50 text-neutral-600'
                            } ${isHidden ? 'opacity-40' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(el.id, e.shiftKey || e.ctrlKey);
                        }}
                    >
                        <GripVertical size={12} className="text-neutral-300 cursor-grab flex-shrink-0" />

                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-violet-100 text-violet-600' : 'bg-neutral-100 text-neutral-400'
                            }`}>
                            {TYPE_ICONS[el.type] || <Box size={12} />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-[11px] leading-tight">{el.name || el.type}</div>
                            <div className="text-[9px] text-neutral-400 leading-tight">z: {el.style.zIndex || 0}</div>
                        </div>

                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleVisible(el.id); }}
                            className={`p-0.5 rounded transition-colors flex-shrink-0 ${isHidden ? 'text-red-400 hover:text-red-600' : 'text-neutral-300 hover:text-neutral-600'
                                }`}
                            title={isHidden ? 'Mostrar' : 'Ocultar'}
                        >
                            {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }}
                            className={`p-0.5 rounded transition-colors flex-shrink-0 ${isLocked ? 'text-amber-500 hover:text-amber-600' : 'text-neutral-300 hover:text-neutral-600'
                                }`}
                            title={isLocked ? 'Desbloquear' : 'Bloquear'}
                        >
                            {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
