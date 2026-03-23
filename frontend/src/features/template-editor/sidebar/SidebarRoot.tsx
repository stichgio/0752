import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Grid,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Library,
} from 'lucide-react';
import { ElementsPalette } from './ElementsPalette';
import { LayersPanel } from './LayersPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { PublishedTemplatesPanel } from './PublishedTemplatesPanel';
import { DocumentPanel } from './DocumentPanel';
import { AssetsPanel } from './AssetsPanel';
import { ElementType, ElementPreset, BlockPreset } from '../canvasTypes';
import type {
  AssetLibraryItem,
  BrandKit,
  CanvasComponent,
  CanvasDocument,
  CanvasVariant,
  DocumentTheme,
  TemplateElement,
  TemplateValidationIssue,
  VariableDefinition,
} from '../canvasTypes';

interface SidebarRootProps {
  width?: number;
  document: CanvasDocument;
  activePageId: string;
  pageElements: TemplateElement[];
  onAddElement: (
    type: ElementType,
    pos?: { x: number; y: number },
    presetId?: ElementPreset,
    overrides?: Partial<TemplateElement>,
  ) => void;
  onAddBlock?: (blockId: BlockPreset, pos?: { x: number; y: number }) => void;
  variables?: VariableDefinition[] | null;
  onVariablesChange?: (variables: VariableDefinition[]) => void;
  documentTheme?: DocumentTheme;
  onThemeChange?: (theme: DocumentTheme) => void;
  dataSourceDefinition?: CanvasDocument['dataSourceDefinition'];
  onDataSourceDefinitionChange?: (definition: NonNullable<CanvasDocument['dataSourceDefinition']>) => void;
  assetLibrary?: AssetLibraryItem[];
  onAssetLibraryChange?: (assets: AssetLibraryItem[]) => void;
  onInsertAsset?: (asset: AssetLibraryItem) => void;
  selectedIds: string[];
  onSelect: (id: string, multi: boolean) => void;
  onToggleLock: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onReorder: (dragIndex: number, hoverIndex: number) => void;
  onLoadTemplate?: (doc: CanvasDocument) => void;
  currentDocName?: string;
  isDirty?: boolean;
  activePublishedTemplateId?: string | null;
  publishedTemplatesRefreshKey?: number;
  onUnpublishTemplate?: (templateId: string) => Promise<void> | void;
  onEditPublishedTemplate?: (templateId: string) => Promise<void> | void;
  onDeletePublishedTemplate?: (templateId: string) => Promise<void> | void;
  onRenameElement?: (id: string, name: string) => void;
  onSetActivePage: (pageId: string) => void;
  onCreatePage: (name?: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (sourceIndex: number, targetIndex: number) => void;
  onCreateComponentFromSelection: (name?: string) => void;
  onInsertComponent: (componentId: string) => void;
  onSyncComponent: (componentId: string) => void;
  onUpdateComponentFromSelection: (componentId: string, groupId: string) => void;
  onUpdateComponent: (componentId: string, updates: Partial<CanvasComponent>) => void;
  onDeleteComponent: (componentId: string) => void;
  onCreateBrandKit: (name?: string) => void;
  onApplyBrandKit: (brandKitId: string) => void;
  onUpdateBrandKit: (brandKitId: string, updates: Partial<BrandKit>) => void;
  onDeleteBrandKit: (brandKitId: string) => void;
  onCreateVariant: (name?: string) => void;
  onApplyVariant: (variantId?: string | null) => void;
  onUpdateVariant: (variantId: string, updates: Partial<CanvasVariant>) => void;
  onDeleteVariant: (variantId: string) => void;
  validationIssues?: TemplateValidationIssue[];
  dataPreview?: Record<string, unknown>;
  onInsertBoundField?: (fieldKey: string, label?: string) => void;
}

type TabId = 'elements' | 'assets' | 'layers' | 'document' | 'templates' | 'published';

const TABS: { id: TabId; icon: React.ReactNode; label: string }[] = [
  { id: 'elements', icon: <Grid size={18} />, label: 'Elementos' },
  { id: 'assets', icon: <ImageIcon size={18} />, label: 'Assets' },
  { id: 'layers', icon: <Layers size={18} />, label: 'Capas' },
  { id: 'document', icon: <FileText size={18} />, label: 'Documento' },
  { id: 'templates', icon: <LayoutTemplate size={18} />, label: 'Plantillas' },
  { id: 'published', icon: <Library size={18} />, label: 'Plantillas publicadas' },
];

const SIDEBAR_EXPANDED_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 48;

export function SidebarRoot(props: SidebarRootProps) {
  const [activeTab, setActiveTab] = useState<TabId>('elements');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarWidth = props.width ?? SIDEBAR_EXPANDED_WIDTH;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isTypingTarget =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (isTypingTarget) return;

      if ((event.ctrlKey || event.metaKey) && event.code === 'Slash') {
        event.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const handleTabClick = (tabId: TabId) => {
    setActiveTab(tabId);
    if (isCollapsed) setIsCollapsed(false);
  };

  return (
    <div
      className="relative flex h-full flex-none border-r border-neutral-200/70 bg-[#f9f8f7] transition-[width] duration-200 ease-out"
      style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth }}
    >
      {/* Tab rail */}
      <div className={`w-12 flex flex-col items-center gap-0.5 py-2.5 ${isCollapsed ? '' : 'border-r border-neutral-200/50'}`}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`relative flex h-10 w-10 flex-col items-center justify-center rounded-xl transition-all ${
              activeTab === tab.id
                ? 'bg-white text-violet-600 shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                : 'text-neutral-400 hover:bg-white/60 hover:text-neutral-600'
            }`}
            title={tab.label}
          >
            {activeTab === tab.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-violet-500" />
            )}
            {tab.icon}
          </button>
        ))}
      </div>

      {!isCollapsed && (
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white border-r-0">
          <div className="flex-none border-b border-neutral-100 px-3 py-2 flex items-center gap-2 bg-white/80 backdrop-blur-sm">
            <h2 className="text-xs font-semibold text-neutral-600 tracking-wide uppercase">
              {TABS.find((tab) => tab.id === activeTab)?.label}
            </h2>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#d4d4d8 transparent',
            }}
          >
            {activeTab === 'elements' && (
              <ElementsPalette
                onAddElement={(type, presetId) => props.onAddElement(type, undefined, presetId)}
                onAddBlock={props.onAddBlock ? (blockId) => props.onAddBlock?.(blockId) : undefined}
              />
            )}
            {activeTab === 'assets' && (
              <AssetsPanel
                assets={props.assetLibrary || []}
                onChange={props.onAssetLibraryChange || (() => {})}
                onInsertAsset={props.onInsertAsset || (() => {})}
              />
            )}
            {activeTab === 'layers' && (
              <LayersPanel
                elements={props.pageElements}
                selectedIds={props.selectedIds}
                onSelect={props.onSelect}
                onToggleLock={props.onToggleLock}
                onToggleVisible={props.onToggleVisible}
                onReorder={props.onReorder}
                onRenameElement={props.onRenameElement}
              />
            )}
            {activeTab === 'document' && (
              <DocumentPanel
                document={props.document}
                activePageId={props.activePageId}
                pageElements={props.pageElements}
                selectedIds={props.selectedIds}
                variables={props.variables || []}
                onVariablesChange={props.onVariablesChange || (() => {})}
                theme={props.documentTheme}
                onThemeChange={props.onThemeChange || (() => {})}
                dataSourceDefinition={props.dataSourceDefinition}
                onDataSourceDefinitionChange={props.onDataSourceDefinitionChange || (() => {})}
                onSetActivePage={props.onSetActivePage}
                onCreatePage={props.onCreatePage}
                onRenamePage={props.onRenamePage}
                onDuplicatePage={props.onDuplicatePage}
                onDeletePage={props.onDeletePage}
                onMovePage={props.onMovePage}
                onCreateComponentFromSelection={props.onCreateComponentFromSelection}
                onInsertComponent={props.onInsertComponent}
                onSyncComponent={props.onSyncComponent}
                onUpdateComponentFromSelection={props.onUpdateComponentFromSelection}
                onUpdateComponent={props.onUpdateComponent}
                onDeleteComponent={props.onDeleteComponent}
                onCreateBrandKit={props.onCreateBrandKit}
                onApplyBrandKit={props.onApplyBrandKit}
                onUpdateBrandKit={props.onUpdateBrandKit}
                onDeleteBrandKit={props.onDeleteBrandKit}
                onCreateVariant={props.onCreateVariant}
                onApplyVariant={props.onApplyVariant}
                onUpdateVariant={props.onUpdateVariant}
                onDeleteVariant={props.onDeleteVariant}
                validationIssues={props.validationIssues}
                dataPreview={props.dataPreview}
                onInsertBoundField={props.onInsertBoundField}
              />
            )}
            {activeTab === 'templates' && (
              <TemplatesPanel
                onLoadTemplate={props.onLoadTemplate ?? (() => {})}
                currentDocName={props.currentDocName}
                isDirty={props.isDirty}
              />
            )}
            {activeTab === 'published' && (
              <PublishedTemplatesPanel
                refreshKey={props.publishedTemplatesRefreshKey}
                activeTemplateId={props.activePublishedTemplateId}
                onUnpublishTemplate={props.onUnpublishTemplate}
                onEditPublishedTemplate={props.onEditPublishedTemplate}
                onDeletePublishedTemplate={props.onDeletePublishedTemplate}
              />
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="absolute top-1/2 -right-2.5 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-neutral-200/80 bg-white/90 backdrop-blur-sm text-neutral-400 shadow-sm transition-all hover:text-violet-600 hover:border-violet-200 hover:shadow-md"
        title={isCollapsed ? 'Mostrar panel (Ctrl+/)' : 'Ocultar panel (Ctrl+/)'}
        aria-label={isCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </div>
  );
}
