import React, { useMemo, useState } from 'react';
import { Database, LayoutTemplate, Palette, Server } from 'lucide-react';
import {
  type BrandKit,
  type CanvasComponent,
  type CanvasDocument,
  type CanvasVariant,
  type DocumentTheme,
  type TemplateValidationIssue,
  type VariableDefinition,
} from '../canvasTypes';
import { DocOverview } from './document/DocOverview';
import { Accordion } from './document/Accordion';
import { StructureSection } from './document/StructureSection';
import { DataSection } from './document/DataSection';
import { ResourcesSection } from './document/ResourcesSection';
import { AppearanceSection } from './document/AppearanceSection';

type DataSourceDefinition = NonNullable<CanvasDocument['dataSourceDefinition']>;
type Section = 'estructura' | 'datos' | 'recursos' | 'apariencia' | null;

interface DocumentPanelProps {
  document: CanvasDocument;
  activePageId: string;
  pageElements: CanvasDocument['elements'];
  selectedIds: string[];
  variables: VariableDefinition[];
  onVariablesChange: (variables: VariableDefinition[]) => void;
  theme?: DocumentTheme;
  onThemeChange: (theme: DocumentTheme) => void;
  dataSourceDefinition?: CanvasDocument['dataSourceDefinition'];
  onDataSourceDefinitionChange: (definition: DataSourceDefinition) => void;
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
  // New optional props
  validationIssues?: TemplateValidationIssue[];
  dataPreview?: Record<string, unknown>;
  onInsertBoundField?: (fieldKey: string, label?: string) => void;
}

export function DocumentPanel({
  document,
  activePageId,
  pageElements,
  selectedIds,
  variables,
  onVariablesChange,
  theme,
  onThemeChange,
  dataSourceDefinition,
  onDataSourceDefinitionChange,
  onSetActivePage,
  onCreatePage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  onCreateComponentFromSelection,
  onInsertComponent,
  onSyncComponent,
  onUpdateComponentFromSelection,
  onUpdateComponent,
  onDeleteComponent,
  onCreateBrandKit,
  onApplyBrandKit,
  onUpdateBrandKit,
  onDeleteBrandKit,
  onCreateVariant,
  onApplyVariant,
  onUpdateVariant,
  onDeleteVariant,
  validationIssues = [],
  dataPreview,
  onInsertBoundField,
}: DocumentPanelProps) {
  const [openSection, setOpenSection] = useState<Section>('estructura');

  const toggle = (section: Section) =>
    setOpenSection((prev) => (prev === section ? null : section));

  const pageCount = (document.pages || []).length;
  const fieldCount = Array.isArray(dataSourceDefinition?.fields)
    ? dataSourceDefinition.fields.length
    : 0;
  const componentCount = (document.components || []).length;
  const brandKitCount = (document.brandKits || []).length;
  const variantCount = (document.variants || []).length;
  const resourceCount = componentCount + brandKitCount + variantCount;
  const themeColorCount = (document.theme?.colorTokens || []).length;
  const themeTextCount = (document.theme?.textStyles || []).length;
  const themeCount = themeColorCount + themeTextCount;

  const dataCount = fieldCount + variables.length;

  return (
    <div className="flex h-full flex-col" data-testid="document-panel">
      {/* Sticky overview header */}
      <DocOverview
        document={document}
        activePageId={activePageId}
        pageElementsCount={pageElements.length}
        fieldCount={fieldCount}
        variableCount={variables.length}
        validationIssues={validationIssues}
      />

      {/* Accordions — single open */}
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
        <Accordion
          icon={<LayoutTemplate size={12} />}
          title="Estructura"
          badge={pageCount}
          isOpen={openSection === 'estructura'}
          onToggle={() => toggle('estructura')}
        >
          <StructureSection
            document={document}
            activePageId={activePageId}
            onSetActivePage={onSetActivePage}
            onCreatePage={onCreatePage}
            onRenamePage={onRenamePage}
            onDuplicatePage={onDuplicatePage}
            onDeletePage={onDeletePage}
            onMovePage={onMovePage}
          />
        </Accordion>

        <Accordion
          icon={<Database size={12} />}
          title="Datos"
          badge={dataCount}
          isOpen={openSection === 'datos'}
          onToggle={() => toggle('datos')}
        >
          <DataSection
            variables={variables}
            onVariablesChange={onVariablesChange}
            dataSourceDefinition={dataSourceDefinition}
            onDataSourceDefinitionChange={onDataSourceDefinitionChange}
            dataPreview={dataPreview}
            onInsertBoundField={onInsertBoundField}
          />
        </Accordion>

        <Accordion
          icon={<Server size={12} />}
          title="Recursos"
          badge={resourceCount > 0 ? resourceCount : undefined}
          isOpen={openSection === 'recursos'}
          onToggle={() => toggle('recursos')}
        >
          <ResourcesSection
            document={document}
            selectedIds={selectedIds}
            onCreateComponentFromSelection={onCreateComponentFromSelection}
            onInsertComponent={onInsertComponent}
            onSyncComponent={onSyncComponent}
            onUpdateComponentFromSelection={onUpdateComponentFromSelection}
            onUpdateComponent={onUpdateComponent}
            onDeleteComponent={onDeleteComponent}
            onCreateBrandKit={onCreateBrandKit}
            onApplyBrandKit={onApplyBrandKit}
            onUpdateBrandKit={onUpdateBrandKit}
            onDeleteBrandKit={onDeleteBrandKit}
            onCreateVariant={onCreateVariant}
            onApplyVariant={onApplyVariant}
            onUpdateVariant={onUpdateVariant}
            onDeleteVariant={onDeleteVariant}
          />
        </Accordion>

        <Accordion
          icon={<Palette size={12} />}
          title="Apariencia"
          badge={themeCount > 0 ? themeCount : undefined}
          isOpen={openSection === 'apariencia'}
          onToggle={() => toggle('apariencia')}
        >
          <AppearanceSection
            theme={theme}
            onThemeChange={onThemeChange}
          />
        </Accordion>
      </div>
    </div>
  );
}
