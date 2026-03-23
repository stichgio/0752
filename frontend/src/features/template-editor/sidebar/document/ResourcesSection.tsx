import React, { useState } from 'react';
import { Boxes, Package, Palette } from 'lucide-react';
import { ComponentsPanel } from '../ComponentsPanel';
import { BrandKitsPanel } from '../BrandKitsPanel';
import { VariantsPanel } from '../VariantsPanel';
import { Accordion } from './Accordion';
import type { BrandKit, CanvasComponent, CanvasDocument, CanvasVariant } from '../../canvasTypes';

interface ResourcesSectionProps {
  document: CanvasDocument;
  selectedIds: string[];
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
}

type SubSection = 'components' | 'brandkits' | 'variants' | null;

export function ResourcesSection({
  document,
  selectedIds,
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
}: ResourcesSectionProps) {
  const [openSub, setOpenSub] = useState<SubSection>('components');

  const toggle = (sub: SubSection) => setOpenSub((prev) => (prev === sub ? null : sub));

  const componentCount = (document.components || []).length;
  const brandKitCount = (document.brandKits || []).length;
  const variantCount = (document.variants || []).length;

  return (
    <div className="space-y-0 divide-y divide-neutral-100 rounded-xl border border-neutral-200 overflow-hidden">
      <Accordion
        icon={<Boxes size={12} />}
        title="Componentes"
        badge={componentCount}
        isOpen={openSub === 'components'}
        onToggle={() => toggle('components')}
      >
        <ComponentsPanel
          document={document}
          selectedIds={selectedIds}
          onCreateComponentFromSelection={onCreateComponentFromSelection}
          onInsertComponent={onInsertComponent}
          onSyncComponent={onSyncComponent}
          onUpdateComponentFromSelection={onUpdateComponentFromSelection}
          onUpdateComponent={onUpdateComponent}
          onDeleteComponent={onDeleteComponent}
        />
      </Accordion>

      <Accordion
        icon={<Palette size={12} />}
        title="Brand Kits"
        badge={brandKitCount}
        isOpen={openSub === 'brandkits'}
        onToggle={() => toggle('brandkits')}
      >
        <BrandKitsPanel
          document={document}
          onCreateBrandKit={onCreateBrandKit}
          onApplyBrandKit={onApplyBrandKit}
          onUpdateBrandKit={onUpdateBrandKit}
          onDeleteBrandKit={onDeleteBrandKit}
        />
      </Accordion>

      <Accordion
        icon={<Package size={12} />}
        title="Variantes"
        badge={variantCount}
        isOpen={openSub === 'variants'}
        onToggle={() => toggle('variants')}
      >
        <VariantsPanel
          document={document}
          onCreateVariant={onCreateVariant}
          onApplyVariant={onApplyVariant}
          onUpdateVariant={onUpdateVariant}
          onDeleteVariant={onDeleteVariant}
        />
      </Accordion>
    </div>
  );
}
