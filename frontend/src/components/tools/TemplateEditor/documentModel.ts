import type {
  AssetLibraryItem,
  BindingDefinition,
  BrandKit,
  CanvasComponent,
  CanvasDocument,
  CanvasPage,
  CanvasVariant,
  DocumentTheme,
  PageSettings,
  TemplateElement,
  TemplateValidationIssue,
} from './canvasTypes';
import {
  createDefaultPageSettings,
  ensureDocumentPages,
  generateId,
  normalizePageSettings,
  normalizeVariableRegistry,
} from './canvasTypes';

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeLabel(value: string, fallback: string): string {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function ensureTheme(theme: DocumentTheme | undefined): DocumentTheme {
  return {
    textStyles: Array.isArray(theme?.textStyles) ? theme?.textStyles : [],
    colorTokens: Array.isArray(theme?.colorTokens) ? theme?.colorTokens : [],
  };
}

function ensureBrandKits(brandKits: CanvasDocument['brandKits']): BrandKit[] {
  if (!Array.isArray(brandKits)) return [];
  return brandKits.map((brandKit, index) => ({
    id: brandKit?.id || `brand-kit-${index + 1}`,
    name: safeLabel(brandKit?.name || '', `Brand kit ${index + 1}`),
    description: brandKit?.description,
    colorTokens: Array.isArray(brandKit?.colorTokens) ? brandKit.colorTokens : [],
    textStyles: Array.isArray(brandKit?.textStyles) ? brandKit.textStyles : [],
    logos: {
      left: typeof brandKit?.logos?.left === 'string' ? brandKit.logos.left : undefined,
      right: typeof brandKit?.logos?.right === 'string' ? brandKit.logos.right : undefined,
    },
    backgroundColor: typeof brandKit?.backgroundColor === 'string' ? brandKit.backgroundColor : undefined,
    createdAt: brandKit?.createdAt || nowIso(),
    updatedAt: brandKit?.updatedAt || nowIso(),
  }));
}

function ensureAssets(assets: CanvasDocument['assetLibrary']): AssetLibraryItem[] {
  if (!Array.isArray(assets)) return [];
  return assets.map((asset, index) => ({
    id: asset?.id || `asset_${index + 1}`,
    name: safeLabel(asset?.name || '', `Asset ${index + 1}`),
    type: asset?.type === 'logo' ? 'logo' : 'image',
    url: typeof asset?.url === 'string' ? asset.url : '',
    tags: Array.isArray(asset?.tags) ? asset.tags.filter(Boolean) : [],
    folder: typeof asset?.folder === 'string' ? asset.folder : '',
    sourceType: asset?.sourceType === 'inline' || asset?.sourceType === 'local' ? asset.sourceType : 'remote',
    createdAt: asset?.createdAt || nowIso(),
    updatedAt: asset?.updatedAt || nowIso(),
    missing: asset?.missing === true,
  }));
}

function ensureBindingMap(bindingMap: CanvasDocument['bindingMap']): Record<string, BindingDefinition> {
  if (!bindingMap || typeof bindingMap !== 'object') return {};
  const entries = Object.entries(bindingMap);
  return Object.fromEntries(entries.map(([key, binding], index) => [
    key,
    {
      id: binding?.id || `binding_${index + 1}`,
      elementId: binding?.elementId || key,
      target: binding?.target === 'logo' || binding?.target === 'image' || binding?.target === 'qr' ? binding.target : 'variable',
      mode: binding?.mode === 'field' || binding?.mode === 'asset' || binding?.mode === 'brand-kit' ? binding.mode : 'expression',
      sourceField: typeof binding?.sourceField === 'string' ? binding.sourceField : undefined,
      expression: typeof binding?.expression === 'string' ? binding.expression : undefined,
      fallback: typeof binding?.fallback === 'string' ? binding.fallback : undefined,
      assetId: typeof binding?.assetId === 'string' ? binding.assetId : undefined,
      brandKitSlot: binding?.brandKitSlot === 'right' ? 'right' : (binding?.brandKitSlot === 'left' ? 'left' : undefined),
      previewLabel: typeof binding?.previewLabel === 'string' ? binding.previewLabel : undefined,
    },
  ]));
}

function ensureComponents(components: CanvasDocument['components']): CanvasComponent[] {
  if (!Array.isArray(components)) return [];
  return components.map((component, index) => ({
    id: component?.id || `component_${index + 1}`,
    name: safeLabel(component?.name || '', `Componente ${index + 1}`),
    elements: Array.isArray(component?.elements) ? component.elements.map((element) => cloneDeep(element)) : [],
    width: typeof component?.width === 'number' ? component.width : 10,
    height: typeof component?.height === 'number' ? component.height : 10,
    version: typeof component?.version === 'number' ? component.version : 1,
    createdAt: component?.createdAt || nowIso(),
    updatedAt: component?.updatedAt || nowIso(),
  }));
}

function ensureVariants(variants: CanvasDocument['variants']): CanvasVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants.map((variant, index) => ({
    id: variant?.id || `variant_${index + 1}`,
    name: safeLabel(variant?.name || '', `Variante ${index + 1}`),
    description: variant?.description,
    brandKitId: typeof variant?.brandKitId === 'string' ? variant.brandKitId : undefined,
    theme: ensureTheme(variant?.theme),
    pageSettings: variant?.pageSettings || {},
    sampleData: variant?.sampleData && typeof variant.sampleData === 'object' ? variant.sampleData : undefined,
  }));
}

