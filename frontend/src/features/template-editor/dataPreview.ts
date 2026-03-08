type PrimitivePreviewValue = string | number | boolean;
type PreviewRecord = Record<string, PrimitivePreviewValue>;
type JsonRecord = Record<string, unknown>;

type PreviewPathCopyRule = {
  from: string;
  to?: string;
};

type PreviewPrefixTransformRule = {
  sourcePrefix: string;
  targetPrefix: string;
};

type PreviewObjectEntriesRule = {
  path: string;
  copyEntries?: boolean;
  outputPrefix?: string;
  prefixTransforms?: PreviewPrefixTransformRule[];
};

type PreviewNestedSectionRule = {
  path: string;
  outputPrefix: string;
  sections: Array<{
    source: string;
    target: string;
  }>;
};

type PreviewCustomRule = (root: JsonRecord, preview: PreviewRecord) => void;

type DataPreviewMapping = {
  pathCopies?: PreviewPathCopyRule[];
  objectEntries?: PreviewObjectEntriesRule[];
  nestedSections?: PreviewNestedSectionRule[];
  customRules?: PreviewCustomRule[];
  fallbackToFlatten?: boolean;
};

const TECHNICAL_REPORT_NESTED_KEYS = new Set([
  'metadata',
  'header',
  'inspeccion',
  'medidas',
  'valvulas',
  'canastillas',
]);

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function normalizeReportRoot(report: unknown): JsonRecord {
  if (Array.isArray(report)) return { items: report };
  if (typeof report === 'string' || typeof report === 'number' || typeof report === 'boolean') {
    return { value: report };
  }
  return asRecord(report) || {};
}

function getValueAtPath(root: JsonRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    const currentRecord = asRecord(current);
    if (!currentRecord) return undefined;
    return currentRecord[segment];
  }, root);
}

function setPreviewValue(target: PreviewRecord, key: string, value: unknown) {
  if (!key) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    // If two rules write the same key, the later rule wins.
    target[key] = value;
  }
}

function applyPathCopies(root: JsonRecord, preview: PreviewRecord, rules: PreviewPathCopyRule[] = []) {
  rules.forEach(({ from, to }) => {
    setPreviewValue(preview, to || from.split('.').pop() || from, getValueAtPath(root, from));
  });
}

function applyObjectEntries(root: JsonRecord, preview: PreviewRecord, rules: PreviewObjectEntriesRule[] = []) {
  rules.forEach((rule) => {
    const source = asRecord(getValueAtPath(root, rule.path));
    if (!source) return;

    Object.entries(source).forEach(([key, value]) => {
      if (rule.copyEntries) {
        const targetKey = rule.outputPrefix ? `${rule.outputPrefix}_${key}` : key;
        setPreviewValue(preview, targetKey, value);
      }

      rule.prefixTransforms?.forEach((transform) => {
        if (!key.startsWith(transform.sourcePrefix)) return;
        const suffix = key.slice(transform.sourcePrefix.length);
        setPreviewValue(preview, `${transform.targetPrefix}${suffix}`, value);
      });
    });
  });
}

function applyNestedSections(root: JsonRecord, preview: PreviewRecord, rules: PreviewNestedSectionRule[] = []) {
  rules.forEach((rule) => {
    const source = asRecord(getValueAtPath(root, rule.path));
    if (!source) return;

    rule.sections.forEach(({ source: sourceKey, target }) => {
      const section = asRecord(source[sourceKey]);
      if (!section) return;

      Object.entries(section).forEach(([entryKey, value]) => {
        setPreviewValue(preview, `${rule.outputPrefix}_${target}_${entryKey}`, value);
      });
    });
  });
}

function copyTechnicalReportTopLevelPrimitives(root: JsonRecord, preview: PreviewRecord) {
  Object.entries(root).forEach(([key, value]) => {
    if (TECHNICAL_REPORT_NESTED_KEYS.has(key)) return;
    setPreviewValue(preview, key, value);
  });
}

function buildPreviewFromMapping(root: JsonRecord, mapping: DataPreviewMapping): PreviewRecord {
  const preview: PreviewRecord = {};

  applyPathCopies(root, preview, mapping.pathCopies);
  applyObjectEntries(root, preview, mapping.objectEntries);
  applyNestedSections(root, preview, mapping.nestedSections);
  mapping.customRules?.forEach((rule) => rule(root, preview));

  return preview;
}

