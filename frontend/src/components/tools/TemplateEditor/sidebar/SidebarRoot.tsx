import React, { useEffect, useState } from 'react';
import { Layers, Grid, LayoutTemplate, Library, ChevronLeft, ChevronRight } from 'lucide-react';
import { ElementsPalette } from './ElementsPalette';
import { LayersPanel } from './LayersPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { PublishedTemplatesPanel } from './PublishedTemplatesPanel';
import { ElementType, ElementPreset, BlockPreset } from '../canvasTypes';
import type { TemplateElement, VariableDefinition } from '../canvasTypes';
import type { CanvasDocument } from '../canvasTypes';

interface SidebarRootProps {
    width?: number;
    onAddElement: (
        type: ElementType,
        pos?: { x: number; y: number },
        presetId?: ElementPreset,
        overrides?: Partial<TemplateElement>,
    ) => void;
    onAddBlock?: (blockId: BlockPreset, pos?: { x: number; y: number }) => void;
    elements: TemplateElement[];
    variables?: VariableDefinition[] | null;
    onVariablesChange?: (variables: VariableDefinition[]) => void;
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
}

type TabId = 'elements' | 'layers' | 'templates' | 'published';

const TABS: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: 'elements', icon: <Grid size={18} />, label: 'Elementos' },
    { id: 'layers', icon: <Layers size={18} />, label: 'Capas' },
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
        const handleShortcut = (e: KeyboardEvent) => {
            const isTypingTarget =
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target instanceof HTMLElement && e.target.isContentEditable);
            if (isTypingTarget) return;

            if ((e.ctrlKey || e.metaKey) && e.code === 'Slash') {
                e.preventDefault();
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
            className="relative flex h-full flex-none border-r border-neutral-200 bg-white transition-[width] duration-200 ease-out"
            style={{ width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth }}
        >
            <div className={`w-12 flex flex-col items-center py-3 gap-1 bg-neutral-50/80 ${isCollapsed ? '' : 'border-r border-neutral-100'}`}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabClick(tab.id)}
                        className={`flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all ${
                            activeTab === tab.id
                                ? 'bg-violet-100 text-violet-700 shadow-sm'
                                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                        }`}
                        title={tab.label}
                    >
                        {tab.icon}
                    </button>
                ))}
            </div>

            {!isCollapsed && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-neutral-100 flex-shrink-0">
                        <h2 className="text-sm font-semibold text-neutral-700">
                            {TABS.find((t) => t.id === activeTab)?.label}
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0">
                        {activeTab === 'elements' && (
                            <ElementsPalette
                                onAddElement={(type, presetId) => props.onAddElement(type, undefined, presetId)}
                                onAddBlock={props.onAddBlock ? (blockId) => props.onAddBlock!(blockId) : undefined}
                            />
                        )}
                        {activeTab === 'layers' && (
                            <LayersPanel
                                elements={props.elements}
                                selectedIds={props.selectedIds}
                                onSelect={props.onSelect}
                                onToggleLock={props.onToggleLock}
                                onToggleVisible={props.onToggleVisible}
                                onReorder={props.onReorder}
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
                className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-12 rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm hover:text-violet-600 hover:border-violet-300 transition-colors flex items-center justify-center z-10"
                title={isCollapsed ? 'Mostrar panel (Ctrl+/)' : 'Ocultar panel (Ctrl+/)'}
                aria-label={isCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
            >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
        </div>
    );
}
