import React, { useMemo, useState } from 'react';
import { TemplateElement } from '../canvasTypes';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Layers, ChevronRight, ChevronDown } from 'lucide-react';
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
    group: <Box size={12} />,
};

export function getElementDisplayName(element: TemplateElement, index: number): string {
    if (element.name?.trim()) return element.name;
    const typeLabels: Record<string, string> = {
        text: 'Texto', heading: 'Título', variable: 'Variable',
        image: 'Imagen', logo: 'Logo', table: 'Tabla',
        rectangle: 'Rectángulo', circle: 'Círculo', line: 'Línea',
        shape: 'Forma', divider: 'Divisor', qr: 'QR',
        'photo-grid': 'Cuadrícula', signature: 'Firma',
        container: 'Contenedor', group: 'Grupo',
    };
    const label = typeLabels[element.type] ?? element.type;
    return `${label} ${index + 1}`;
}

interface LayersPanelProps {
    elements: TemplateElement[];
    selectedIds: string[];
    onSelect: (id: string, multi: boolean) => void;
    onToggleLock: (id: string) => void;
    onToggleVisible: (id: string) => void;
    onReorder: (dragIndex: number, hoverIndex: number) => void;
    onRenameElement?: (id: string, name: string) => void;
}

export function LayersPanel({
    elements,
    selectedIds,
    onSelect,
    onToggleLock,
    onToggleVisible,
    onReorder,
    onRenameElement,
}: LayersPanelProps) {
    void onReorder;
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');

    const sortedElements = useMemo(() => {
        return [...elements].sort((a, b) => (b.style.zIndex || 0) - (a.style.zIndex || 0));
    }, [elements]);

    const handleStartEditing = (el: TemplateElement) => {
        setEditingId(el.id);
        setEditingValue(el.name ?? '');
    };

    const handleConfirmEditing = (el: TemplateElement) => {
        if (onRenameElement) {
            onRenameElement(el.id, editingValue.trim());
        }
        setEditingId(null);
        setEditingValue('');
    };

    const handleCancelEditing = () => {
        setEditingId(null);
        setEditingValue('');
    };

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
            {sortedElements.map((el, sortedIndex) => {
                const isSelected = selectedIds.includes(el.id);
                const isHidden = el.visible === false;
                const isLocked = !!el.locked;
                const isGroup = el.type === 'group';
                const isCollapsed = collapsedGroups[el.id] ?? false;
                const isEditing = editingId === el.id;
                const groupChildren = isGroup
                    ? [...(el.groupChildren || [])].sort((a, b) => (b.style.zIndex || 0) - (a.style.zIndex || 0))
                    : [];

                const displayName = getElementDisplayName(el, sortedIndex);

                return (
                    <div key={el.id} className="space-y-0.5">
                        <div
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors duration-100 ${isSelected
                                ? 'bg-violet-50 ring-1 ring-violet-200 text-violet-800'
                                : 'hover:bg-neutral-50 text-neutral-600'
                                } ${isHidden ? 'opacity-40' : ''}`}
                            onClick={(e) => {
                                if (isEditing) return;
                                e.stopPropagation();
                                onSelect(el.id, e.shiftKey || e.ctrlKey);
                            }}
                        >
                            <GripVertical size={12} className="text-neutral-300 cursor-grab flex-shrink-0" />

                            {isGroup ? (
                                <button
                                    className="p-0.5 rounded text-neutral-400 hover:text-neutral-700"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setCollapsedGroups((prev) => ({ ...prev, [el.id]: !isCollapsed }));
                                    }}
                                    title={isCollapsed ? 'Expandir grupo' : 'Colapsar grupo'}
                                >
                                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                </button>
                            ) : (
                                <div className="w-3.5" />
                            )}

                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-violet-100 text-violet-600' : 'bg-neutral-100 text-neutral-400'
                                }`}>
                                {TYPE_ICONS[el.type] || <Box size={12} />}
                            </div>

                            <div className="flex-1 min-w-0">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        autoFocus
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onBlur={() => handleConfirmEditing(el)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleConfirmEditing(el);
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                handleCancelEditing();
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm font-medium bg-white border border-blue-400 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-blue-500 w-full"
                                    />
                                ) : (
                                    <span
                                        className="truncate font-medium text-[11px] leading-tight block cursor-default"
                                        title={displayName}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            handleStartEditing(el);
                                        }}
                                    >
                                        {displayName}
                                    </span>
                                )}
                                <div className="text-[9px] text-neutral-400 leading-tight">
                                    z: {el.style.zIndex || 0}
                                    {isGroup ? ` · ${groupChildren.length} hijos` : ''}
                                </div>
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

                        {isGroup && !isCollapsed && groupChildren.map((child) => {
                            const isChildHidden = child.visible === false;
                            return (
                                <div
                                    key={`${el.id}:${child.id}`}
                                    className={`ml-8 mr-1 flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border border-dashed border-neutral-200 bg-neutral-50/70 text-neutral-500 ${isChildHidden ? 'opacity-40' : ''
                                        }`}
                                    title="Elemento hijo (se edita seleccionando el grupo)"
                                >
                                    <div className="w-4 h-4 rounded flex items-center justify-center bg-white text-neutral-400 border border-neutral-200">
                                        {TYPE_ICONS[child.type] || <Box size={10} />}
                                    </div>
                                    <div className="truncate flex-1">{child.name || child.type}</div>
                                    <span className="text-[9px] text-neutral-400">z: {child.style.zIndex || 0}</span>
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