export function getPageForElement(doc: CanvasDocument, elementId: string): CanvasPage | undefined {
  return ensureDocumentPages(doc).find((page) => page.elementIds.includes(elementId));
}

export function ensureCanvasDocument(doc: CanvasDocument): CanvasDocument {
  const basePages = ensureDocumentPages(doc);
  const pages = basePages.map((page, index) => ({
    id: page?.id || `page-${index + 1}`,
    name: safeLabel(page?.name || '', `PÃ¡gina ${index + 1}`),
    elementIds: Array.isArray(page?.elementIds) ? page.elementIds.filter(Boolean) : [],
    thumbnail: typeof page?.thumbnail === 'string' ? page.thumbnail : undefined,
  }));

  const knownPageIds = new Set(pages.map((page) => page.id));
  const pageMembership = new Map<string, string>();
  pages.forEach((page) => {
    page.elementIds.forEach((elementId) => {
      if (!pageMembership.has(elementId)) {
        pageMembership.set(elementId, page.id);
      }
    });
  });

  const fallbackPageId = pages[0]?.id || 'page-1';
  const elements = Array.isArray(doc.elements)
    ? doc.elements.map((element) => {
        const cloned = cloneDeep(element);
        const resolvedPageId =
          (typeof cloned.pageId === 'string' && knownPageIds.has(cloned.pageId) && cloned.pageId) ||
          pageMembership.get(cloned.id) ||
          fallbackPageId;
        cloned.pageId = resolvedPageId;
        return cloned;
      })
    : [];

  const pageElementMap = new Map<string, string[]>();
  pages.forEach((page) => pageElementMap.set(page.id, []));
  elements.forEach((element) => {
    const pageId = element.pageId || fallbackPageId;
    if (!pageElementMap.has(pageId)) pageElementMap.set(pageId, []);
    pageElementMap.get(pageId)?.push(element.id);
  });

  const normalizedPages = pages.map((page) => ({
    ...page,
    elementIds: pageElementMap.get(page.id) || [],
  }));

  return {
    ...doc,
    elements,
    pages: normalizedPages,
    variables: normalizeVariableRegistry(doc.variables),
    theme: ensureTheme(doc.theme),
    assetLibrary: ensureAssets(doc.assetLibrary),
    components: ensureComponents(doc.components),
    variants: ensureVariants(doc.variants),
    brandKits: ensureBrandKits(doc.brandKits),
    bindingMap: ensureBindingMap(doc.bindingMap),
    activePageId: typeof doc.activePageId === 'string' && pageElementMap.has(doc.activePageId) ? doc.activePageId : fallbackPageId,
    activeVariantId: typeof doc.activeVariantId === 'string' ? doc.activeVariantId : null,
    brandKitId: typeof doc.brandKitId === 'string' ? doc.brandKitId : null,
    assetRefs: doc.assetRefs && typeof doc.assetRefs === 'object' ? doc.assetRefs : {},
    pageSettings: normalizePageSettings(doc.pageSettings || createDefaultPageSettings()),
    dataSourceDefinition: {
      schemaVersion: doc.dataSourceDefinition?.schemaVersion || '1.0',
      fields: Array.isArray(doc.dataSourceDefinition?.fields) ? doc.dataSourceDefinition?.fields : [],
      ...(doc.dataSourceDefinition?.notes ? { notes: doc.dataSourceDefinition.notes } : {}),
    },
  };
}

