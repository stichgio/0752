import React from 'react';
import {
    AlignLeft, AlignCenter, AlignRight,
    AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    Trash2, Copy, Lock, Unlock,
    ArrowUpToLine, ArrowDownToLine,
} from 'lucide-react';

interface ContextToolbarProps {
    selectedCount: number;
    onAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onLockToggle: () => void;
    isLocked: boolean;
    onBringToFront: () => void;
    onSendToBack: () => void;
}

export function ContextToolbar({
    selectedCount,
    onAlign,
    onDelete,
    onDuplicate,
    onLockToggle,
    isLocked,
    onBringToFront,
    onSendToBack,
}: ContextToolbarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-neutral-200 px-1 py-0.5">
            <span className="text-[10px] font-medium text-neutral-400 px-2 select-none">
                {selectedCount} sel
            </span>

            <Divider />

            <ToolBtn icon={<AlignLeft size={14} />} onClick={() => onAlign('left')} title="Alinear Izquierda" />
            <ToolBtn icon={<AlignCenter size={14} />} onClick={() => onAlign('center')} title="Centro H" />
            <ToolBtn icon={<AlignRight size={14} />} onClick={() => onAlign('right')} title="Alinear Derecha" />

            <Divider />

            <ToolBtn icon={<AlignStartVertical size={14} />} onClick={() => onAlign('top')} title="Arriba" />
            <ToolBtn icon={<AlignCenterVertical size={14} />} onClick={() => onAlign('middle')} title="Centro V" />
            <ToolBtn icon={<AlignEndVertical size={14} />} onClick={() => onAlign('bottom')} title="Abajo" />

            <Divider />

            <ToolBtn icon={<ArrowUpToLine size={14} />} onClick={onBringToFront} title="Al frente" />
            <ToolBtn icon={<ArrowDownToLine size={14} />} onClick={onSendToBack} title="Al fondo" />

            <Divider />

            <ToolBtn
                icon={isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                onClick={onLockToggle}
                title={isLocked ? 'Desbloquear' : 'Bloquear'}
                active={isLocked}
            />
            <ToolBtn icon={<Copy size={14} />} onClick={onDuplicate} title="Duplicar (Ctrl+D)" />
            <ToolBtn icon={<Trash2 size={14} />} onClick={onDelete} title="Eliminar (Del)" variant="danger" />
        </div>
    );
}

function Divider() {
    return <div className="w-px h-5 bg-neutral-200 mx-0.5" />;
}

function ToolBtn({
    icon,
    onClick,
    title,
    variant,
    active,
}: {
    icon: React.ReactNode;
    onClick: () => void;
    title: string;
    variant?: 'danger';
    active?: boolean;
}) {
    let cls = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700';
    if (variant === 'danger') cls = 'text-red-400 hover:bg-red-50 hover:text-red-600';
    if (active) cls = 'bg-violet-100 text-violet-700';

    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-1.5 rounded-md transition-colors ${cls}`}
        >
            {icon}
        </button>
    );
}
