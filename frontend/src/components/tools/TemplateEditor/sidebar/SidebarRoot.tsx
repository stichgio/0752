import React, { useState } from 'react';
import { Layers, Grid, LayoutTemplate, Settings2 } from 'lucide-react';
import { ElementsPalette } from './ElementsPalette';
import { LayersPanel } from './LayersPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { ElementType } from '../canvasTypes';
import type { CanvasDocument } from '../canvasTypes';

interface SidebarRootProps {
    onAddElement: (type: ElementType, pos?: { x: number; y: number }) => void;
    elements: any[];
    selectedIds: string[];
    onSelect: (id: string, multi: boolean) => void;
    onToggleLock: (id: string) => void;
    onToggleVisible: (id: string) => void;
    onReorder: (dragIndex: number, hoverIndex: number) => void;
    onLoadTemplate?: (doc: CanvasDocument) => void;
    currentDocName?: string;
    isDirty?: boolean;
}

type TabId = 'elements' | 'layers' | 'templates' | 'settings';

const TABS: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: 'elements', icon: <Grid size={18} />, label: 'Elementos' },
    { id: 'layers', icon: <Layers size={18} />, label: 'Capas' },
    { id: 'templates', icon: <LayoutTemplate size={18} />, label: 'Plantillas' },
    { id: 'settings', icon: <Settings2 size={18} />, label: 'Ajustes' },
];

export function SidebarRoot(props: SidebarRootProps) {
    const [activeTab, setActiveTab] = useState<TabId>('elements');

    return (
        <div className="flex h-full border-r border-neutral-200 bg-white" style={{ width: 280 }}>
            {/* Tab icons strip */}
            <div className="w-12 flex flex-col items-center py-3 gap-1 border-r border-neutral-100 bg-neutral-50/80">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all ${activeTab === tab.id
                                ? 'bg-violet-100 text-violet-700 shadow-sm'
                                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                            }`}
                        title={tab.label}
                    >
                        {tab.icon}
                    </button>
                ))}
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="px-3 py-2.5 border-b border-neutral-100 flex-shrink-0">
                    <h2 className="text-sm font-semibold text-neutral-700">
                        {TABS.find(t => t.id === activeTab)?.label}
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'elements' && (
                        <ElementsPalette onAddElement={(type) => props.onAddElement(type)} />
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
                    {activeTab === 'settings' && (
                        <div className="p-4 text-center">
                            <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <Settings2 size={20} className="text-neutral-400" />
                            </div>
                            <p className="text-sm text-neutral-500">Ajustes de página</p>
                            <p className="text-xs text-neutral-400 mt-1">Próximamente</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
