import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  FileCode2, FileJson, Plus, Printer,
  Redo2, Save, Send, Undo2, X, Eye, Download, Upload, History,
  MoreHorizontal,
} from 'lucide-react';
import type { CanvasDocument, PageSettings } from './canvasTypes';
import {
  createDefaultPageSettings,
  createEmptyDocument,
  normalizePageSettings,
  normalizeVariableRegistry,
} from './canvasTypes';
import { buildDataPreviewFromReport } from './dataPreview';
import CanvasEditor from './CanvasEditor';
import { exportToJinja2, exportToJSON, importFromJSON, generatePreviewHtml } from './exportUtils';
import { ensureCanvasDocument } from './documentModel';
import { useUndoableState } from './hooks/useUndoableState';
import type { CanvasChangeOptions } from './historyTypes';
import { templateEditorApi, canvasDocumentToTemplateJson } from './api';
import { apiClient } from '@/utils/apiClient';
import { downloadBlob } from '@/utils/downloadBlob';
import ReportGenerator from './ReportGenerator';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui';

const SESSION_KEY = 'canvas-editor-session-v1';
const DEFAULT_REPORT_TYPE = 'technical-report';

function isSamePageSettings(a: PageSettings, b: PageSettings): boolean {
  return (
    a.format === b.format &&
    a.orientation === b.orientation &&
    a.width === b.width &&
    a.height === b.height &&
    a.margins.top === b.margins.top &&
    a.margins.right === b.margins.right &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    (a.backgroundColor || '#ffffff') === (b.backgroundColor || '#ffffff')
  );
}

function normalizeDocument(doc: CanvasDocument): CanvasDocument {
  return ensureCanvasDocument({
    ...doc,
    reportType: doc.reportType || DEFAULT_REPORT_TYPE,
    pageSettings: normalizePageSettings(doc.pageSettings),
    variables: normalizeVariableRegistry(doc.variables),
  });
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Toast ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Status pill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

type PublishStatus = 'draft' | 'published' | 'archived';

const STATUS_LABEL: Record<PublishStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
};

const OVERFLOW_MENU_ITEM_CLASS = 'flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100';

const StatusPill = memo(function StatusPill({ status, compact }: { status: PublishStatus; compact?: boolean }) {
  const cls: Record<PublishStatus, string> = {
    draft: 'bg-amber-400/[0.14] text-amber-900/90',
    published: 'bg-emerald-500/[0.12] text-emerald-800',
    archived: 'bg-neutral-100 text-neutral-600',
  };
  const size = compact
    ? 'h-6 px-2 text-[10px]'
    : 'h-7 px-2.5 text-[11px]';
  return (
    <span className={`inline-flex items-center rounded-full font-medium tracking-tight ${size} ${cls[status]}`}>
      <span className={`rounded-full bg-current opacity-80 ${compact ? 'mr-1 h-1 w-1' : 'mr-1.5 h-1.5 w-1.5'}`} />
      {STATUS_LABEL[status]}
    </span>
  );
});

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Toolbar button ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

