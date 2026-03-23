import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Focus } from 'lucide-react';
import { useFocusMode } from './hooks/useFocusMode';
import {
  BindingDefinition,
  BrandKit,
  CanvasComponent,
  CanvasDocument,
  CanvasVariant,
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
  mmToPx,
} from './canvasTypes';
import { useCanvasViewport } from './hooks/useCanvasViewport';
import { PRESET_BLOCKS } from './utils/presetBlocks';
import { SidebarRoot } from './sidebar/SidebarRoot';
import { CanvasArea } from './canvas/CanvasArea';
import { Ruler, RulerCorner, RULER_THICKNESS } from './canvas/Ruler';
import { InspectorRoot } from './inspector/InspectorRoot';
import { StatusBar } from './toolbar/StatusBar';
import type { SaveState } from './toolbar/StatusBar';
import { ContextToolbar } from './toolbar/ContextToolbar';
import { TextFormatToolbar } from './toolbar/TextFormatToolbar';
import { migrateToCanvas } from './utils/elementDefaults';
import {
  addElementToPage,
  addElementsToPage,
  applyBrandKit,
  applyVariantToDocument,
  createBrandKit,
  createPage,
  createVariant,
  deleteBrandKit,
  deleteComponent,
  deletePage,
  deleteVariant,
  ensureCanvasDocument,
  getActivePageId,
  getPageElements,
  insertComponentInstance,
  removeBinding,
  removeElementsFromDocument,
  reorderPages,
  renamePage,
  saveSelectionAsComponent,
  setActivePage,
  setComponentDetached,
  syncComponentInstances,
  updateBrandKit,
  updateComponent,
  updateComponentFromInstance,
  updateElementsInDocument,
  updateVariant,
  upsertBinding,
  duplicatePage,
  alignElements,
  distributeElements,
  validateCanvasDocument,
} from './documentModel';
import type { AlignAxis } from './documentModel';
import type { TemplateValidationIssue } from './canvasTypes';
import type { CanvasChangeOptions } from './historyTypes';

const CLIPBOARD_STORAGE_KEY = 'canvas_clipboard';
const SNAP_CONFIG_STORAGE_KEY = 'canvas_snap_config';

const CONTEXT_AXIS_MAP: Record<
  'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
  AlignAxis
> = {
  left:   'left',
  center: 'center-h',
  right:  'right',
  top:    'top',
  middle: 'center-v',
  bottom: 'bottom',
};
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
  activePublishedTemplateId?: string | null;
  publishedTemplatesRefreshKey?: number;
  onUnpublishTemplate?: (templateId: string) => Promise<void> | void;
  onEditPublishedTemplate?: (templateId: string) => Promise<void> | void;
  onDeletePublishedTemplate?: (templateId: string) => Promise<void> | void;
  saveState?: SaveState;
}

