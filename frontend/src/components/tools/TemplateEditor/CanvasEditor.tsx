import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CanvasDocument, TemplateElement, createElement, generateId, ElementType, ElementPreset, PageSettings } from './canvasTypes';
import { SidebarRoot } from './sidebar/SidebarRoot';
import { CanvasArea } from './canvas/CanvasArea';
import { InspectorRoot } from './inspector/InspectorRoot';
import { StatusBar } from './toolbar/StatusBar';
import { ContextToolbar } from './toolbar/ContextToolbar';
import { migrateToCanvas } from './utils/elementDefaults';

interface CanvasEditorProps {
  document: CanvasDocument;
  pageSettings: PageSettings;
  onChange: (doc: CanvasDocument) => void;
  onPageSettingsChange: (settings: PageSettings) => void;
  isDirty?: boolean;
  onLoadTemplate?: (doc: CanvasDocument) => void;
}

export default function CanvasEditor({
  document: doc,
  pageSettings,
  onChange,
  onPageSettingsChange,
  isDirty,
  onLoadTemplate,
}: CanvasEditorProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(75);
  const hasMigrated = useRef(false);

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

  const handleAddElement = useCallback((type: ElementType, pos?: { x: number; y: number }, presetId?: ElementPreset) => {
    const position = pos || {
      x: (pageSettings.width / 2) - 25,
      y: (pageSettings.height / 2) - 25,
    };
    const newEl = createElement(type, position);

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

    const maxZ = Math.max(0, ...doc.elements.map(e => e.style.zIndex || 0));
    newEl.style.zIndex = maxZ + 1;

    onChange({ ...doc, elements: [...doc.elements, newEl] });
    setSelectedIds([newEl.id]);
  }, [doc, onChange, pageSettings.height, pageSettings.width]);

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
      const clone: TemplateElement = JSON.parse(JSON.stringify(el));
      clone.id = generateId();
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
  }, [handleDelete, handleDuplicate, doc.elements, selectedIds, handleUpdateElements]);


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
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <SidebarRoot
          onAddElement={handleAddElement}
          elements={doc.elements}
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

        {/* Canvas Area */}
        <div className="flex-1 relative flex flex-col min-w-0">
          <CanvasArea
            document={doc}
            pageSettings={pageSettings}
            onChange={onChange}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onAddElement={handleAddElement}
            zoom={zoom}
            onZoomChange={setZoom}
          />

          <StatusBar
            zoom={zoom}
            onZoomChange={setZoom}
            selectionCount={selectedIds.length}
          />
        </div>

        {/* Inspector */}
        <InspectorRoot
          selectedIds={selectedIds}
          elements={doc.elements}
          onUpdateElement={handleUpdateElement}
          pageSettings={pageSettings}
          onPageSettingsChange={onPageSettingsChange}
        />
      </div>
    </div>
  );
}
