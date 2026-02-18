import React from 'react';
import { ElementType, DEFAULT_TOOLS, TOOL_CATEGORIES } from '../canvasTypes';
import {
    Type, Heading, Image, Square, Circle, Minus,
    Table, PenTool, Braces, LayoutGrid, Box,
    SeparatorHorizontal, QrCode,
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
};

interface ElementsPaletteProps {
    onAddElement: (type: ElementType) => void;
}

export function ElementsPalette({ onAddElement }: ElementsPaletteProps) {
    const handleDragStart = (e: React.DragEvent, type: ElementType) => {
        e.dataTransfer.setData('application/react-dnd', type);
        e.dataTransfer.effectAllowed = 'copy';
    };

    // Group tools by category
    const grouped = Object.entries(TOOL_CATEGORIES).map(([key, cat]) => ({
        key,
        label: cat.label,
        color: cat.color,
        tools: DEFAULT_TOOLS.filter(t => t.category === key),
    })).filter(g => g.tools.length > 0);

    return (
        <div className="p-3 space-y-5">
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
                                key={tool.type}
                                draggable
                                onDragStart={(e) => handleDragStart(e, tool.type)}
                                onClick={() => onAddElement(tool.type)}
                                className="flex flex-col items-center justify-center p-2 rounded-lg border border-transparent hover:border-violet-300 hover:bg-violet-50 cursor-grab active:cursor-grabbing transition-all group/item"
                                title={`Arrastra para añadir ${tool.label}`}
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
        </div>
    );
}
