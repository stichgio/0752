import React, { useState } from 'react';
import { ElementType, ElementPreset, BlockPreset, DEFAULT_TOOLS, TOOL_CATEGORIES } from '../canvasTypes';
import { PRESET_BLOCKS } from '../utils/presetBlocks';
import {
    Type, Heading, Image, Square, Circle, Minus,
    Table, PenTool, Braces, LayoutGrid, Box,
    SeparatorHorizontal, QrCode,
    FileText, ClipboardList, Users,
    ChevronDown, ChevronRight, Blocks,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
    Type: <Type size={18} />,
    Heading: <Heading size={18} />,
    Braces: <Braces size={18} />,
    Square: <Square size={18} />,
    Circle: <Circle size={18} />,
    Minus: <Minus size={18} />,
    Image: <Image size={18} />,
    LayoutGrid: <LayoutGrid size={18} />,
    Table: <Table size={18} />,
    PenTool: <PenTool size={18} />,
    Box: <Box size={18} />,
    SeparatorHorizontal: <SeparatorHorizontal size={18} />,
    QrCode: <QrCode size={18} />,
    FileText: <FileText size={18} />,
    ClipboardList: <ClipboardList size={18} />,
    Users: <Users size={18} />,
};

type ToolCategory = 'basic' | 'text' | 'shapes' | 'media' | 'data';

interface PaletteTool {
    key: string;
    type: ElementType;
    icon: string;
    label: string;
    category: ToolCategory;
    presetId?: ElementPreset;
}

interface ElementsPaletteProps {
    onAddElement: (type: ElementType, presetId?: ElementPreset) => void;
    onAddBlock?: (blockId: BlockPreset) => void;
}

const PRESET_TOOLS: PaletteTool[] = [
    {
        key: 'preset-photo-panel',
        type: 'photo-grid',
        icon: 'LayoutGrid',
        label: 'Panel fotografico',
        category: 'media',
        presetId: 'photo-panel',
    },
    {
        key: 'preset-technical-table',
        type: 'table',
        icon: 'Table',
        label: 'Datos tecnicos',
        category: 'data',
        presetId: 'technical-table',
    },
];

const BLOCK_SECTION_COLOR = '#6366f1';

export function ElementsPalette({ onAddElement, onAddBlock }: ElementsPaletteProps) {
    const [blocksExpanded, setBlocksExpanded] = useState(true);

    const handleDragStart = (e: React.DragEvent, type: ElementType, presetId?: ElementPreset) => {
        e.dataTransfer.setData('application/react-dnd', type);
        if (presetId) {
            e.dataTransfer.setData('application/template-editor-preset', presetId);
        }
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleBlockDragStart = (e: React.DragEvent, blockId: BlockPreset) => {
        e.dataTransfer.setData('application/template-editor-block', blockId);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const paletteTools: PaletteTool[] = [
        ...DEFAULT_TOOLS.map((tool, idx) => ({
            key: `${tool.type}-${idx}`,
            type: tool.type,
            icon: tool.icon,
            label: tool.label,
            category: tool.category,
        })),
        ...PRESET_TOOLS,
    ];

    const grouped = Object.entries(TOOL_CATEGORIES)
        .map(([key, cat]) => ({
            key,
            label: cat.label,
            color: cat.color,
            tools: paletteTools.filter((t) => t.category === key),
        }))
        .filter((g) => g.tools.length > 0);

    return (
        <div className="p-3 space-y-5">
            {/* ─── Elementos básicos (sin cambios) ─── */}
            {grouped.map((group) => (
                <div key={group.key}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            {group.label}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {group.tools.map((tool) => (
                            <div
                                key={tool.key}
                                draggable
                                onDragStart={(e) => handleDragStart(e, tool.type, tool.presetId)}
                                onClick={() => onAddElement(tool.type, tool.presetId)}
                                className="flex flex-col items-center justify-center p-2 rounded-lg border border-transparent hover:border-violet-300 hover:bg-violet-50 cursor-grab active:cursor-grabbing transition-all group/item"
                                title={`Arrastra para anadir ${tool.label}`}
                            >
                                <div
                                    className="w-8 h-8 rounded-md flex items-center justify-center mb-1 transition-colors"
                                    style={{
                                        backgroundColor: `${group.color}10`,
                                        color: group.color,
                                    }}
                                >
                                    {ICON_MAP[tool.icon] || <Box size={18} />}
                                </div>
                                <span className="text-[10px] font-medium text-neutral-500 group-hover/item:text-neutral-700 text-center leading-tight">
                                    {tool.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* ─── Bloques Prediseñados ─── */}
            <div>
                <button
                    type="button"
                    onClick={() => setBlocksExpanded((p) => !p)}
                    className="flex items-center gap-2 mb-2 px-1 w-full text-left group/header"
                >
                    <Blocks size={10} style={{ color: BLOCK_SECTION_COLOR }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex-1">
                        Bloques Prediseñados
                    </span>
                    {blocksExpanded
                        ? <ChevronDown size={12} className="text-neutral-400" />
                        : <ChevronRight size={12} className="text-neutral-400" />
                    }
                </button>

                {blocksExpanded && (
                    <div className="space-y-1.5">
                        {PRESET_BLOCKS.map((block) => (
                            <div
                                key={block.id}
                                draggable
                                onDragStart={(e) => handleBlockDragStart(e, block.id)}
                                onClick={() => onAddBlock?.(block.id)}
                                className="flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-indigo-300 hover:bg-indigo-50 cursor-grab active:cursor-grabbing transition-all group/block"
                                title={`Arrastra para anadir ${block.label}`}
                            >
                                <div
                                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                                    style={{
                                        backgroundColor: `${BLOCK_SECTION_COLOR}12`,
                                        color: BLOCK_SECTION_COLOR,
                                    }}
                                >
                                    {ICON_MAP[block.icon] || <Box size={18} />}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-semibold text-neutral-600 group-hover/block:text-neutral-800 leading-tight">
                                        {block.label}
                                    </div>
                                    <div className="text-[9px] text-neutral-400 group-hover/block:text-neutral-500 leading-tight mt-0.5 truncate">
                                        {block.description}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