export function getActivePageId(doc: CanvasDocument): string {
  const normalized = ensureCanvasDocument(doc);
  return normalized.activePageId || normalized.pages?.[0]?.id || 'page-1';
}

export function getPageElements(doc: CanvasDocument, pageId: string): TemplateElement[] {
  const normalized = ensureCanvasDocument(doc);
  return normalized.elements.filter((element) => element.pageId === pageId);
}

export function setActivePage(doc: CanvasDocument, pageId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const exists = normalized.pages?.some((page) => page.id === pageId);
  if (!exists) return normalized;
  return { ...normalized, activePageId: pageId };
}

export function addElementToPage(doc: CanvasDocument, element: TemplateElement, pageId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const nextElement = { ...cloneDeep(element), pageId };
  return ensureCanvasDocument({
    ...normalized,
    elements: [...normalized.elements, nextElement],
  });
}

export function addElementsToPage(doc: CanvasDocument, elements: TemplateElement[], pageId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    elements: [...normalized.elements, ...elements.map((element) => ({ ...cloneDeep(element), pageId }))],
  });
}

export function removeElementsFromDocument(doc: CanvasDocument, elementIds: string[]): CanvasDocument {
  const toRemove = new Set(elementIds);
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    elements: normalized.elements.filter((element) => !toRemove.has(element.id)),
  });
}

export function updateElementsInDocument(doc: CanvasDocument, updater: (element: TemplateElement) => TemplateElement): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    elements: normalized.elements.map((element) => updater(cloneDeep(element))),
  });
}

export function createPage(doc: CanvasDocument, name?: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const index = (normalized.pages?.length || 0) + 1;
  const page: CanvasPage = {
    id: `page-${generateId()}`,
    name: safeLabel(name || '', `PÃ¡gina ${index}`),
    elementIds: [],
  };
  return ensureCanvasDocument({
    ...normalized,
    pages: [...(normalized.pages || []), page],
    activePageId: page.id,
  });
}

export function renamePage(doc: CanvasDocument, pageId: string, name: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    pages: (normalized.pages || []).map((page) => page.id === pageId ? { ...page, name: safeLabel(name, page.name) } : page),
  });
}

export function reorderPages(doc: CanvasDocument, sourceIndex: number, targetIndex: number): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const pages = [...(normalized.pages || [])];
  if (sourceIndex < 0 || sourceIndex >= pages.length || targetIndex < 0 || targetIndex >= pages.length) return normalized;
  const [moved] = pages.splice(sourceIndex, 1);
  pages.splice(targetIndex, 0, moved);
  return ensureCanvasDocument({ ...normalized, pages });
}

export function duplicatePage(doc: CanvasDocument, pageId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const page = (normalized.pages || []).find((item) => item.id === pageId);
  if (!page) return normalized;
  const sourceElements = getPageElements(normalized, pageId);
  const duplicatePageId = `page-${generateId()}`;
  const duplicatedElements = sourceElements.map((element) => {
    const clone = cloneDeep(element);
    clone.id = generateId();
    clone.name = `${element.name} (copia)`;
    clone.pageId = duplicatePageId;
    clone.position = { x: element.position.x + 5, y: element.position.y + 5 };
    if (clone.type === 'group' && Array.isArray(clone.groupChildren)) {
      clone.groupChildren = clone.groupChildren.map((child) => ({ ...child, id: generateId() }));
      clone.children = clone.groupChildren.map((child) => child.id);
    }
    return clone;
  });
  const nextPage: CanvasPage = {
    id: duplicatePageId,
    name: `${page.name} copia`,
    elementIds: duplicatedElements.map((element) => element.id),
  };
  const pages = [...(normalized.pages || [])];
  const pageIndex = pages.findIndex((item) => item.id === pageId);
  pages.splice(pageIndex + 1, 0, nextPage);
  return ensureCanvasDocument({
    ...normalized,
    pages,
    elements: [...normalized.elements, ...duplicatedElements],
    activePageId: duplicatePageId,
  });
}

