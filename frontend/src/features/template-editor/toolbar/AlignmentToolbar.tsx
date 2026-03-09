import React from 'react';
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
} from 'lucide-react';
import type { AlignAxis } from '../documentModel';
import type { TemplateElement } from '../canvasTypes';

export type { AlignAxis };

export interface AlignmentToolbarProps {
  selectedIds: string[];
  elements: TemplateElement[];
  onAlign: (ids: string[], axis: AlignAxis) => void;
  onDistribute: (ids: string[], direction: 'horizontal' | 'vertical') => void;
  /** true when 3+ elements are selected */
  canDistribute: boolean;
}

export function AlignmentToolbar({
  selectedIds,
  onAlign,
  onDistribute,
  canDistribute,
}: AlignmentToolbarProps) {
  if (selectedIds.length < 2) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1 flex items-center gap-0.5">
      {/* Group 1: align horizontal */}
      <AlignBtn
        icon={<AlignLeft size={14} />}
        onClick={() => onAlign(selectedIds, 'left')}
        title="Align left"
      />
      <AlignBtn
        icon={<AlignCenter size={14} />}
        onClick={() => onAlign(selectedIds, 'center-h')}
        title="Align center horizontal"
      />
      <AlignBtn
        icon={<AlignRight size={14} />}
        onClick={() => onAlign(selectedIds, 'right')}
        title="Align right"
      />

      <ToolbarDivider />

      {/* Group 2: align vertical */}
      <AlignBtn
        icon={<AlignStartVertical size={14} />}
        onClick={() => onAlign(selectedIds, 'top')}
        title="Align top"
      />
      <AlignBtn
        icon={<AlignCenterVertical size={14} />}
        onClick={() => onAlign(selectedIds, 'center-v')}
        title="Align center vertical"
      />
      <AlignBtn
        icon={<AlignEndVertical size={14} />}
        onClick={() => onAlign(selectedIds, 'bottom')}
        title="Align bottom"
      />

      {/* Group 3: distribute (only shown when 3+ elements) */}
      {canDistribute && (
        <>
          <ToolbarDivider />
          <AlignBtn
            icon={<AlignHorizontalDistributeCenter size={14} />}
            onClick={() => onDistribute(selectedIds, 'horizontal')}
            title="Distribute horizontal"
          />
          <AlignBtn
            icon={<AlignVerticalDistributeCenter size={14} />}
            onClick={() => onDistribute(selectedIds, 'vertical')}
            title="Distribute vertical"
          />
        </>
      )}
    </div>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-gray-200" />;
}

function AlignBtn({
  icon,
  onClick,
  title,
  disabled,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
    >
      {icon}
    </button>
  );
}