export default function CanvasEditor({
  document: incomingDoc,
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
  activePublishedTemplateId,
  publishedTemplatesRefreshKey,
  onUnpublishTemplate,
  onEditPublishedTemplate,
  onDeletePublishedTemplate,
  saveState,
}: CanvasEditorProps) {
  const doc = useMemo(() => ensureCanvasDocument(incomingDoc), [incomingDoc]);
  const activePageId = useMemo(() => getActivePageId(doc), [doc]);
  const currentPageElements = useMemo(() => getPageElements(doc, activePageId), [doc, activePageId]);
  const MIN_SIDEBAR_WIDTH = 250;
  const MAX_SIDEBAR_WIDTH = 500;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { isFocusMode } = useFocusMode();

  // Calculate page dimensions in px (needed for fitPage)
  const pageWidthPx = mmToPx(pageSettings.width);
  const pageHeightPx = mmToPx(pageSettings.height);

  const {
    viewport,
    isPanning,
    containerRef: viewportContainerRef,
    zoomTo,
    fitPage,
    handleContainerPointerDown,
  } = useCanvasViewport({ pageWidthPx, pageHeightPx });

  const { zoom } = viewport; // used by existing code that references zoom

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [activeResizer, setActiveResizer] = useState<'left' | 'right' | null>(null);
  const [snapConfig, setSnapConfig] = useState<SnapConfig>(() => loadSnapConfig());
  const [showRulers, setShowRulers] = useState(true);
  const hasMigrated = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
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

  // Track canvas wrapper dimensions for ruler sizing
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const visibleIds = new Set(currentPageElements.map((element) => element.id));
    setSelectedIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [activePageId, currentPageElements]);

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

  const handleThemeChange = useCallback((theme: CanvasDocument['theme']) => {
    onChange({
      ...doc,
      theme: {
        textStyles: Array.isArray(theme?.textStyles) ? theme.textStyles : [],
        colorTokens: Array.isArray(theme?.colorTokens) ? theme.colorTokens : [],
      },
    });
  }, [doc, onChange]);

  const handleDataSourceDefinitionChange = useCallback((definition: NonNullable<CanvasDocument['dataSourceDefinition']>) => {
    onChange({
      ...doc,
      dataSourceDefinition: {
        schemaVersion: definition?.schemaVersion || '1.0',
        fields: Array.isArray(definition?.fields) ? definition.fields : [],
        ...(definition?.notes ? { notes: definition.notes } : {}),
      },
    });
  }, [doc, onChange]);

  const handleAssetLibraryChange = useCallback((assetLibrary: CanvasDocument['assetLibrary']) => {
    onChange({
      ...doc,
      assetLibrary: Array.isArray(assetLibrary) ? assetLibrary : [],
    });
  }, [doc, onChange]);

  const handleSetActivePage = useCallback((pageId: string) => {
    onChange(setActivePage(doc, pageId));
    setSelectedIds([]);
  }, [doc, onChange]);

  const handleCreatePage = useCallback((name?: string) => {
    onChange(createPage(doc, name));
    setSelectedIds([]);
  }, [doc, onChange]);

  const handleRenamePage = useCallback((pageId: string, name: string) => {
    onChange(renamePage(doc, pageId, name));
  }, [doc, onChange]);

  const handleDuplicatePage = useCallback((pageId: string) => {
    onChange(duplicatePage(doc, pageId));
    setSelectedIds([]);
  }, [doc, onChange]);

  const handleDeletePage = useCallback((pageId: string) => {
    onChange(deletePage(doc, pageId));
    setSelectedIds([]);
  }, [doc, onChange]);

  const handleMovePage = useCallback((sourceIndex: number, targetIndex: number) => {
    onChange(reorderPages(doc, sourceIndex, targetIndex));
  }, [doc, onChange]);

  const handleCreateComponentFromSelection = useCallback((name?: string) => {
    const next = saveSelectionAsComponent(doc, selectedIds, name);
    if (next.component) onChange(next.doc);
  }, [doc, onChange, selectedIds]);

  const handleInsertComponent = useCallback((componentId: string) => {
    const next = insertComponentInstance(doc, componentId, activePageId);
    onChange(next.doc);
    if (next.elementId) setSelectedIds([next.elementId]);
  }, [activePageId, doc, onChange]);

  const handleSyncComponent = useCallback((componentId: string) => {
    onChange(syncComponentInstances(doc, componentId));
  }, [doc, onChange]);

  const handleUpdateComponentFromSelection = useCallback((componentId: string, groupId: string) => {
    onChange(updateComponentFromInstance(doc, componentId, groupId));
  }, [doc, onChange]);

  const handleUpdateComponentRecord = useCallback((componentId: string, updates: Partial<CanvasComponent>) => {
    onChange(updateComponent(doc, componentId, updates));
  }, [doc, onChange]);

  const handleDeleteComponent = useCallback((componentId: string) => {
    onChange(deleteComponent(doc, componentId));
  }, [doc, onChange]);

  const handleCreateBrandKit = useCallback((name?: string) => {
    const next = createBrandKit(doc, name);
    onChange(next.doc);
  }, [doc, onChange]);

  const handleApplyBrandKit = useCallback((brandKitId: string) => {
    onChange(applyBrandKit(doc, brandKitId));
  }, [doc, onChange]);

  const handleUpdateBrandKitRecord = useCallback((brandKitId: string, updates: Partial<BrandKit>) => {
    onChange(updateBrandKit(doc, brandKitId, updates));
  }, [doc, onChange]);

  const handleDeleteBrandKit = useCallback((brandKitId: string) => {
    onChange(deleteBrandKit(doc, brandKitId));
  }, [doc, onChange]);

  const handleCreateVariant = useCallback((name?: string) => {
    const next = createVariant(doc, name);
    onChange(next.doc);
  }, [doc, onChange]);

  const handleApplyVariantRecord = useCallback((variantId?: string | null) => {
    onChange(applyVariantToDocument(doc, variantId));
  }, [doc, onChange]);

  const handleUpdateVariantRecord = useCallback((variantId: string, updates: Partial<CanvasVariant>) => {
    onChange(updateVariant(doc, variantId, updates));
  }, [doc, onChange]);

  const handleDeleteVariant = useCallback((variantId: string) => {
    onChange(deleteVariant(doc, variantId));
  }, [doc, onChange]);

  const handleUpsertBinding = useCallback((binding: BindingDefinition) => {
    onChange(upsertBinding(doc, binding));
  }, [doc, onChange]);

  const handleRemoveBinding = useCallback((elementId: string) => {
    onChange(removeBinding(doc, elementId));
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

  const handleTextFormatUpdate = useCallback((id: string, patch: Partial<TemplateElement>) => {
    const newElements = doc.elements.map(el =>
      el.id === id ? { ...el, ...patch } : el
    );
    onChange({ ...doc, elements: newElements }, { commitToHistory: true });
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

    if (type === 'photo-grid' && !newEl.photoConfig) {
      newEl.photoConfig = {
        count: 4,
        labels: ['ANTES', 'DURANTE', 'DESPUES', 'DETALLE'],
        showLabels: true,
        oddPosition: 'center',
      };
      newEl.style = {
        ...newEl.style,
        backgroundColor: '#f7f6ff',
        borderColor: '#6d4cff',
        borderWidth: 1.2,
        borderStyle: 'solid',
      };
    }

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

    const targetPageId = getActivePageId(nextDoc);
    const maxZ = Math.max(0, ...nextDoc.elements.filter((element) => element.pageId === targetPageId).map((element) => element.style.zIndex || 0));
    newEl.pageId = targetPageId;
    newEl.style.zIndex = maxZ + 1;

    onChange(addElementToPage(nextDoc, newEl, targetPageId));
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

    const targetPageId = getActivePageId(doc);
    const maxZ = Math.max(0, ...doc.elements.filter((element) => element.pageId === targetPageId).map((e) => e.style.zIndex || 0));
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
      el.pageId = targetPageId;

      newElements.push(el);
    });

    onChange(addElementsToPage(doc, newElements, targetPageId));
    setSelectedIds(newElements.map((e) => e.id));
  }, [doc, onChange, pageSettings]);

  const handleInsertAsset = useCallback((asset: NonNullable<CanvasDocument['assetLibrary']>[number]) => {
    const isLogo = asset.type === 'logo';
    handleAddElement(isLogo ? 'logo' : 'image', undefined, undefined, {
      name: asset.name,
      content: asset.name,
      imageUrl: asset.url,
      assetRefId: asset.id,
      size: isLogo ? { width: 30, height: 30 } : { width: 50, height: 50 },
      style: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        objectFit: isLogo ? 'contain' : 'cover',
      },
    });
  }, [handleAddElement]);

  const handleInsertBoundField = useCallback((fieldKey: string, label?: string) => {
    handleAddElement('variable', undefined, undefined, {
      variableName: fieldKey,
      name: label || fieldKey,
      content: `{{${fieldKey}}}`,
    });
  }, [handleAddElement]);

  const validationIssues: TemplateValidationIssue[] = useMemo(
    () => validateCanvasDocument(doc),
    [doc],
  );

  const handleDelete = useCallback(() => {
    if (!selectedIds.length) return;
    onChange(removeElementsFromDocument(doc, selectedIds));
    setSelectedIds([]);
  }, [doc, selectedIds, onChange]);

  const handleDuplicate = useCallback(() => {
    if (!selectedIds.length) return;
    const newElements = [...doc.elements];
    const newIds: string[] = [];

    doc.elements.filter(el => selectedIds.includes(el.id)).forEach(el => {
      const clone = cloneElementWithFreshIds(el);
      clone.name = `${el.name} (copia)`;
      clone.pageId = el.pageId || activePageId;
      clone.position = { x: el.position.x + 5, y: el.position.y + 5 };
      clone.style = {
        ...clone.style,
        zIndex: (Math.max(0, ...newElements.filter((item) => item.pageId === clone.pageId).map(e => e.style.zIndex || 0))) + 1,
      };
      newElements.push(clone);
      newIds.push(clone.id);
    });

    onChange(ensureCanvasDocument({ ...doc, elements: newElements }));
    setSelectedIds(newIds);
  }, [activePageId, doc, selectedIds, onChange]);

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
      pageId: activePageId,
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

    onChange(ensureCanvasDocument({ ...doc, elements: groupedElements }));
    setSelectedIds([groupElement.id]);
  }, [doc, selectedIds, onChange]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.length !== 1) return;

    const selectedGroup = doc.elements.find((element) => element.id === selectedIds[0]);
    if (!selectedGroup || selectedGroup.type !== 'group') return;

    const sourceChildren = Array.isArray(selectedGroup.groupChildren) ? selectedGroup.groupChildren : [];
    if (sourceChildren.length === 0) {
      onChange(ensureCanvasDocument({ ...doc, elements: doc.elements.filter((element) => element.id !== selectedGroup.id) }));
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
        restored.pageId = selectedGroup.pageId || activePageId;
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

    onChange(ensureCanvasDocument({ ...doc, elements: ungroupedElements }));
    setSelectedIds(restoredChildren.map((child) => child.id));
  }, [doc, selectedIds, onChange]);

  // --- Alignment helpers for ContextToolbar ---
  // NOTE: handleAlign and handleDistribute below are used exclusively by ContextToolbar.
  // They differ from handleAlignElements / handleDistributeElements (used by AlignmentToolbar) in two ways:
  //   1. handleAlign handles the single-element case by aligning to the PAGE bounds (not the selection
  //      bounding box), which AlignmentToolbar never needs because it only appears with 2+ elements.
  //   2. Neither handleAlign nor handleDistribute respect the `locked` property on elements; the
  //      documentModel helpers used by AlignmentToolbar do.
  // Do NOT unify these two code paths until ContextToolbar is either removed or updated to use
  // documentModel.alignElements / distributeElements with proper locked-element awareness.
  const handleAlign = useCallback((type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const selected = currentPageElements.filter(el => selectedIds.includes(el.id));
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
  }, [currentPageElements, selectedIds, handleUpdateElements, pageSettings.height, pageSettings.width]);

  const handleDistribute = useCallback((axis: 'horizontal' | 'vertical') => {
    const selected = currentPageElements.filter((element) => selectedIds.includes(element.id));
    if (selected.length < 3) return;

    const sorted = [...selected].sort((a, b) => axis === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSize = sorted.reduce((sum, element) => sum + (axis === 'horizontal' ? element.size.width : element.size.height), 0);
    const span = axis === 'horizontal'
      ? (last.position.x + last.size.width) - first.position.x
      : (last.position.y + last.size.height) - first.position.y;
    const gap = (span - totalSize) / Math.max(1, sorted.length - 1);

    let cursor = axis === 'horizontal' ? first.position.x : first.position.y;
    const updates = new Map<string, Partial<TemplateElement>>();
    sorted.forEach((element) => {
      if (axis === 'horizontal') {
        updates.set(element.id, { position: { x: cursor, y: element.position.y } });
        cursor += element.size.width + gap;
      } else {
        updates.set(element.id, { position: { x: element.position.x, y: cursor } });
        cursor += element.size.height + gap;
      }
    });

    handleUpdateElements(updates);
  }, [currentPageElements, handleUpdateElements, selectedIds]);

  // --- Alignment helpers for AlignmentToolbar ---
  // These delegate to documentModel helpers that correctly skip locked elements.
  // They are separate from handleAlign / handleDistribute above intentionally — see comment there.
  const handleAlignElements = useCallback((ids: string[], axis: AlignAxis) => {
    const newElements = alignElements(doc.elements, ids, axis);
    onChange({ ...doc, elements: newElements }, { commitToHistory: true });
  }, [doc, onChange]);

  const handleDistributeElements = useCallback((ids: string[], direction: 'horizontal' | 'vertical') => {
    const newElements = distributeElements(doc.elements, ids, direction);
    onChange({ ...doc, elements: newElements }, { commitToHistory: true });
  }, [doc, onChange]);

  const handleAlignUnified = useCallback(
    (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (selectedIds.length <= 1) {
        handleAlign(type);
      } else {
        handleAlignElements(selectedIds, CONTEXT_AXIS_MAP[type]);
      }
    },
    [selectedIds, handleAlign, handleAlignElements],
  );

  const handleDistributeUnified = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      handleDistributeElements(selectedIds, axis);
    },
    [selectedIds, handleDistributeElements],
  );

  const handleApplyPrimaryStyle = useCallback(() => {
    const selected = currentPageElements.filter((element) => selectedIds.includes(element.id));
    if (selected.length < 2) return;
    const [primary, ...rest] = selected;
    const updates = new Map<string, Partial<TemplateElement>>();
    rest.forEach((element) => {
      updates.set(element.id, { style: { ...primary.style, zIndex: element.style.zIndex } });
    });
    handleUpdateElements(updates);
  }, [currentPageElements, handleUpdateElements, selectedIds]);

  // Z-index manipulation
  const handleBringToFront = useCallback(() => {
    const maxZ = Math.max(0, ...currentPageElements.map(e => e.style.zIndex || 0));
    const updates = new Map<string, Partial<TemplateElement>>();
    selectedIds.forEach((id, i) => {
      updates.set(id, { style: { ...doc.elements.find(e => e.id === id)!.style, zIndex: maxZ + 1 + i } });
    });
    handleUpdateElements(updates);
  }, [currentPageElements, doc, selectedIds, handleUpdateElements]);

  const handleSendToBack = useCallback(() => {
    const minZ = Math.min(...currentPageElements.map(e => e.style.zIndex || 0), 0);
    const updates = new Map<string, Partial<TemplateElement>>();
    selectedIds.forEach((id, i) => {
      updates.set(id, { style: { ...doc.elements.find(e => e.id === id)!.style, zIndex: Math.max(0, minZ - selectedIds.length + i) } });
    });
    handleUpdateElements(updates);
  }, [currentPageElements, doc, selectedIds, handleUpdateElements]);

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

  const handleRenameElement = useCallback((id: string, name: string) => {
    const newElements = doc.elements.map(el =>
      el.id === id ? { ...el, name } : el
    );
    onChange({ ...doc, elements: newElements }, { commitToHistory: true });
  }, [doc, onChange]);

  // Layers reorder (change z-index based on new order)
  const handleReorder = useCallback((dragIndex: number, hoverIndex: number) => {
    const sorted = [...currentPageElements].sort((a, b) => (b.style.zIndex || 0) - (a.style.zIndex || 0));
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
  }, [currentPageElements, handleUpdateElements]);

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

        const maxZ = Math.max(0, ...currentPageElements.map(el => el.style.zIndex || 0));
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
          clone.pageId = activePageId;
          clone.style = {
            ...(source.style || {}),
            zIndex: maxZ + 1,
          };

          pastedElements.push(clone);
          newIds.push(clone.id);
        });

        if (!pastedElements.length) return;

        onChange(ensureCanvasDocument({ ...doc, elements: [...doc.elements, ...pastedElements] }));
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

  const selectedElements = currentPageElements.filter((element) => selectedIds.includes(element.id));
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  const selectedTextElement =
    selectedElement !== null &&
    (selectedElement.type === 'text' || selectedElement.type === 'heading' || selectedElement.type === 'variable')
      ? selectedElement
      : null;
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

  const canDistribute =
    currentPageElements.filter(
      (el) => selectedIds.includes(el.id) && !el.locked,
    ).length >= 3;

  return (
    <div className="flex flex-col h-full w-full bg-[#f0eff0] overflow-hidden relative">
      {/* Context Toolbar */}
      <ContextToolbar
        selectedCount={selectedIds.length}
        onAlign={handleAlignUnified}
        onDistribute={handleDistributeUnified}
        canDistribute={canDistribute}
        onApplyPrimaryStyle={handleApplyPrimaryStyle}
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
        {!isFocusMode && isLeftSidebarOpen && (
          <>
            <SidebarRoot
              width={leftSidebarWidth}
              document={doc}
              activePageId={activePageId}
              pageElements={currentPageElements}
              onAddElement={handleAddElement}
              onAddBlock={handleAddBlock}
              variables={variableRegistry}
              onVariablesChange={handleUpdateVariables}
              documentTheme={doc.theme}
              onThemeChange={handleThemeChange}
              dataSourceDefinition={doc.dataSourceDefinition}
              onDataSourceDefinitionChange={handleDataSourceDefinitionChange}
              assetLibrary={doc.assetLibrary || []}
              onAssetLibraryChange={handleAssetLibraryChange}
              onInsertAsset={handleInsertAsset}
              selectedIds={selectedIds}
              onSelect={(id: string, multi: boolean) => {
                if (multi) setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
                else setSelectedIds([id]);
              }}
              onToggleLock={handleToggleLock}
              onToggleVisible={handleToggleVisible}
              onReorder={handleReorder}
              onRenameElement={handleRenameElement}
              onLoadTemplate={onLoadTemplate}
              currentDocName={doc.name}
              isDirty={isDirty}
              activePublishedTemplateId={activePublishedTemplateId}
              publishedTemplatesRefreshKey={publishedTemplatesRefreshKey}
              onUnpublishTemplate={onUnpublishTemplate}
              onEditPublishedTemplate={onEditPublishedTemplate}
              onDeletePublishedTemplate={onDeletePublishedTemplate}
              onSetActivePage={handleSetActivePage}
              onCreatePage={handleCreatePage}
              onRenamePage={handleRenamePage}
              onDuplicatePage={handleDuplicatePage}
              onDeletePage={handleDeletePage}
              onMovePage={handleMovePage}
              onCreateComponentFromSelection={handleCreateComponentFromSelection}
              onInsertComponent={handleInsertComponent}
              onSyncComponent={handleSyncComponent}
              onUpdateComponentFromSelection={handleUpdateComponentFromSelection}
              onUpdateComponent={handleUpdateComponentRecord}
              onDeleteComponent={handleDeleteComponent}
              onCreateBrandKit={handleCreateBrandKit}
              onApplyBrandKit={handleApplyBrandKit}
              onUpdateBrandKit={handleUpdateBrandKitRecord}
              onDeleteBrandKit={handleDeleteBrandKit}
              onCreateVariant={handleCreateVariant}
              onApplyVariant={handleApplyVariantRecord}
              onUpdateVariant={handleUpdateVariantRecord}
              onDeleteVariant={handleDeleteVariant}
              validationIssues={validationIssues}
              dataPreview={dataPreview}
              onInsertBoundField={handleInsertBoundField}
            />
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar panel izquierdo"
              className="group relative w-1.5 flex-none cursor-col-resize select-none"
              onMouseDown={(event) => startResize('left', event)}
            >
              <div
                className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${activeResizer === 'left' ? 'bg-violet-400' : 'bg-neutral-200/60 group-hover:bg-violet-300'
                  }`}
              />
            </div>
          </>
        )}

        {/* Canvas Area */}
        <div className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
          {/* Focus mode indicator pill */}
          {isFocusMode && (
            <div className="absolute top-2 right-2 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-900/80 backdrop-blur-sm text-white text-[10px] font-medium select-none pointer-events-none">
              <Focus size={10} />
              Modo Foco · Ctrl+.
            </div>
          )}

          {/* Text Format Toolbar — shown above canvas when exactly 1 text element selected */}
          {selectedTextElement !== null && (
            <div className="flex-none flex items-center px-3 py-1 border-b border-neutral-100/80 bg-white/80 backdrop-blur-sm gap-2 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <span className="select-none text-[9px] font-bold uppercase tracking-widest text-neutral-300 pr-1">
                Texto
              </span>
              <TextFormatToolbar
                element={selectedTextElement}
                onUpdate={(patch) => handleTextFormatUpdate(selectedTextElement.id, patch)}
              />
            </div>
          )}

          {/* Canvas wrapper with ruler overlays */}
          <div
            ref={canvasWrapperRef}
            className="flex-1 relative min-w-0 overflow-hidden bg-[#e8e8ec]"
            style={showRulers ? { paddingTop: RULER_THICKNESS, paddingLeft: RULER_THICKNESS } : undefined}
          >
            <CanvasArea
              document={doc}
              activePageId={activePageId}
              pageSettings={pageSettings}
              onChange={onChange}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              onAddElement={handleAddElement}
              onAddBlock={handleAddBlock}
              viewport={viewport}
              onZoomChange={zoomTo}
              isPanning={isPanning}
              onContainerPointerDown={handleContainerPointerDown}
              viewportRef={viewportContainerRef}
              snapEnabled={snapConfig.enabled}
              gridSize={snapConfig.gridSize}
              showGrid={snapConfig.showGrid}
              dataPreview={dataPreview}
            />
            {showRulers && (
              <>
                {/* Horizontal ruler along the top */}
                <Ruler
                  orientation="horizontal"
                  zoom={zoom}
                  pageOffsetPx={viewport.panX}
                  lengthPx={canvasSize.width - RULER_THICKNESS}
                  thickness={RULER_THICKNESS}
                />
                {/* Vertical ruler along the left */}
                <Ruler
                  orientation="vertical"
                  zoom={zoom}
                  pageOffsetPx={viewport.panY}
                  lengthPx={canvasSize.height - RULER_THICKNESS}
                  thickness={RULER_THICKNESS}
                />
                {/* Corner square at intersection of rulers */}
                <RulerCorner thickness={RULER_THICKNESS} />
              </>
            )}
          </div>

          <StatusBar
            zoom={zoom}
            onZoomChange={zoomTo}
            onFitPage={fitPage}
            selectionCount={selectedIds.length}
            selectedElementMetrics={selectedElementMetrics}
            snapEnabled={snapConfig.enabled}
            snapGridSize={snapConfig.gridSize}
            showGrid={snapConfig.showGrid}
            onSnapEnabledChange={handleSnapEnabledChange}
            onSnapGridSizeChange={handleSnapGridSizeChange}
            onShowGridChange={handleShowGridChange}
            saveState={saveState}
            showRulers={showRulers}
            onShowRulersChange={setShowRulers}
          />
        </div>

        {!isFocusMode && (
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen((prev) => !prev)}
            className="absolute top-1/2 z-30 h-10 w-5 -translate-y-1/2 rounded-l-full border border-neutral-200/80 bg-white/90 backdrop-blur-sm text-neutral-400 shadow-sm transition-all hover:text-violet-600 hover:border-violet-200 hover:shadow-md flex items-center justify-center"
            style={{ right: isRightSidebarOpen ? rightSidebarWidth - 1 : 0 }}
            title={isRightSidebarOpen ? 'Ocultar inspector' : 'Mostrar inspector'}
            aria-label={isRightSidebarOpen ? 'Ocultar inspector' : 'Mostrar inspector'}
          >
            {isRightSidebarOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        )}

        {/* Inspector */}
        {!isFocusMode && isRightSidebarOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar panel derecho"
              className="group relative w-1.5 flex-none cursor-col-resize select-none"
              onMouseDown={(event) => startResize('right', event)}
            >
              <div
                className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors ${activeResizer === 'right' ? 'bg-violet-400' : 'bg-neutral-200/60 group-hover:bg-violet-300'
                  }`}
              />
            </div>
            <InspectorRoot
              width={rightSidebarWidth}
              selectedIds={selectedIds}
              elements={currentPageElements}
              onUpdateElement={handleUpdateElement}
              theme={doc.theme}
              pageSettings={pageSettings}
              onPageSettingsChange={onPageSettingsChange}
              bindingMap={doc.bindingMap}
              dataSourceDefinition={doc.dataSourceDefinition}
              dataPreview={dataPreview}
              assetLibrary={doc.assetLibrary || []}
              brandKits={doc.brandKits || []}
              onUpsertBinding={handleUpsertBinding}
              onRemoveBinding={handleRemoveBinding}
            />
          </>
        )}
      </div>
    </div>
  );
}