export function deletePage(doc: CanvasDocument, pageId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const pages = normalized.pages || [];
  if (pages.length <= 1) return normalized;
  const pageIndex = pages.findIndex((page) => page.id === pageId);
  if (pageIndex === -1) return normalized;
  const nextPages = pages.filter((page) => page.id !== pageId);
  const removedIds = new Set(getPageElements(normalized, pageId).map((element) => element.id));
  const nextActivePageId = nextPages[Math.max(0, pageIndex - 1)]?.id || nextPages[0]?.id || 'page-1';
  return ensureCanvasDocument({
    ...normalized,
    pages: nextPages,
    elements: normalized.elements.filter((element) => !removedIds.has(element.id)),
    activePageId: nextActivePageId,
  });
}

function computeBounds(elements: TemplateElement[]) {
  const minX = Math.min(...elements.map((element) => element.position.x));
  const minY = Math.min(...elements.map((element) => element.position.y));
  const maxX = Math.max(...elements.map((element) => element.position.x + element.size.width));
  const maxY = Math.max(...elements.map((element) => element.position.y + element.size.height));
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function relativeElements(elements: TemplateElement[]): { elements: TemplateElement[]; width: number; height: number } {
  const bounds = computeBounds(elements);
  return {
    width: bounds.width,
    height: bounds.height,
    elements: elements.map((element) => ({
      ...cloneDeep(element),
      pageId: undefined,
      position: {
        x: element.position.x - bounds.minX,
        y: element.position.y - bounds.minY,
      },
    })),
  };
}

export function saveSelectionAsComponent(doc: CanvasDocument, selectedIds: string[], explicitName?: string): { doc: CanvasDocument; component: CanvasComponent | null } {
  const normalized = ensureCanvasDocument(doc);
  const selectedElements = normalized.elements.filter((element) => selectedIds.includes(element.id));
  if (selectedElements.length === 0) {
    return { doc: normalized, component: null };
  }
  const componentShape = relativeElements(selectedElements);
  const component: CanvasComponent = {
    id: `component_${generateId()}`,
    name: safeLabel(explicitName || '', selectedElements[0]?.name || 'Componente'),
    elements: componentShape.elements,
    width: componentShape.width,
    height: componentShape.height,
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return {
    doc: ensureCanvasDocument({
      ...normalized,
      components: [...(normalized.components || []), component],
    }),
    component,
  };
}

function buildComponentGroup(component: CanvasComponent, pageId: string, position?: { x: number; y: number }): TemplateElement {
  const children = component.elements.map((element, index) => ({
    ...cloneDeep(element),
    id: generateId(),
    style: { ...element.style, zIndex: element.style.zIndex || index + 1 },
  }));
  return {
    id: generateId(),
    type: 'group',
    name: component.name,
    pageId,
    position: position || { x: 12, y: 12 },
    size: { width: component.width, height: component.height },
    style: {
      backgroundColor: 'transparent',
      borderColor: '#60a5fa',
      borderWidth: 1,
      borderStyle: 'dashed',
      zIndex: 1,
    },
    visible: true,
    locked: false,
    children: children.map((child) => child.id),
    groupChildren: children,
    componentId: component.id,
    componentInstanceId: `instance_${generateId()}`,
    componentVersion: component.version,
    componentDetached: false,
  };
}

export function insertComponentInstance(doc: CanvasDocument, componentId: string, pageId?: string, position?: { x: number; y: number }): { doc: CanvasDocument; elementId: string | null } {
  const normalized = ensureCanvasDocument(doc);
  const component = (normalized.components || []).find((item) => item.id === componentId);
  if (!component) {
    return { doc: normalized, elementId: null };
  }
  const targetPageId = pageId || getActivePageId(normalized);
  const group = buildComponentGroup(component, targetPageId, position);
  return {
    doc: addElementToPage(normalized, group, targetPageId),
    elementId: group.id,
  };
}

export function syncComponentInstances(doc: CanvasDocument, componentId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const component = (normalized.components || []).find((item) => item.id === componentId);
  if (!component) return normalized;
  const nextElements = normalized.elements.map((element) => {
    if (element.type !== 'group' || element.componentId !== componentId || element.componentDetached) {
      return element;
    }
    const refreshed = buildComponentGroup(component, element.pageId || getActivePageId(normalized), element.position);
    return {
      ...refreshed,
      id: element.id,
      name: element.name,
      pageId: element.pageId,
      style: { ...element.style, zIndex: element.style.zIndex || refreshed.style.zIndex },
      componentInstanceId: element.componentInstanceId,
      componentVersion: component.version,
      componentDetached: element.componentDetached,
    };
  });
  return ensureCanvasDocument({ ...normalized, elements: nextElements });
}

export function updateComponentFromInstance(doc: CanvasDocument, componentId: string, groupId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const sourceGroup = normalized.elements.find((element) => element.id === groupId && element.type === 'group' && element.componentId === componentId);
  if (!sourceGroup || !Array.isArray(sourceGroup.groupChildren) || sourceGroup.groupChildren.length === 0) return normalized;
  const relative = relativeElements(sourceGroup.groupChildren);
  const components = (normalized.components || []).map((component) => component.id === componentId ? {
    ...component,
    elements: relative.elements,
    width: relative.width,
    height: relative.height,
    version: component.version + 1,
    updatedAt: nowIso(),
  } : component);
  return syncComponentInstances({ ...normalized, components }, componentId);
}

export function setComponentDetached(doc: CanvasDocument, groupId: string, detached: boolean): CanvasDocument {
  return updateElementsInDocument(doc, (element) => element.id === groupId ? { ...element, componentDetached: detached } : element);
}

export function updateComponent(doc: CanvasDocument, componentId: string, updates: Partial<CanvasComponent>): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    components: (normalized.components || []).map((component) => component.id === componentId ? { ...component, ...cloneDeep(updates), updatedAt: nowIso() } : component),
  });
}

