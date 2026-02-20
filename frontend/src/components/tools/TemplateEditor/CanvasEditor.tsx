import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CanvasDocument,
  TemplateElement,
  VariableDefinition,
  createElement,
  generateId,
  ElementType,
  ElementPreset,
  BlockPreset,
  PageSettings,
  normalizeVariableRegistry,
  deriveVariableDefinitionsFromElements,
} from './canvasTypes';
import { PRESET_BLOCKS } from './utils/presetBlocks';
import { SidebarRoot } from './sidebar/SidebarRoot';
import { CanvasArea } from './canvas/CanvasArea';
import { InspectorRoot } from './inspector/InspectorRoot';
import { StatusBar } from './toolbar/StatusBar';
import { ContextToolbar } from './toolbar/ContextToolbar';
import { migrateToCanvas } from './utils/elementDefaults';
import type { CanvasChangeOptions } from './historyTypes';

const CLIPBOARD_STORAGE_KEY = 'canvas_clipboard';
const SNAP_CONFIG_STORAGE_KEY = 'canvas_snap_config';
const SNAP_GRID_SIZE_OPTIONS = [1, 2, 5, 10] as const;
type SnapGridSize = (typeof SNAP_GRID_SIZE_OPTIONS)[number];

interface SnapConfig {
  enabled: boolean;
  gridSize: SnapGridSize;
  showGrid: boolean;
}

const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  gridSize: 5,
  showGrid: true,
};

function toSnapGridSize(value: unknown): SnapGridSize {
  if (typeof value !== 'number') return DEFAULT_SNAP_CONFIG.gridSize;
  if (SNAP_GRID_SIZE_OPTIONS.includes(value as SnapGridSize)) return value as SnapGridSize;
  return DEFAULT_SNAP_CONFIG.gridSize;
}

function loadSnapConfig(): SnapConfig {
  if (typeof window === 'undefined') return DEFAULT_SNAP_CONFIG;

  try {
    const raw = window.localStorage.getItem(SNAP_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_SNAP_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SnapConfig>;

    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SNAP_CONFIG.enabled,
      gridSize: toSnapGridSize(parsed.gridSize),
      showGrid: typeof parsed.showGrid === 'boolean' ? parsed.showGrid : DEFAULT_SNAP_CONFIG.showGrid,
    };
  } catch {
    return DEFAULT_SNAP_CONFIG;
  }
}

function cloneGroupChildrenWithFreshIds(children: TemplateElement[] | undefined): TemplateElement[] {
  if (!Array.isArray(children) || children.length === 0) return [];

  return children.map((child) => {
    const clonedChild: TemplateElement = JSON.parse(JSON.stringify(child));
    clonedChild.id = generateId();
    if (clonedChild.type === 'group') {
      clonedChild.children = [];
      clonedChild.groupChildren = [];
    }
    return clonedChild;
  });
}

function cloneElementWithFreshIds(source: TemplateElement): TemplateElement {
  const clone: TemplateElement = JSON.parse(JSON.stringify(source));
  clone.id = generateId();

  if (clone.type === 'group') {
    const freshGroupChildren = cloneGroupChildrenWithFreshIds(clone.groupChildren);
    clone.groupChildren = freshGroupChildren;
    clone.children = freshGroupChildren.map((child) => child.id);
  }

  return clone;
}

function getAvailableVariables(doc: CanvasDocument): VariableDefinition[] {
  const registry = normalizeVariableRegistry(doc.variables);
  if (registry.length > 0) return registry;
  return deriveVariableDefinitionsFromElements(doc.elements);
}

function createAutoVariableDefinition(existing: VariableDefinition[]): VariableDefinition {
  const existingKeys = new Set(existing.map((item) => item.key.toLocaleLowerCase('es')));
  let index = 1;
  let key = `variable_${index}`;

  while (existingKeys.has(key.toLocaleLowerCase('es'))) {
    index += 1;
    key = `variable_${index}`;
  }

  return {
    key,
    label: `Variable ${index}`,
    type: 'string',
  };
}

