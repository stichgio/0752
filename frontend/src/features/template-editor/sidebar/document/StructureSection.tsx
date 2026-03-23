import React from 'react';
import { Plus } from 'lucide-react';
import { PagesPanel } from '../PagesPanel';
import type { CanvasDocument } from '../../canvasTypes';

interface StructureSectionProps {
  document: CanvasDocument;
  activePageId: string;
  onSetActivePage: (pageId: string) => void;
  onCreatePage: (name?: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (sourceIndex: number, targetIndex: number) => void;
}

export function StructureSection({
  document,
  activePageId,
  onSetActivePage,
  onCreatePage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
}: StructureSectionProps) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onCreatePage()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/60 py-2 text-[11px] font-semibold text-violet-600 hover:border-violet-400 hover:bg-violet-50 transition-colors"
      >
        <Plus size={13} />
        Nueva página
      </button>
      <PagesPanel
        document={document}
        activePageId={activePageId}
        onSetActivePage={onSetActivePage}
        onCreatePage={onCreatePage}
        onRenamePage={onRenamePage}
        onDuplicatePage={onDuplicatePage}
        onDeletePage={onDeletePage}
        onMovePage={onMovePage}
      />
    </div>
  );
}