export function deleteComponent(doc: CanvasDocument, componentId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    components: (normalized.components || []).filter((component) => component.id !== componentId),
    elements: normalized.elements.map((element) => element.componentId === componentId ? { ...element, componentId: undefined, componentInstanceId: undefined, componentVersion: undefined, componentDetached: true } : element),
  });
}

export function createBrandKit(doc: CanvasDocument, name?: string): { doc: CanvasDocument; brandKit: BrandKit } {
  const normalized = ensureCanvasDocument(doc);
  const nextIndex = (normalized.brandKits || []).length + 1;
  const brandKit: BrandKit = {
    id: `brand_${generateId()}`,
    name: safeLabel(name || '', `Brand kit ${nextIndex}`),
    colorTokens: cloneDeep(normalized.theme?.colorTokens || []),
    textStyles: cloneDeep(normalized.theme?.textStyles || []),
    backgroundColor: normalized.pageSettings.backgroundColor,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return {
    doc: ensureCanvasDocument({
      ...normalized,
      brandKits: [...(normalized.brandKits || []), brandKit],
    }),
    brandKit,
  };
}

export function applyBrandKit(doc: CanvasDocument, brandKitId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const brandKit = (normalized.brandKits || []).find((item) => item.id === brandKitId);
  if (!brandKit) return normalized;
  return ensureCanvasDocument({
    ...normalized,
    brandKitId,
    theme: {
      textStyles: cloneDeep(brandKit.textStyles || normalized.theme?.textStyles || []),
      colorTokens: cloneDeep(brandKit.colorTokens || normalized.theme?.colorTokens || []),
    },
    pageSettings: {
      ...normalized.pageSettings,
      ...(brandKit.backgroundColor ? { backgroundColor: brandKit.backgroundColor } : {}),
    },
  });
}

export function updateBrandKit(doc: CanvasDocument, brandKitId: string, updates: Partial<BrandKit>): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    brandKits: (normalized.brandKits || []).map((brandKit) => brandKit.id === brandKitId ? { ...brandKit, ...cloneDeep(updates), updatedAt: nowIso() } : brandKit),
  });
}

export function deleteBrandKit(doc: CanvasDocument, brandKitId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    brandKits: (normalized.brandKits || []).filter((brandKit) => brandKit.id !== brandKitId),
    variants: (normalized.variants || []).map((variant) => variant.brandKitId === brandKitId ? { ...variant, brandKitId: undefined } : variant),
    brandKitId: normalized.brandKitId === brandKitId ? null : normalized.brandKitId,
  });
}

export function createVariant(doc: CanvasDocument, name?: string): { doc: CanvasDocument; variant: CanvasVariant } {
  const normalized = ensureCanvasDocument(doc);
  const variant: CanvasVariant = {
    id: `variant_${generateId()}`,
    name: safeLabel(name || '', `Variante ${(normalized.variants || []).length + 1}`),
    brandKitId: normalized.brandKitId || undefined,
    theme: cloneDeep(normalized.theme),
    pageSettings: { backgroundColor: normalized.pageSettings.backgroundColor },
  };
  return {
    doc: ensureCanvasDocument({
      ...normalized,
      variants: [...(normalized.variants || []), variant],
    }),
    variant,
  };
}