// Add new report types here by combining declarative path/object rules and
// optional customRules for edge cases that do not fit a simple mapping.
export const DATA_PREVIEW_MAPPINGS: Record<string, DataPreviewMapping> = {
  'technical-report': {
    pathCopies: [
      { from: 'metadata.informe_id', to: 'informe_id' },
      { from: 'metadata.dia', to: 'dia' },
      { from: 'metadata.mes', to: 'mes' },
      { from: 'metadata.anio', to: 'anio' },
      { from: 'metadata.pagina', to: 'pagina' },
      { from: 'header.cs', to: 'cs' },
      { from: 'header.contratista', to: 'contratista' },
      { from: 'header.codigo_infraestructura', to: 'codigo_infraestructura' },
      { from: 'header.ubicacion', to: 'ubicacion' },
      { from: 'header.suministro', to: 'suministro' },
      { from: 'header.tipo', to: 'tipo' },
      { from: 'header.volumen', to: 'volumen' },
      { from: 'valvulas.operativas', to: 'valvulas_operativas' },
      { from: 'valvulas.no_operativas', to: 'valvulas_no_operativas' },
      { from: 'canastillas.operativas', to: 'canastillas_operativas' },
      { from: 'canastillas.no_operativas', to: 'canastillas_no_operativas' },
      { from: 'observaciones', to: 'observaciones' },
      { from: 'sugerencias', to: 'sugerencias' },
    ],
    objectEntries: [
      {
        path: 'inspeccion',
        copyEntries: true,
        prefixTransforms: [
          { sourcePrefix: 'observaciones_', targetPrefix: 'obs_' },
          { sourcePrefix: 'sugerencias_', targetPrefix: 'sug_' },
        ],
      },
      {
        path: 'medidas',
        copyEntries: true,
        outputPrefix: 'medidas',
      },
      {
        path: 'valvulas',
        prefixTransforms: [
          { sourcePrefix: 'observaciones_', targetPrefix: 'obs_valvulas_' },
          { sourcePrefix: 'sugerencias_', targetPrefix: 'sug_valvulas_' },
        ],
      },
      {
        path: 'canastillas',
        prefixTransforms: [
          { sourcePrefix: 'observaciones_', targetPrefix: 'obs_canastillas_' },
          { sourcePrefix: 'sugerencias_', targetPrefix: 'sug_canastillas_' },
        ],
      },
    ],
    nestedSections: [
      {
        path: 'valvulas',
        outputPrefix: 'valvulas',
        sections: [
          { source: 'diametros', target: 'conduccion' },
          { source: 'impulsion', target: 'impulsion' },
          { source: 'aduccion', target: 'aduccion' },
          { source: 'bypass', target: 'bypass' },
          { source: 'desague', target: 'desague' },
        ],
      },
      {
        path: 'canastillas',
        outputPrefix: 'canastillas',
        sections: [
          { source: 'diametros', target: 'aduccion' },
          { source: 'aduccion', target: 'aduccion' },
          { source: 'succion', target: 'succion' },
          { source: 'desague', target: 'desague' },
        ],
      },
    ],
    customRules: [copyTechnicalReportTopLevelPrimitives],
  },
  generic: {
    fallbackToFlatten: true,
  },
};

// Default strategy for unknown report types: flatten primitive leaves only,
// joining nested paths with "_" and array positions (for example items_0_name).
export function flattenPreviewPrimitives(
  value: unknown,
  separator = '_',
): Record<string, unknown> {
  const preview: PreviewRecord = {};

  const visit = (current: unknown, path: string[]) => {
    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      const targetKey = path.length > 0 ? path.join(separator) : 'value';
      setPreviewValue(preview, targetKey, current);
      return;
    }

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, [...path, String(index)]));
      return;
    }

    const currentRecord = asRecord(current);
    if (!currentRecord) return;

    Object.entries(currentRecord).forEach(([key, entry]) => {
      visit(entry, [...path, key]);
    });
  };

  visit(value, []);
  return preview;
}

export function buildDataPreviewFromReport(
  report: unknown,
  reportType: string = 'technical-report',
): Record<string, unknown> {
  const normalizedReport = normalizeReportRoot(report);
  const mapping = DATA_PREVIEW_MAPPINGS[reportType];

  if (!mapping) {
    return flattenPreviewPrimitives(normalizedReport);
  }

  const preview = buildPreviewFromMapping(normalizedReport, mapping);
  if (mapping.fallbackToFlatten) {
    Object.entries(flattenPreviewPrimitives(normalizedReport)).forEach(([key, value]) => {
      setPreviewValue(preview, key, value);
    });
  }

  return preview;
}