interface CanvasEditorProps {
  document: CanvasDocument;
  pageSettings: PageSettings;
  onChange: (doc: CanvasDocument, options?: CanvasChangeOptions) => void;
  onPageSettingsChange: (settings: PageSettings) => void;
  dataPreview?: Record<string, unknown>;
  isDirty?: boolean;
  onLoadTemplate?: (doc: CanvasDocument) => void;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  onLeftSidebarWidthChange: (width: number) => void;
  onRightSidebarWidthChange: (width: number) => void;
}

export default function CanvasEditor({
  document: doc,
  pageSettings,
  onChange,
  onPageSettingsChange,
  dataPreview,
  isDirty,
  onLoadTemplate,
  leftSidebarWidth,
  rightSidebarWidth,
  onLeftSidebarWidthChange,
  onRightSidebarWidthChange,
}: CanvasEditorProps) {
  const MIN_SIDEBAR_WIDTH = 250;
  const MAX_SIDEBAR_WIDTH = 500;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(75);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [activeResizer, setActiveResizer] = useState<'left' | 'right' | null>(null);
  const [snapConfig, setSnapConfig] = useState<SnapConfig>(() => loadSnapConfig());
  const hasMigrated = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const variableRegistry = useMemo(() => normalizeVariableRegistry(doc.variables), [doc.variables]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SNAP_CONFIG_STORAGE_KEY, JSON.stringify(snapConfig));
    } catch {
      // Persist failure should not block editing.
    }
  }, [snapConfig]);

  useEffect(() => {
    const notifyLayoutResize = () => {
      window.dispatchEvent(new Event('resize'));
    };

    const frameId = window.requestAnimationFrame(notifyLayoutResize);
    const timeoutId = window.setTimeout(notifyLayoutResize, 320);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isLeftSidebarOpen, isRightSidebarOpen, leftSidebarWidth, rightSidebarWidth]);

  const clampSidebarWidth = useCallback((value: number) => {
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(value)));
  }, []);

  const startResize = useCallback((side: 'left' | 'right', event: React.MouseEvent<HTMLDivElement>) => {
    if (!bodyRef.current) return;

    event.preventDefault();
    setActiveResizer(side);

    const containerRect = bodyRef.current.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (side === 'left') {
        const nextWidth = clampSidebarWidth(moveEvent.clientX - containerRect.left);
        onLeftSidebarWidthChange(nextWidth);
        return;
      }

      const nextWidth = clampSidebarWidth(containerRect.right - moveEvent.clientX);
      onRightSidebarWidthChange(nextWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setActiveResizer(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [clampSidebarWidth, onLeftSidebarWidthChange, onRightSidebarWidthChange]);

  useEffect(() => {
    return () => {
      if (activeResizer) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [activeResizer]);

  const handleSnapEnabledChange = useCallback((enabled: boolean) => {
    setSnapConfig(prev => ({ ...prev, enabled }));
  }, []);

  const handleSnapGridSizeChange = useCallback((gridSize: number) => {
    setSnapConfig(prev => ({ ...prev, gridSize: toSnapGridSize(gridSize) }));
  }, []);

  const handleShowGridChange = useCallback((showGrid: boolean) => {
    setSnapConfig(prev => ({ ...prev, showGrid }));
  }, []);

  const handleUpdateVariables = useCallback((variables: VariableDefinition[]) => {
    onChange({ ...doc, variables: normalizeVariableRegistry(variables) });
  }, [doc, onChange]);

  // Migration — run once
  useEffect(() => {
    if (hasMigrated.current) return;
    hasMigrated.current = true;
    const migrated = migrateToCanvas(doc.elements);
    if (JSON.stringify(migrated) !== JSON.stringify(doc.elements)) {
      onChange({ ...doc, elements: migrated });
    }
  }, []);

  // Element CRUD
  const handleUpdateElement = useCallback((id: string, updates: Partial<TemplateElement>) => {
    const newElements = doc.elements.map(el =>
      el.id === id ? { ...el, ...updates } : el
    );
    onChange({ ...doc, elements: newElements });
  }, [doc, onChange]);

  const handleUpdateElements = useCallback((updates: Map<string, Partial<TemplateElement>>) => {
    const newElements = doc.elements.map(el => {
      const u = updates.get(el.id);
      return u ? { ...el, ...u } : el;
    });
    onChange({ ...doc, elements: newElements });
  }, [doc, onChange]);

  const handleAddElement = useCallback((
    type: ElementType,
    pos?: { x: number; y: number },
    presetId?: ElementPreset,
    overrides?: Partial<TemplateElement>,
  ) => {
    const position = pos || {
      x: (pageSettings.width / 2) - 25,
      y: (pageSettings.height / 2) - 25,
    };
    const newEl = createElement(type, position, overrides);
    let nextDoc = doc;

    if (presetId === 'photo-panel') {
      newEl.name = `Panel fotografico ${Math.floor(Math.random() * 1000)}`;
      newEl.content = 'Panel fotografico';
      newEl.size = { width: 190, height: 120 };
      newEl.photoConfig = {
        count: 4,
        labels: ['ANTES', 'DURANTE', 'DESPUES', 'DETALLE'],
        showLabels: true,
        oddPosition: 'center',
      };
      newEl.style = {
        ...newEl.style,
        backgroundColor: '#ffffff',
        borderColor: '#d1d5db',
        borderWidth: 1,
        borderStyle: 'solid',
      };
    }

    if (presetId === 'technical-table') {
      newEl.name = `Datos tecnicos ${Math.floor(Math.random() * 1000)}`;
      newEl.size = { width: 190, height: 70 };
      newEl.tableData = {
        rowCount: 5,
        colCount: 2,
        borderColor: '#9ca3af',
        data: [
          ['DATOS TECNICOS', ''],
          ['NIS', ''],
          ['DIRECCION', ''],
          ['FECHA', ''],
          ['OBSERVACION', ''],
        ],
        colWidths: [50, 50],
        rowHeights: [20, 20, 20, 20, 20],
      };
      newEl.style = {
        ...newEl.style,
        backgroundColor: '#ffffff',
        borderColor: '#9ca3af',
        borderWidth: 1,
        borderStyle: 'solid',
        fontSize: 9,
      };
    }

    if (type === 'shape') {
      newEl.shapeConfig = { kind: 'rectangle', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 };
    }
    if (type === 'divider') {
      newEl.dividerConfig = { orientation: 'horizontal', color: '#374151', thickness: 1, style: 'solid' };
    }
    if (type === 'qr') {
      newEl.qrConfig = { content: 'https://example.com', errorLevel: 'M', foreground: '#000', background: '#fff' };
    }

    if (type === 'variable') {
      const requestedKey = typeof overrides?.variableName === 'string'
        ? overrides.variableName.trim()
        : '';
      const available = getAvailableVariables(nextDoc);
      let resolvedKey = requestedKey || available[0]?.key || '';

      if (!resolvedKey) {
        const autoDef = createAutoVariableDefinition(variableRegistry);
        resolvedKey = autoDef.key;
        nextDoc = {
          ...nextDoc,
          variables: normalizeVariableRegistry([...variableRegistry, autoDef]),
        };
      }

      newEl.variableName = resolvedKey;

      if (!overrides?.content) {
        newEl.content = `{{${resolvedKey}}}`;
      }
    }

    const maxZ = Math.max(0, ...nextDoc.elements.map(e => e.style.zIndex || 0));
    newEl.style.zIndex = maxZ + 1;

    onChange({ ...nextDoc, elements: [...nextDoc.elements, newEl] });
    setSelectedIds([newEl.id]);
  }, [doc, onChange, pageSettings.height, pageSettings.width, variableRegistry]);

  const handleAddBlock = useCallback((blockId: BlockPreset, dropPos?: { x: number; y: number }) => {
    const block = PRESET_BLOCKS.find((b) => b.id === blockId);
    if (!block) return;

    // Calculate base position: centered on page or at drop point
    const basePos = dropPos || {
      x: pageSettings.margins?.left ?? 10,
      y: (pageSettings.height / 2) - 20,
    };

    const maxZ = Math.max(0, ...doc.elements.map((e) => e.style.zIndex || 0));
    const newElements: TemplateElement[] = [];

    block.elements.forEach((def, i) => {
      const el = createElement(def.type, {
        x: basePos.x + def.relativePosition.x,
        y: basePos.y + def.relativePosition.y,
      });

      el.name = `${def.name} ${Math.floor(Math.random() * 1000)}`;
      el.size = { ...def.size };
      el.style = { ...def.style, zIndex: maxZ + 1 + i };
      if (def.content !== undefined) el.content = def.content;
      if (def.variableName !== undefined) el.variableName = def.variableName;
      if (def.tableData) el.tableData = JSON.parse(JSON.stringify(def.tableData));
      if (def.signatureConfig) el.signatureConfig = JSON.parse(JSON.stringify(def.signatureConfig));
      if (def.dividerConfig) el.dividerConfig = JSON.parse(JSON.stringify(def.dividerConfig));
      if (def.title !== undefined) el.title = def.title;
      if (def.signatureName !== undefined) el.signatureName = def.signatureName;

      newElements.push(el);
    });

    onChange({ ...doc, elements: [...doc.elements, ...newElements] });
    setSelectedIds(newElements.map((e) => e.id));
  }, [doc, onChange, pageSettings]);

  const handleDelete = useCallback(() => {
    if (!selectedIds.length) return;
    const newElements = doc.elements.filter(el => !selectedIds.includes(el.id));
    onChange({ ...doc, elements: newElements });
    setSelectedIds([]);
  }, [doc, selectedIds, onChange]);

  const handleDuplicate = useCallback(() => {
    if (!selectedIds.length) return;
    const newElements = [...doc.elements];
    const newIds: string[] = [];

    doc.elements.filter(el => selectedIds.includes(el.id)).forEach(el => {
      const clone = cloneElementWithFreshIds(el);
      clone.name = `${el.name} (copia)`;
      clone.position = { x: el.position.x + 5, y: el.position.y + 5 };
      clone.style = {
        ...clone.style,
        zIndex: (Math.max(0, ...newElements.map(e => e.style.zIndex || 0))) + 1,
      };
      newElements.push(clone);
      newIds.push(clone.id);
    });

    onChange({ ...doc, elements: newElements });
    setSelectedIds(newIds);
  }, [doc, selectedIds, onChange]);

  const handleGroup = useCallback(() => {
    if (selectedIds.length < 2) return;

    const selectedSet = new Set(selectedIds);
    const selectedElements = doc.elements.filter((element) => selectedSet.has(element.id));

    if (selectedElements.length < 2) return;
    if (selectedElements.some((element) => element.type === 'group')) return;

    const minX = Math.min(...selectedElements.map((element) => element.position.x));
    const minY = Math.min(...selectedElements.map((element) => element.position.y));
    const maxX = Math.max(...selectedElements.map((element) => element.position.x + element.size.width));
    const maxY = Math.max(...selectedElements.map((element) => element.position.y + element.size.height));

    const groupChildren = selectedElements.map((element) => {
      const child: TemplateElement = JSON.parse(JSON.stringify(element));
      child.position = {
        x: element.position.x - minX,
        y: element.position.y - minY,
      };
      return child;
    });

    const groupElement: TemplateElement = {
      id: generateId(),
      type: 'group',
      name: `Grupo ${Math.floor(Math.random() * 1000)}`,
      position: { x: minX, y: minY },
      size: {
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
      style: {
        backgroundColor: 'transparent',
        borderColor: '#60a5fa',
        borderWidth: 1,
        borderStyle: 'dashed',
        zIndex: Math.max(0, ...selectedElements.map((element) => element.style.zIndex || 0)),
      },
      visible: true,
      locked: false,
      children: groupChildren.map((child) => child.id),
      groupChildren,
    };

    const groupedElements: TemplateElement[] = [];
    let insertedGroup = false;

    doc.elements.forEach((element) => {
      if (selectedSet.has(element.id)) {
        if (!insertedGroup) {
          groupedElements.push(groupElement);
          insertedGroup = true;
        }
        return;
      }

      groupedElements.push(element);
    });

    if (!insertedGroup) groupedElements.push(groupElement);

    onChange({ ...doc, elements: groupedElements });
    setSelectedIds([groupElement.id]);
  }, [doc, selectedIds, onChange]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.length !== 1) return;

    const selectedGroup = doc.elements.find((element) => element.id === selectedIds[0]);
    if (!selectedGroup || selectedGroup.type !== 'group') return;

    const sourceChildren = Array.isArray(selectedGroup.groupChildren) ? selectedGroup.groupChildren : [];
    if (sourceChildren.length === 0) {
      onChange({ ...doc, elements: doc.elements.filter((element) => element.id !== selectedGroup.id) });
      setSelectedIds([]);
      return;
    }

    const baseZ = selectedGroup.style.zIndex || 1;
    const restoredChildren = [...sourceChildren]
      .sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0))
      .map((child, index) => {
        const restored: TemplateElement = JSON.parse(JSON.stringify(child));
        restored.position = {
          x: selectedGroup.position.x + child.position.x,
          y: selectedGroup.position.y + child.position.y,
        };
        restored.style = {
          ...restored.style,
          zIndex: baseZ + index,
        };
        return restored;
      });

    const ungroupedElements: TemplateElement[] = [];
    doc.elements.forEach((element) => {
      if (element.id === selectedGroup.id) {
        ungroupedElements.push(...restoredChildren);
        return;
      }
      ungroupedElements.push(element);
    });

    onChange({ ...doc, elements: ungroupedElements });
    setSelectedIds(restoredChildren.map((child) => child.id));
  }, [doc, selectedIds, onChange]);

  // Alignment
  const handleAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const selected = doc.elements.filter(el => selectedIds.includes(el.id));
    if (selected.length === 0) return;

    // If single element, align to page. If multiple, align to bounding box.
    let refLeft: number, refRight: number, refTop: number, refBottom: number;

    if (selected.length === 1) {
      refLeft = 0;
      refRight = pageSettings.width;
      refTop = 0;
      refBottom = pageSettings.height;
    } else {
      refLeft = Math.min(...selected.map(e => e.position.x));
      refRight = Math.max(...selected.map(e => e.position.x + e.size.width));
      refTop = Math.min(...selected.map(e => e.position.y));
      refBottom = Math.max(...selected.map(e => e.position.y + e.size.height));
    }

    const updates = new Map<string, Partial<TemplateElement>>();
    selected.forEach(el => {
      let newX = el.position.x;
      let newY = el.position.y;

      switch (type) {
        case 'left': newX = refLeft; break;
        case 'center': newX = refLeft + (refRight - refLeft) / 2 - el.size.width / 2; break;
        case 'right': newX = refRight - el.size.width; break;
        case 'top': newY = refTop; break;
        case 'middle': newY = refTop + (refBottom - refTop) / 2 - el.size.height / 2; break;
        case 'bottom': newY = refBottom - el.size.height; break;
      }

      updates.set(el.id, { position: { x: newX, y: newY } });
    });

    handleUpdateElements(updates);
  }, [doc, selectedIds, handleUpdateElements, pageSettings.height, pageSettings.width]);

  // Z-index manipulation
  const handleBringToFront = useCallback(() => {
    const maxZ = Math.max(0, ...doc.elements.map(e => e.style.zIndex || 0));
    const updates = new Map<string, Partial<TemplateElement>>();
    selectedIds.forEach((id, i) => {
      updates.set(id, { style: { ...doc.elements.find(e => e.id === id)!.style, zIndex: maxZ + 1 + i } });
    });
    handleUpdateElements(updates);
  }, [doc, selectedIds, handleUpdateElements]);

  const handleSendToBack = useCallback(() => {
    const minZ = Math.min(...doc.elements.map(e => e.style.zIndex || 0));
    const updates = new Map<string, Partial<TemplateElement>>();
    selectedIds.forEach((id, i) => {
      updates.set(id, { style: { ...doc.elements.find(e => e.id === id)!.style, zIndex: Math.max(0, minZ - selectedIds.length + i) } });
    });
    handleUpdateElements(updates);
  }, [doc, selectedIds, handleUpdateElements]);

  // Lock / Visibility
  const handleToggleLock = useCallback((id?: string) => {
    const targetIds = id ? [id] : selectedIds;
    const newElements = doc.elements.map(el =>
      targetIds.includes(el.id) ? { ...el, locked: !el.locked } : el
    );
    onChange({ ...doc, elements: newElements });
  }, [doc, selectedIds, onChange]);

  const handleToggleVisible = useCallback((id: string) => {
    const newElements = doc.elements.map(el =>
      el.id === id ? { ...el, visible: el.visible === false ? true : false } : el
    );
    onChange({ ...doc, elements: newElements });
  }, [doc, onChange]);

  // Layers reorder (change z-index based on new order)
  const handleReorder = useCallback((dragIndex: number, hoverIndex: number) => {
    const sorted = [...doc.elements].sort((a, b) => (b.style.zIndex || 0) - (a.style.zIndex || 0));
    const [moved] = sorted.splice(dragIndex, 1);
    sorted.splice(hoverIndex, 0, moved);

    // Re-assign z-indexes in descending order
    const updates = new Map<string, Partial<TemplateElement>>();
    sorted.forEach((el, i) => {
      const newZ = sorted.length - i;
      if ((el.style.zIndex || 0) !== newZ) {
        updates.set(el.id, { style: { ...el.style, zIndex: newZ } });
      }
    });

    if (updates.size > 0) handleUpdateElements(updates);
  }, [doc, handleUpdateElements]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const editableContainer =
        e.target instanceof HTMLElement
          ? e.target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')
          : null;
      const isTypingTarget =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && (e.target.isContentEditable || !!editableContainer));
      if (isTypingTarget) return;

      if (e.key === 'Escape') {
        setSelectedIds([]);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDelete();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          handleUngroup();
        } else {
          handleGroup();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selectedElements = doc.elements.filter(el => selectedIds.includes(el.id));
        if (!selectedElements.length) return;

        e.preventDefault();
        const serialized = JSON.stringify(selectedElements);

        try {
          localStorage.setItem(CLIPBOARD_STORAGE_KEY, serialized);
        } catch {
          // Silent fallback: clipboard feature should never crash editor.
        }

        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(serialized).catch(() => {
            // Silent fallback if browser blocks clipboard API.
          });
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();

        let rawClipboard: string | null = null;
        try {
          rawClipboard = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
        } catch {
          rawClipboard = null;
        }
        if (!rawClipboard) return;

        let parsedClipboard: unknown;
        try {
          parsedClipboard = JSON.parse(rawClipboard);
        } catch {
          return;
        }
        if (!Array.isArray(parsedClipboard) || parsedClipboard.length === 0) return;

        const maxZ = Math.max(0, ...doc.elements.map(el => el.style.zIndex || 0));
        const pastedElements: TemplateElement[] = [];
        const newIds: string[] = [];

        parsedClipboard.forEach(item => {
          if (!item || typeof item !== 'object') return;

          const source = item as TemplateElement;
          const clone = cloneElementWithFreshIds(source);
          clone.position = {
            x: (source.position?.x ?? 0) + 10,
            y: (source.position?.y ?? 0) + 10,
          };
          clone.style = {
            ...(source.style || {}),
            zIndex: maxZ + 1,
          };

          pastedElements.push(clone);
          newIds.push(clone.id);
        });

        if (!pastedElements.length) return;

        onChange({ ...doc, elements: [...doc.elements, ...pastedElements] });
        setSelectedIds(newIds);
        return;
      }

      // Arrow key nudging
      const nudge = e.shiftKey ? 10 : 1; // mm
      const selected = doc.elements.filter(el => selectedIds.includes(el.id) && !el.locked);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selected.length > 0) {
        e.preventDefault();
        const updates = new Map<string, Partial<TemplateElement>>();
        selected.forEach(el => {
          let { x, y } = el.position;
          if (e.key === 'ArrowUp') y -= nudge;
          if (e.key === 'ArrowDown') y += nudge;
          if (e.key === 'ArrowLeft') x -= nudge;
          if (e.key === 'ArrowRight') x += nudge;
          updates.set(el.id, { position: { x, y } });
        });
        handleUpdateElements(updates);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDelete, handleDuplicate, handleGroup, handleUngroup, doc, doc.elements, selectedIds, handleUpdateElements, onChange]);

  const selectedElements = doc.elements.filter((element) => selectedIds.includes(element.id));
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  const canGroup =
    selectedElements.length >= 2 && selectedElements.every((element) => element.type !== 'group');
  const canUngroup = selectedElement?.type === 'group';

  const selectedElementMetrics = selectedElement
    ? {
      x: selectedElement.position.x,
      y: selectedElement.position.y,
      width: selectedElement.size.width,
      height: selectedElement.size.height,
    }
    : null;

  return (
    <div className="flex flex-col h-full w-full bg-neutral-100 overflow-hidden relative">
      {/* Context Toolbar */}
      <ContextToolbar
        selectedCount={selectedIds.length}
        onAlign={handleAlign}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onLockToggle={() => handleToggleLock()}
        isLocked={doc.elements.find(e => selectedIds.includes(e.id))?.locked || false}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onGroup={handleGroup}
        onUngroup={handleUngroup}
      />

      <div ref={bodyRef} className="relative flex-1 flex overflow-hidden min-w-0">
        {/* Sidebar */}
        {isLeftSidebarOpen && (
          <>
            <SidebarRoot
              width={leftSidebarWidth}
              onAddElement={handleAddElement}
              onAddBlock={handleAddBlock}
              elements={doc.elements}
              variables={variableRegistry}
              onVariablesChange={handleUpdateVariables}
              selectedIds={selectedIds}
              onSelect={(id: string, multi: boolean) => {
                if (multi) setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
                else setSelectedIds([id]);
              }}
              onToggleLock={handleToggleLock}
              onToggleVisible={handleToggleVisible}
              onReorder={handleReorder}
              onLoadTemplate={onLoadTemplate}
              currentDocName={doc.name}
              isDirty={isDirty}
            />
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar panel izquierdo"
              className="group relative w-2 flex-none cursor-col-resize select-none"
              onMouseDown={(event) => startResize('left', event)}
            >
              <div
                className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${activeResizer === 'left' ? 'bg-blue-500' : 'bg-neutral-200 group-hover:bg-blue-500'
                  }`}
              />
            </div>
          </>
        )}

        {/* Canvas Area */}
        <div className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
          <CanvasArea
            document={doc}
            pageSettings={pageSettings}
            onChange={onChange}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onAddElement={handleAddElement}
            onAddBlock={handleAddBlock}
            zoom={zoom}
            onZoomChange={setZoom}
            snapEnabled={snapConfig.enabled}
            gridSize={snapConfig.gridSize}
            showGrid={snapConfig.showGrid}
            dataPreview={dataPreview}
          />

          <StatusBar
            zoom={zoom}
            onZoomChange={setZoom}
            selectionCount={selectedIds.length}
            selectedElementMetrics={selectedElementMetrics}
            snapEnabled={snapConfig.enabled}
            snapGridSize={snapConfig.gridSize}
            showGrid={snapConfig.showGrid}
            onSnapEnabledChange={handleSnapEnabledChange}
            onSnapGridSizeChange={handleSnapGridSizeChange}
            onShowGridChange={handleShowGridChange}
          />
        </div>

        <button
          type="button"
          onClick={() => setIsRightSidebarOpen((prev) => !prev)}
          className="absolute top-1/2 z-30 h-14 w-7 -translate-y-1/2 rounded-full border border-neutral-800 bg-white text-violet-600 shadow-sm transition-colors hover:bg-neutral-50 flex items-center justify-center"
          style={{ right: isRightSidebarOpen ? rightSidebarWidth + 2 - 14 : 6 }}
          title={isRightSidebarOpen ? 'Ocultar inspector' : 'Mostrar inspector'}
          aria-label={isRightSidebarOpen ? 'Ocultar inspector' : 'Mostrar inspector'}
        >
          {isRightSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Inspector */}
        {isRightSidebarOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar panel derecho"
              className="group relative w-2 flex-none cursor-col-resize select-none"
              onMouseDown={(event) => startResize('right', event)}
            >
              <div
                className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${activeResizer === 'right' ? 'bg-blue-500' : 'bg-neutral-200 group-hover:bg-blue-500'
                  }`}
              />
            </div>
            <InspectorRoot
              width={rightSidebarWidth}
              selectedIds={selectedIds}
              elements={doc.elements}
              onUpdateElement={handleUpdateElement}
              pageSettings={pageSettings}
              onPageSettingsChange={onPageSettingsChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