export function updateVariant(doc: CanvasDocument, variantId: string, updates: Partial<CanvasVariant>): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    variants: (normalized.variants || []).map((variant) => variant.id === variantId ? { ...variant, ...cloneDeep(updates) } : variant),
  });
}

export function deleteVariant(doc: CanvasDocument, variantId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  return ensureCanvasDocument({
    ...normalized,
    variants: (normalized.variants || []).filter((variant) => variant.id !== variantId),
    activeVariantId: normalized.activeVariantId === variantId ? null : normalized.activeVariantId,
  });
}

export function applyVariantToDocument(doc: CanvasDocument, variantId?: string | null): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  if (!variantId) return normalized;
  const variant = (normalized.variants || []).find((item) => item.id === variantId);
  if (!variant) return normalized;
  const brandKit = variant.brandKitId ? (normalized.brandKits || []).find((item) => item.id === variant.brandKitId) : undefined;
  const nextTheme: DocumentTheme = {
    textStyles: cloneDeep(variant.theme?.textStyles || brandKit?.textStyles || normalized.theme?.textStyles || []),
    colorTokens: cloneDeep(variant.theme?.colorTokens || brandKit?.colorTokens || normalized.theme?.colorTokens || []),
  };
  const nextPageSettings: PageSettings = normalizePageSettings({
    ...normalized.pageSettings,
    ...(brandKit?.backgroundColor ? { backgroundColor: brandKit.backgroundColor } : {}),
    ...(variant.pageSettings || {}),
  });
  return ensureCanvasDocument({
    ...normalized,
    activeVariantId: variant.id,
    brandKitId: variant.brandKitId || normalized.brandKitId,
    theme: nextTheme,
    pageSettings: nextPageSettings,
  });
}

export function bindingToExpression(binding: BindingDefinition): string {
  if (binding.mode === 'field' && binding.sourceField) {
    const fallback = binding.fallback ?? '-';
    return `report.data.get('${binding.sourceField}', '${fallback}')`;
  }
  if (binding.mode === 'brand-kit' && binding.brandKitSlot) {
    return binding.brandKitSlot === 'right' ? 'logo_right' : 'logo_left';
  }
  return binding.expression || '';
}

export function upsertBinding(doc: CanvasDocument, binding: BindingDefinition): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const expression = bindingToExpression(binding);
  const nextBindingMap = {
    ...(normalized.bindingMap || {}),
    [binding.elementId]: {
      ...binding,
      expression,
    },
  };
  const nextElements = normalized.elements.map((element) => {
    if (element.id !== binding.elementId) return element;
    const nextElement = { ...element, bindingId: binding.id };
    if (binding.target === 'variable') {
      nextElement.variableName = expression;
      nextElement.content = element.content || `{{${expression}}}`;
    }
    if (binding.target === 'logo') {
      nextElement.variableName = expression || nextElement.variableName;
    }
    if (binding.target === 'image' && binding.assetId) {
      nextElement.assetRefId = binding.assetId;
    }
    if (binding.target === 'qr') {
      nextElement.qrConfig = {
        content: expression,
        errorLevel: element.qrConfig?.errorLevel || 'M',
        foreground: element.qrConfig?.foreground || '#000000',
        background: element.qrConfig?.background || '#ffffff',
      };
    }
    return nextElement;
  });
  return ensureCanvasDocument({
    ...normalized,
    elements: nextElements,
    bindingMap: nextBindingMap,
  });
}

export function removeBinding(doc: CanvasDocument, elementId: string): CanvasDocument {
  const normalized = ensureCanvasDocument(doc);
  const nextBindingMap = { ...(normalized.bindingMap || {}) };
  delete nextBindingMap[elementId];
  return ensureCanvasDocument({ ...normalized, bindingMap: nextBindingMap });
}

function lookupPreviewValue(dataPreview: Record<string, unknown>, rawKey: string): unknown {
  const direct = dataPreview[rawKey];
  if (direct !== undefined) return direct;
  const lower = dataPreview[rawKey.toLowerCase()];
  if (lower !== undefined) return lower;
  const upper = dataPreview[rawKey.toUpperCase()];
  if (upper !== undefined) return upper;
  const insensitiveMatch = Object.keys(dataPreview).find((key) => key.localeCompare(rawKey, 'es', { sensitivity: 'base' }) === 0);
  return insensitiveMatch ? dataPreview[insensitiveMatch] : undefined;
}

