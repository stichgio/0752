import React from 'react';
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Equal,
  Lock,
  Paintbrush2,
  Trash2,
  Unlock,
} from 'lucide-react';

interface ContextToolbarProps {
  selectedCount: number;
  onAlign: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  onApplyPrimaryStyle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLockToggle: () => void;
  isLocked: boolean;
  onBringToFront: () => void;
  onSendToBack: () => void;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  canDistribute?: boolean;
}

export function ContextToolbar({
  selectedCount,
  onAlign,
  onDistribute,
  onApplyPrimaryStyle,
  onDelete,
  onDuplicate,
  onLockToggle,
  isLocked,
  onBringToFront,
  onSendToBack,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
  canDistribute,
}: ContextToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-neutral-200 bg-white/95 px-1 py-0.5 shadow-lg backdrop-blur-sm">
      <span className="select-none px-2 text-[10px] font-medium text-neutral-400">{selectedCount} sel</span>

      <Divider />

      {canGroup && (
        <button
          onClick={onGroup}
          title="Agrupar (Ctrl+G)"
          className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          Agrupar
        </button>
      )}

      {canUngroup && (
        <button
          onClick={onUngroup}
          title="Desagrupar (Ctrl+Shift+G)"
          className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          Desagrupar
        </button>
      )}

      {(canGroup || canUngroup) && <Divider />}

      <ToolBtn icon={<AlignLeft size={14} />} onClick={() => onAlign('left')} title="Alinear izquierda" />
      <ToolBtn icon={<AlignCenter size={14} />} onClick={() => onAlign('center')} title="Centro horizontal" />
      <ToolBtn icon={<AlignRight size={14} />} onClick={() => onAlign('right')} title="Alinear derecha" />

      <Divider />

      <ToolBtn icon={<AlignStartVertical size={14} />} onClick={() => onAlign('top')} title="Arriba" />
      <ToolBtn icon={<AlignCenterVertical size={14} />} onClick={() => onAlign('middle')} title="Centro vertical" />
      <ToolBtn icon={<AlignEndVertical size={14} />} onClick={() => onAlign('bottom')} title="Abajo" />

      {(canDistribute ?? selectedCount >= 3) && (
        <>
          <Divider />
          <ToolBtn icon={<Equal size={14} />} onClick={() => onDistribute('horizontal')} title="Distribuir horizontal" />
          <ToolBtn icon={<Equal size={14} className="rotate-90" />} onClick={() => onDistribute('vertical')} title="Distribuir vertical" />
        </>
      )}

      {selectedCount >= 2 && (
        <>
          <Divider />
          <ToolBtn icon={<Paintbrush2 size={14} />} onClick={onApplyPrimaryStyle} title="Aplicar estilo del primero" />
        </>
      )}

      <Divider />

      <ToolBtn icon={<ArrowUpToLine size={14} />} onClick={onBringToFront} title="Al frente" />
      <ToolBtn icon={<ArrowDownToLine size={14} />} onClick={onSendToBack} title="Al fondo" />

      <Divider />

      <ToolBtn icon={isLocked ? <Unlock size={14} /> : <Lock size={14} />} onClick={onLockToggle} title={isLocked ? 'Desbloquear' : 'Bloquear'} active={isLocked} />
      <ToolBtn icon={<Copy size={14} />} onClick={onDuplicate} title="Duplicar (Ctrl+D)" />
      <ToolBtn icon={<Trash2 size={14} />} onClick={onDelete} title="Eliminar (Del)" variant="danger" />
    </div>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-neutral-200" />;
}

function ToolBtn({ icon, onClick, title, variant, active }: { icon: React.ReactNode; onClick: () => void; title: string; variant?: 'danger'; active?: boolean }) {
  let cls = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700';
  if (variant === 'danger') cls = 'text-red-400 hover:bg-red-50 hover:text-red-600';
  if (active) cls = 'bg-violet-100 text-violet-700';

  return (
    <button onClick={onClick} title={title} className={`rounded-md p-1.5 transition-colors ${cls}`}>
      {icon}
    </button>
  );
}