const ToolbarBtn = memo(function ToolbarBtn({
  children, onClick, disabled, title, iconOnly = false, className = '', variant = 'ghost',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  iconOnly?: boolean;
  className?: string;
  variant?: 'ghost' | 'soft' | 'minimal';
}) {
  const variantCls =
    variant === 'soft'
      ? 'bg-white text-neutral-600 shadow-sm ring-1 ring-neutral-200/60 hover:bg-neutral-50 hover:text-neutral-900'
      : variant === 'minimal'
        ? 'text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-900'
        : 'text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-900';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center rounded-lg text-sm font-medium outline-none transition-[color,background-color,opacity] duration-150 disabled:opacity-35 disabled:pointer-events-none touch-manipulation focus-visible:ring-2 focus-visible:ring-violet-400/40 focus-visible:ring-offset-1 ${variantCls} ${iconOnly ? 'h-9 w-9 justify-center px-0 sm:h-8 sm:w-8' : 'h-9 gap-1.5 px-2 sm:h-8 sm:gap-2 sm:px-2.5'} ${className}`.trim()}
    >
      {children}
    </button>
  );
});

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Main component ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export default function TemplateEditor() {
  const {
    present: doc,
    canUndo,
    canRedo,
    setPresent: setDocHistory,
    commitPending: commitPendingHistory,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetDocHistory,
  } = useUndoableState<CanvasDocument>(createEmptyDocument, { limit: 50 });
  const [pageSettings, setPageSettings] = useState<PageSettings>(createDefaultPageSettings);
  const [status, setStatus] = useState<PublishStatus>('draft');
  const [serverTemplateId, setServerTemplateId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [dataPreview, setDataPreview] = useState<Record<string, unknown> | undefined>(undefined);
  const [versionHistory, setVersionHistory] = useState<Array<{ version: number; status: string; author: string; createdAt: string }>>([]);
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(320);
  const [publishedTemplatesRefreshKey, setPublishedTemplatesRefreshKey] = useState(0);
  const [showUtilitiesMenu, setShowUtilitiesMenu] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const utilitiesMenuRef = useRef<HTMLDivElement>(null);
  const effectiveReportType = doc.reportType || DEFAULT_REPORT_TYPE;
  const confirmDialog = useConfirmDialog();

  const closeUtilitiesMenu = useCallback(() => {
    setShowUtilitiesMenu(false);
  }, []);

  useEffect(() => {
    if (!showUtilitiesMenu) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (utilitiesMenuRef.current && !utilitiesMenuRef.current.contains(event.target as Node)) {
        setShowUtilitiesMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showUtilitiesMenu]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Load session ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.doc?.elements) {
          const normalizedDoc = normalizeDocument(s.doc as CanvasDocument);
          resetDocHistory(normalizedDoc);
          setPageSettings(normalizedDoc.pageSettings);
          setStatus((s.status as PublishStatus) || 'draft');
          const storedTemplateId = typeof s.serverTemplateId === 'string'
            ? s.serverTemplateId
            : (typeof s.templateId === 'string' ? s.templateId : '');
          setServerTemplateId(storedTemplateId || null);
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [resetDocHistory]);

  useEffect(() => {
    const normalized = normalizePageSettings(doc.pageSettings);
    setPageSettings((prev) => (isSamePageSettings(prev, normalized) ? prev : normalized));
  }, [doc.pageSettings]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadDataPreview = async () => {
      try {
        const response = await apiClient.get<{ reports?: unknown[] }>('/api/technical-reports/reports', {
          signal: controller.signal,
        });
        const reports = Array.isArray(response.data?.reports) ? response.data.reports : [];
        if (!isActive) return;

        const firstReport = reports[0] || null;
        if (!firstReport) {
          setDataPreview(undefined);
          return;
        }

        const preview = buildDataPreviewFromReport(firstReport, effectiveReportType);
        setDataPreview(Object.keys(preview).length ? preview : undefined);
      } catch (error) {
        const requestError = error as { name?: string; code?: string };
        if (requestError?.name === 'AbortError' || requestError?.code === 'ERR_CANCELED') return;
        if (isActive) {
          setDataPreview(undefined);
        }
      }
    };

    void loadDataPreview();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [effectiveReportType]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Auto-save ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  useEffect(() => {
    setSaveState('unsaved');
    const t = setTimeout(() => {
      setSaveState('saving');
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ doc, status, serverTemplateId }));
        setSaveState('saved');
      } catch {
        setSaveState('unsaved');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [doc, status, serverTemplateId]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Warn on close ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ History management ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  const handleDocChange = useCallback((newDoc: CanvasDocument, options?: CanvasChangeOptions) => {
    if (options?.finalizeOnly) {
      commitPendingHistory();
      return;
    }

    const normalizedDoc = normalizeDocument(newDoc);

    setDocHistory(normalizedDoc, {
      commitToHistory: options?.commitToHistory !== false,
    });
    setPageSettings((prev) => (
      isSamePageSettings(prev, normalizedDoc.pageSettings)
        ? prev
        : normalizedDoc.pageSettings
    ));
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [commitPendingHistory, setDocHistory, status]);

  const handlePageSettingsChange = useCallback((nextPageSettings: PageSettings) => {
    const normalized = normalizePageSettings(nextPageSettings);
    setPageSettings(normalized);
    handleDocChange({
      ...doc,
      pageSettings: normalized,
      updatedAt: new Date().toISOString(),
    });
  }, [doc, handleDocChange]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    undoHistory();
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [canUndo, undoHistory, status]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    redoHistory();
    setDirty(true);
    if (status === 'published') setStatus('draft');
  }, [canRedo, redoHistory, status]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Keyboard shortcuts ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreview(false);
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Actions ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

  const newTemplate = useCallback(async () => {
    if (dirty) {
      const confirmed = await confirmDialog({
        title: 'Ã‚Â¿Descartar cambios sin guardar?',
        description: 'Se perderÃƒÂ¡n los cambios actuales de la plantilla en ediciÃƒÂ³n.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    const d = createEmptyDocument();
    resetDocHistory(d);
    setPageSettings(normalizePageSettings(d.pageSettings));
    setDirty(false);
    setStatus('draft');
    setServerTemplateId(null);
    localStorage.removeItem(SESSION_KEY);
    toast.success('Nueva plantilla creada');
  }, [confirmDialog, dirty, resetDocHistory, toast]);

  /** Load a preset or imported doc into the editor */
  const loadDocument = useCallback((newDoc: CanvasDocument) => {
    const normalizedDoc = normalizeDocument(newDoc);
    setDocHistory({
      ...normalizedDoc,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
    setPageSettings(normalizedDoc.pageSettings);
    setStatus('draft');
    setServerTemplateId(null);
    setDirty(true);
    toast.success(`Plantilla "${normalizedDoc.name}" cargada`);
  }, [setDocHistory, toast]);

  const exportHtml = useCallback(() => {
    const html = exportToJinja2(doc);
    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, `${doc.name || 'template'}.html`);
    toast.success('HTML exportado');
  }, [doc, toast]);

  const exportJson = useCallback(() => {
    const json = exportToJSON(doc);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `${doc.name || 'template'}.json`);
    toast.success('JSON exportado');
  }, [doc, toast]);

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const imported = importFromJSON(text);
      if (!imported) {
        toast.error('JSON invÃƒÂ¡lido o formato incorrecto');
      } else {
        loadDocument(imported);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = '';
  }, [loadDocument, toast]);

  const preview = useCallback(() => {
    setPreviewHtml(generatePreviewHtml(normalizeDocument(doc)));
    setShowPreview(true);
  }, [doc]);

  const saveTemplate = useCallback(async () => {
    if (!doc.elements.length) {
      toast.error('Agrega al menos un elemento antes de guardar');
      return;
    }
    try {
      const resolvedTemplateId = await templateEditorApi.upsertDraftFromCanvas({
        templateId: serverTemplateId,
        name: doc.name,
        doc,
        author: 'editor',
        role: 'editor',
        reportType: effectiveReportType,
        featureFlag: true,
      });

      const updated = {
        ...doc,
        id: resolvedTemplateId,
        updatedAt: new Date().toISOString(),
      };
      setDocHistory(updated);
      setServerTemplateId(resolvedTemplateId);
      setDirty(false);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ doc: updated, status, serverTemplateId: resolvedTemplateId }),
      );
      toast.success('Plantilla guardada en la nube');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al guardar en la nube';
      toast.error(msg);
    }
  }, [doc, effectiveReportType, serverTemplateId, status, setDocHistory, toast]);

  const publish = useCallback(async () => {
    if (!doc.elements.length) {
      toast.error('Agrega al menos un elemento antes de publicar');
      return;
    }

    try {
      const resolvedTemplateId = await templateEditorApi.upsertDraftFromCanvas({
        templateId: serverTemplateId,
        name: doc.name,
        doc,
        author: 'editor',
        role: 'editor',
        reportType: effectiveReportType,
        featureFlag: true,
      });

      const validationTemplateJson = canvasDocumentToTemplateJson(doc, effectiveReportType);
      if (validationTemplateJson) {
        const validation = await templateEditorApi.validateTemplate(resolvedTemplateId, validationTemplateJson, 'editor');
        const issues = Array.isArray(validation.issues) ? validation.issues : [];
        const firstError = issues.find((issue) => issue.level === 'error');
        if (firstError) {
          toast.error(firstError.message || 'No se pudo publicar por un error de validaciÃƒÂ³n');
          return;
        }
      }

      await templateEditorApi.updateStatus(resolvedTemplateId, 'published', 'editor');

      const nowIso = new Date().toISOString();
      const updated = {
        ...doc,
        id: resolvedTemplateId,
        status: 'published' as const,
        updatedAt: nowIso,
      };
      setDocHistory(updated);
      setStatus('published');
      setServerTemplateId(resolvedTemplateId);
      setDirty(false);
      setPublishedTemplatesRefreshKey((prev) => prev + 1);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ doc: updated, status: 'published', serverTemplateId: resolvedTemplateId }),
      );
      toast.success('Plantilla publicada correctamente');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo publicar la plantilla';
      toast.error(msg);
    }
  }, [doc, effectiveReportType, serverTemplateId, setDocHistory, toast]);

  const handleUnpublishTemplate = useCallback(async (templateId: string) => {
    await templateEditorApi.updateStatus(templateId, 'draft', 'editor');
    if (serverTemplateId && serverTemplateId === templateId) {
      setStatus('draft');
    }
    setPublishedTemplatesRefreshKey((prev) => prev + 1);
    toast.success('Plantilla despublicada correctamente');
  }, [serverTemplateId, toast]);

  const handleEditPublishedTemplate = useCallback(async (templateId: string) => {
    if (dirty) {
      const confirmed = await confirmDialog({
        title: 'Ã‚Â¿Descartar cambios y cargar la plantilla publicada?',
        description: 'La plantilla actual tiene cambios sin guardar y se reemplazarÃƒÂ¡ por la versiÃƒÂ³n publicada.',
        confirmLabel: 'Descartar y cargar',
        cancelLabel: 'Cancelar',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    try {
      const { doc: loadedDoc } = await templateEditorApi.loadPublishedForEditing(templateId);
      const normalizedDoc = normalizeDocument(loadedDoc);
      resetDocHistory(normalizedDoc);
      setPageSettings(normalizedDoc.pageSettings);
      setServerTemplateId(templateId);
      setStatus('published');
      setDirty(false);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ doc: normalizedDoc, status: 'published', serverTemplateId: templateId }),
      );
      toast.success(`Plantilla "${normalizedDoc.name}" cargada para editar`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo cargar la plantilla';
      toast.error(msg);
    }
  }, [confirmDialog, dirty, resetDocHistory, toast]);

  const loadVersionHistory = useCallback(async () => {
    if (!serverTemplateId) return;
    try {
      const raw = await templateEditorApi.getTemplateRaw(serverTemplateId) as { versions?: Array<{ version: number; status: string; author: string; createdAt: string }> };
      setVersionHistory((raw.versions || []).map((v) => ({ version: v.version, status: v.status, author: v.author, createdAt: v.createdAt })));
    } catch {
      setVersionHistory([]);
    }
  }, [serverTemplateId]);


  const rollbackToVersion = useCallback(async (version: number) => {
    if (!serverTemplateId) return;
    try {
      await templateEditorApi.rollbackTemplate(serverTemplateId, version, 'editor');
      const { doc: loadedDoc } = await templateEditorApi.loadPublishedForEditing(serverTemplateId);
      const normalizedDoc = normalizeDocument(loadedDoc);
      resetDocHistory(normalizedDoc);
      setPageSettings(normalizedDoc.pageSettings);
      setDirty(false);
      await loadVersionHistory();
      toast.success(`Se restaurÃƒÂ³ la versiÃƒÂ³n ${version}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo restaurar la versiÃƒÂ³n';
      toast.error(msg);
    }
  }, [loadVersionHistory, resetDocHistory, serverTemplateId, toast]);

  const handleDeletePublishedTemplate = useCallback(async (templateId: string) => {
    try {
      await templateEditorApi.delete(templateId);
      if (serverTemplateId && serverTemplateId === templateId) {
        setServerTemplateId(null);
        setStatus('draft');
      }
      setPublishedTemplatesRefreshKey((prev) => prev + 1);
      toast.success('Plantilla eliminada correctamente');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo eliminar la plantilla';
      toast.error(msg);
    }
  }, [serverTemplateId, toast]);

  return (
    <div className="template-editor-root flex h-full min-h-0 w-full flex-col bg-neutral-50">
      {/* Header */}
      <header className="z-50 flex-shrink-0 border-b border-neutral-100 bg-white/80 px-3 py-2.5 backdrop-blur-md pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:py-3">
        <div className="mx-auto flex max-w-[1920px] flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex items-center justify-between gap-3 lg:contents">
              <img
                src="https://res.cloudinary.com/dzhp64paw/image/upload/v1771449784/logo_xipfod.png"
                alt="Logo"
                className="h-7 w-auto flex-shrink-0 object-contain opacity-90 lg:h-8"
              />
              <div
                className="flex shrink-0 items-center gap-2 lg:hidden"
                title={dirty ? 'Hay cambios sin guardar' : undefined}
              >
                <StatusPill status={status} compact />
                {dirty && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Cambios sin guardar" />
                )}
              </div>
            </div>

            <div className="flex min-w-0 w-full max-w-full flex-1 items-center gap-1 rounded-xl border border-neutral-200/60 bg-neutral-50/50 px-2 py-1 transition-colors focus-within:border-violet-300/50 focus-within:bg-white sm:gap-2 sm:py-1.5 lg:max-w-[min(100%,520px)]">
              <button
                type="button"
                onClick={newTemplate}
                title="Nueva plantilla en blanco"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100/60 active:scale-[0.98] touch-manipulation sm:h-8 sm:px-2.5"
              >
                <Plus size={17} strokeWidth={2.25} className="shrink-0" />
                <span className="max-[340px]:sr-only">Nuevo</span>
              </button>

              <div className="hidden h-4 w-px shrink-0 bg-neutral-200 sm:block" aria-hidden />

              <div className="min-w-0 flex-1 sm:min-w-[140px] sm:max-w-[320px]">
                <input
                  className="h-8 w-full min-w-0 border-0 bg-transparent px-1 text-[15px] font-semibold leading-tight tracking-tight text-neutral-800 placeholder:text-neutral-400 placeholder:font-medium placeholder:tracking-normal outline-none sm:text-sm"
                  value={doc.name}
                  onChange={(e) => handleDocChange({ ...doc, name: e.target.value })}
                  placeholder="Nueva plantilla"
                  title="Nombre de plantilla"
                  enterKeyHint="done"
                />
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:flex-nowrap lg:items-center lg:gap-2">
            <div
              className="hidden items-center gap-2 lg:flex"
              title={dirty ? 'Hay cambios sin guardar' : undefined}
            >
              <StatusPill status={status} />
              {dirty && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Cambios sin guardar" />
              )}
            </div>

            <div
              className="flex w-full min-w-0 items-stretch gap-1 rounded-xl bg-neutral-100/40 p-1 lg:w-auto lg:items-center lg:rounded-none lg:bg-transparent lg:p-0"
              role="toolbar"
              aria-label="Acciones de plantilla"
            >
              <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] lg:flex-initial lg:overflow-visible">
                <div className="flex w-max min-h-[2.25rem] items-center gap-0.5 pr-1 lg:min-h-0 lg:gap-1 lg:pr-0">
                  <div className="mr-0.5 flex items-center gap-0 rounded-lg bg-white/70 p-0.5 ring-1 ring-neutral-200/40 lg:bg-neutral-100/50 lg:ring-0">
                    <ToolbarBtn onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" iconOnly variant="minimal">
                      <Undo2 size={15} strokeWidth={2} />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)" iconOnly variant="minimal">
                      <Redo2 size={15} strokeWidth={2} />
                    </ToolbarBtn>
                  </div>

                  <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-neutral-200/80 md:block" aria-hidden />

                  <ToolbarBtn variant="minimal" onClick={preview} title="Vista previa">
                    <Eye size={16} strokeWidth={2} className="shrink-0 text-violet-600" aria-hidden />
                    <span className="hidden xl:inline">Vista previa</span>
                  </ToolbarBtn>
                  <ToolbarBtn variant="minimal" onClick={() => setShowGenerator(true)} title="Generar reporte">
                    <Printer size={16} strokeWidth={2} className="shrink-0 text-neutral-600" aria-hidden />
                    <span className="hidden xl:inline">Generar reporte</span>
                  </ToolbarBtn>
                  <ToolbarBtn
                    variant="minimal"
                    onClick={saveTemplate}
                    disabled={!dirty}
                    title="Guardar en la nube"
                    className="max-sm:!w-9 max-sm:!min-w-[2.25rem] max-sm:!justify-center max-sm:!gap-0 max-sm:!px-0"
                  >
                    <Save size={16} strokeWidth={2} className={dirty ? 'shrink-0 text-emerald-600' : 'shrink-0 text-neutral-400'} aria-hidden />
                    <span className="hidden xl:inline">Guardar</span>
                  </ToolbarBtn>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1 border-l border-neutral-200/50 pl-1 lg:border-l-0 lg:pl-0">
                <div ref={utilitiesMenuRef} className="relative">
                  <ToolbarBtn
                    variant="minimal"
                    onClick={() => setShowUtilitiesMenu((prev) => !prev)}
                    title="MÃƒÆ’Ã‚Â¡s acciones"
                    iconOnly
                  >
                    <MoreHorizontal size={16} strokeWidth={2} />
                  </ToolbarBtn>

                  {showUtilitiesMenu && (
                    <div className="absolute right-0 top-full z-[70] mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_16px_36px_rgba(15,23,42,0.14)] sm:w-72">
                    <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      Herramientas
                    </div>

                    <button
                      onClick={() => {
                        closeUtilitiesMenu();
                        exportHtml();
                      }}
                      className={OVERFLOW_MENU_ITEM_CLASS}
                    >
                      <FileCode2 size={16} className="mt-0.5 flex-shrink-0 text-neutral-500" />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="font-medium text-neutral-800">Exportar HTML</span>
                        <span className="text-xs text-neutral-500">Genera la plantilla lista para backend</span>
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        closeUtilitiesMenu();
                        exportJson();
                      }}
                      className={OVERFLOW_MENU_ITEM_CLASS}
                    >
                      <FileJson size={16} className="mt-0.5 flex-shrink-0 text-neutral-500" />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="font-medium text-neutral-800">Exportar JSON</span>
                        <span className="text-xs text-neutral-500">Descarga una copia editable</span>
                      </span>
                    </button>

                    <label
                      className={`${OVERFLOW_MENU_ITEM_CLASS} cursor-pointer`}
                      title="Importar plantilla JSON"
                      onClick={() => {
                        window.setTimeout(closeUtilitiesMenu, 0);
                      }}
                    >
                      <Upload size={16} className="mt-0.5 flex-shrink-0 text-neutral-500" />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="font-medium text-neutral-800">Importar JSON</span>
                        <span className="text-xs text-neutral-500">Carga una plantilla guardada</span>
                      </span>
                      <input
                        ref={importRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportJson}
                      />
                    </label>

                    <div className="my-1 h-px bg-neutral-100" />

                    <button
                      onClick={() => {
                        closeUtilitiesMenu();
                        loadVersionHistory();
                      }}
                      className={OVERFLOW_MENU_ITEM_CLASS}
                    >
                      <History size={16} className="mt-0.5 flex-shrink-0 text-neutral-500" />
                      <span className="flex flex-col items-start leading-tight">
                        <span className="font-medium text-neutral-800">Historial</span>
                        <span className="text-xs text-neutral-500">Revisa versiones guardadas</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={publish}
                disabled={status === 'published' && !dirty}
                title={status === 'published' && !dirty ? 'Ya publicada' : 'Publicar plantilla'}
                className="ml-0.5 inline-flex h-9 min-w-[2.75rem] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-600 to-violet-700 px-3.5 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 transition hover:from-violet-500 hover:to-violet-600 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none touch-manipulation sm:h-8"
              >
                <Send size={15} strokeWidth={2.25} className="shrink-0 opacity-95" />
                <span className="max-[380px]:sr-only">
                  {status === 'published' && !dirty ? 'Publicada' : 'Publicar'}
                </span>
              </button>
            </div>
          </div>
        </div>
        </div>
      </header>

      {/* Editor body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CanvasEditor
          document={doc}
          pageSettings={pageSettings}
          onChange={handleDocChange}
          onPageSettingsChange={handlePageSettingsChange}
          dataPreview={dataPreview}
          isDirty={dirty}
          onLoadTemplate={loadDocument}
          leftSidebarWidth={leftWidth}
          rightSidebarWidth={rightWidth}
          onLeftSidebarWidthChange={setLeftWidth}
          onRightSidebarWidthChange={setRightWidth}
          activePublishedTemplateId={serverTemplateId}
          publishedTemplatesRefreshKey={publishedTemplatesRefreshKey}
          onUnpublishTemplate={handleUnpublishTemplate}
          onEditPublishedTemplate={handleEditPublishedTemplate}
          onDeletePublishedTemplate={handleDeletePublishedTemplate}
          saveState={saveState}
        />
      </div>

      {versionHistory.length > 0 && (
        <section className="border-t border-neutral-200 bg-white px-4 py-2 text-xs">
          <div>
            <h4 className="font-semibold text-neutral-700">Historial</h4>
            <ul className="mt-1 max-h-24 overflow-auto">
              {versionHistory.map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-2 text-neutral-600">
                  <span>v{v.version} - {v.status} - {v.author}</span>
                  {serverTemplateId && (
                    <button
                      type="button"
                      onClick={() => void rollbackToVersion(v.version)}
                      className="rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[min(960px,95vw)] h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={18} className="text-neutral-500" />
                <span className="font-semibold text-neutral-800">Vista Previa ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â {doc.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-400 select-none">ESC para cerrar</span>
                <button
                  onClick={exportHtml}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100 border border-neutral-200 transition-colors"
                  title="Descargar HTML"
                >
                  <Download size={13} />
                  Descargar HTML
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400"
                  title="Cerrar (ESC)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable preview area */}
            <div className="flex-1 overflow-auto bg-neutral-300">
              <iframe
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                title="Preview"
                onLoad={(e) => {
                  const iframe = e.target as HTMLIFrameElement;
                  try {
                    const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iDoc?.body) {
                      setTimeout(() => {
                        const h = iDoc.documentElement.scrollHeight || iDoc.body.scrollHeight;
                        iframe.style.height = Math.max(h, 1122) + 'px';
                      }, 100);
                    }
                  } catch { /* cross-origin fallback */ }
                }}
                style={{
                  border: 'none',
                  width: '100%',
                  display: 'block',
                  minHeight: `calc(${pageSettings.height || 297}mm + 80px)`,
                }}
              />
            </div>
          </div>
        </div>
      )}


      {/* Report Generator */}
      <ReportGenerator
        isVisible={showGenerator}
        onClose={() => setShowGenerator(false)}
      />
    </div>
  );
}