export function resolvePreviewExpression(expression: string, dataPreview?: Record<string, unknown>): string {
  const raw = String(expression || '').trim();
  if (!raw) return '';
  if (!dataPreview) return raw;

  const reportDataMatch = raw.match(/^report\.data\.get\('([^']+)'(?:,\s*'([^']*)')?\)$/);
  if (reportDataMatch) {
    const value = lookupPreviewValue(dataPreview, reportDataMatch[1]);
    if (value !== undefined && value !== null && value !== '') return String(value);
    return reportDataMatch[2] || '-';
  }

  if (raw === 'report.images | length' || raw === 'report.images|length') {
    const imageCount = lookupPreviewValue(dataPreview, 'image_count') ?? lookupPreviewValue(dataPreview, 'img_count') ?? lookupPreviewValue(dataPreview, 'images_count');
    return imageCount === undefined ? raw : String(imageCount);
  }

  const direct = lookupPreviewValue(dataPreview, raw);
  if (direct !== undefined && direct !== null && direct !== '') return String(direct);
  return raw;
}

export function validateCanvasDocument(doc: CanvasDocument): TemplateValidationIssue[] {
  const normalized = ensureCanvasDocument(doc);
  const issues: TemplateValidationIssue[] = [];
  const pageIds = new Set((normalized.pages || []).map((page) => page.id));
  const assetIds = new Set((normalized.assetLibrary || []).map((asset) => asset.id));
  const brandKitIds = new Set((normalized.brandKits || []).map((brandKit) => brandKit.id));

  (normalized.pages || []).forEach((page, index) => {
    const elements = getPageElements(normalized, page.id).filter((element) => element.visible !== false);
    if (elements.length === 0) {
      issues.push({
        level: 'warning',
        code: 'PAGE_EMPTY',
        message: `La pÃ¡gina "${page.name}" estÃ¡ vacÃ­a`,
        path: `pages[${index}]`,
      });
    }
  });

  normalized.elements.forEach((element) => {
    if (!element.pageId || !pageIds.has(element.pageId)) {
      issues.push({
        level: 'error',
        code: 'PAGE_ORPHAN_ELEMENT',
        message: `El elemento "${element.name}" no pertenece a una pÃ¡gina vÃ¡lida`,
        path: `elements.${element.id}.pageId`,
      });
    }

    const right = element.position.x + element.size.width;
    const bottom = element.position.y + element.size.height;
    if (element.position.x < 0 || element.position.y < 0 || right > normalized.pageSettings.width || bottom > normalized.pageSettings.height) {
      issues.push({
        level: 'warning',
        code: 'ELEMENT_OUT_OF_BOUNDS',
        message: `El elemento "${element.name}" excede los lÃ­mites de la pÃ¡gina`,
        path: `elements.${element.id}`,
      });
    }

    if (element.type === 'variable' && !String(element.variableName || '').trim()) {
      issues.push({
        level: 'warning',
        code: 'VARIABLE_BINDING_MISSING',
        message: `La variable "${element.name}" no tiene binding configurado`,
        path: `elements.${element.id}.variableName`,
      });
    }

    if (element.assetRefId && !assetIds.has(element.assetRefId)) {
      issues.push({
        level: 'error',
        code: 'ASSET_REF_MISSING',
        message: `El asset referenciado por "${element.name}" no existe`,
        path: `elements.${element.id}.assetRefId`,
      });
    }
  });

  (normalized.components || []).forEach((component, index) => {
    if (!component.elements.length) {
      issues.push({
        level: 'warning',
        code: 'COMPONENT_EMPTY',
        message: `El componente "${component.name}" no tiene elementos`,
        path: `components[${index}]`,
      });
    }
  });

  (normalized.variants || []).forEach((variant, index) => {
    if (variant.brandKitId && !brandKitIds.has(variant.brandKitId)) {
      issues.push({
        level: 'warning',
        code: 'VARIANT_BRAND_KIT_MISSING',
        message: `La variante "${variant.name}" referencia un brand kit inexistente`,
        path: `variants[${index}].brandKitId`,
      });
    }
  });

  return issues;
}
