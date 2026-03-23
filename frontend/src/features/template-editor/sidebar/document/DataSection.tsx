import React, { useMemo, useState } from 'react';
import { Braces, Check, Copy, Database, Plus, Search, Trash2, X, Zap } from 'lucide-react';
import { VARIABLE_KEY_PATTERN, generateId, type VariableDefinition } from '../../canvasTypes';
import type { CanvasDocument } from '../../canvasTypes';

type DataSourceDefinition = NonNullable<CanvasDocument['dataSourceDefinition']>;
type Field = NonNullable<DataSourceDefinition['fields']>[number];
type Mode = 'campos' | 'variables';
const VARIABLE_TYPES: Array<VariableDefinition['type']> = ['string', 'number', 'date', 'boolean', 'list'];

export function normalizeKey(value: string): string {
  return value
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface DataSectionProps {
  variables: VariableDefinition[];
  onVariablesChange: (variables: VariableDefinition[]) => void;
  dataSourceDefinition?: CanvasDocument['dataSourceDefinition'];
  onDataSourceDefinitionChange: (definition: DataSourceDefinition) => void;
  dataPreview?: Record<string, unknown>;
  onInsertBoundField?: (fieldKey: string, label?: string) => void;
}

function ensureDefinition(def: CanvasDocument['dataSourceDefinition']): DataSourceDefinition {
  return {
    schemaVersion: def?.schemaVersion || '1.0',
    fields: Array.isArray(def?.fields) ? def.fields : [],
    ...(def?.notes ? { notes: def.notes } : {}),
  };
}

export function DataSection({
  variables,
  onVariablesChange,
  dataSourceDefinition,
  onDataSourceDefinitionChange,
  dataPreview,
  onInsertBoundField,
}: DataSectionProps) {
  const [mode, setMode] = useState<Mode>('campos');
  const [search, setSearch] = useState('');
  const safeDef = ensureDefinition(dataSourceDefinition);

  const filteredFields = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return safeDef.fields;
    return safeDef.fields.filter((f) =>
      (f.key + ' ' + (f.label || '')).toLocaleLowerCase('es').includes(term)
    );
  }, [safeDef.fields, search]);

  const filteredVariables = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return variables;
    return variables.filter((v) =>
      (v.key + ' ' + v.label).toLocaleLowerCase('es').includes(term)
    );
  }, [variables, search]);

  const fieldKeys = useMemo(() => new Set(safeDef.fields.map((f) => f.key)), [safeDef.fields]);
  const varKeys = useMemo(() => new Set(variables.map((v) => v.key)), [variables]);

  const updateField = (index: number, updates: Partial<Field>) => {
    onDataSourceDefinitionChange({
      ...safeDef,
      fields: safeDef.fields.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    });
  };

  const addField = () => {
    const next = safeDef.fields.length + 1;
    onDataSourceDefinitionChange({
      ...safeDef,
      fields: [...safeDef.fields, { key: `campo_${next}`, label: `Campo ${next}`, type: 'string', required: false }],
    });
  };

  const removeField = (index: number) => {
    onDataSourceDefinitionChange({
      ...safeDef,
      fields: safeDef.fields.filter((_, i) => i !== index),
    });
  };

  const updateVariable = (index: number, updates: Partial<VariableDefinition>) => {
    onVariablesChange(variables.map((v, i) => (i === index ? { ...v, ...updates } : v)));
  };

  const addVariable = () => {
    const next = variables.length + 1;
    onVariablesChange([...variables, { key: `variable_${next}`, label: `Variable ${next}`, type: 'string' }]);
  };

  const removeVariable = (index: number) => {
    onVariablesChange(variables.filter((_, i) => i !== index));
  };

  const copyToken = (key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`{{${key}}}`).catch(() => {});
    }
  };

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        <ModeTab
          active={mode === 'campos'}
          icon={<Database size={11} />}
          label="Campos"
          badge={safeDef.fields.length}
          onClick={() => setMode('campos')}
        />
        <ModeTab
          active={mode === 'variables'}
          icon={<Braces size={11} />}
          label="Variables"
          badge={variables.length}
          onClick={() => setMode('variables')}
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
        <Search size={11} className="shrink-0 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={mode === 'campos' ? 'Buscar campo…' : 'Buscar variable…'}
          className="w-full bg-transparent text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="text-neutral-400 hover:text-neutral-600">
            <X size={10} />
          </button>
        )}
      </div>

      {/* Notes — campos only */}
      {mode === 'campos' && (
        <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            Notas
          </span>
          <input
            value={safeDef.notes || ''}
            onChange={(e) =>
              onDataSourceDefinitionChange({ ...safeDef, notes: e.target.value })
            }
            placeholder="Describe la estructura de datos…"
            className="flex-1 bg-transparent text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
          />
        </div>
      )}

      {/* Add button */}
      <button
        type="button"
        onClick={mode === 'campos' ? addField : addVariable}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 bg-white py-1.5 text-[11px] font-semibold text-neutral-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
        data-testid="add-item-btn"
      >
        <Plus size={12} />
        {mode === 'campos' ? 'Agregar campo' : 'Agregar variable'}
      </button>

      {/* List */}
      {mode === 'campos' ? (
        <FieldList
          fields={filteredFields}
          allFields={safeDef.fields}
          dataPreview={dataPreview}
          onUpdate={(localIndex, updates) => {
            const realIndex = safeDef.fields.indexOf(filteredFields[localIndex]);
            if (realIndex !== -1) updateField(realIndex, updates);
          }}
          onRemove={(localIndex) => {
            const realIndex = safeDef.fields.indexOf(filteredFields[localIndex]);
            if (realIndex !== -1) removeField(realIndex);
          }}
          onCopyToken={copyToken}
          onInsert={onInsertBoundField}
          fieldKeys={fieldKeys}
        />
      ) : (
        <VariableList
          variables={filteredVariables}
          allVariables={variables}
          dataPreview={dataPreview}
          onUpdate={(localIndex, updates) => {
            const realIndex = variables.indexOf(filteredVariables[localIndex]);
            if (realIndex !== -1) updateVariable(realIndex, updates);
          }}
          onRemove={(localIndex) => {
            const realIndex = variables.indexOf(filteredVariables[localIndex]);
            if (realIndex !== -1) removeVariable(realIndex);
          }}
          onCopyToken={copyToken}
          onInsert={onInsertBoundField}
          varKeys={varKeys}
        />
      )}

      {mode === 'campos' && filteredFields.length === 0 && safeDef.fields.length > 0 && (
        <EmptySearch onClear={() => setSearch('')} />
      )}
      {mode === 'campos' && safeDef.fields.length === 0 && (
        <EmptyData label="Sin campos definidos. Úsalos para mapear datos de tus archivos Excel/CSV." />
      )}
      {mode === 'variables' && filteredVariables.length === 0 && variables.length > 0 && (
        <EmptySearch onClear={() => setSearch('')} />
      )}
      {mode === 'variables' && variables.length === 0 && (
        <EmptyData label="Sin variables internas. Úsalas como inventario de datos del documento." />
      )}
    </div>
  );
}

interface FieldListProps {
  fields: Field[];
  allFields: Field[];
  dataPreview?: Record<string, unknown>;
  onUpdate: (index: number, updates: Partial<Field>) => void;
  onRemove: (index: number) => void;
  onCopyToken: (key: string) => void;
  onInsert?: (key: string, label?: string) => void;
  fieldKeys: Set<string>;
}

function FieldList({ fields, allFields, dataPreview, onUpdate, onRemove, onCopyToken, onInsert, fieldKeys }: FieldListProps) {
  return (
    <div className="space-y-1.5">
      {fields.map((field, localIndex) => {
        const isDuplicateKey = allFields.filter((f) => f.key === field.key).length > 1;
        const isInvalidKey = field.key ? !VARIABLE_KEY_PATTERN.test(field.key) : false;
        const previewVal = dataPreview?.[field.key];
        const hasError = isDuplicateKey || isInvalidKey;

        return (
          <DataRow
            key={`field-${localIndex}-${field.key}`}
            keyValue={field.key}
            label={field.label || ''}
            type={field.type || 'string'}
            required={Boolean(field.required)}
            previewValue={previewVal !== undefined ? String(previewVal) : undefined}
            isDuplicate={isDuplicateKey}
            isInvalidKey={isInvalidKey}
            hasError={hasError}
            onKeyChange={(v) => onUpdate(localIndex, { key: normalizeKey(v) })}
            onLabelChange={(v) => onUpdate(localIndex, { label: v })}
            onTypeChange={(v) => onUpdate(localIndex, { type: v as VariableDefinition['type'] })}
            onRequiredChange={(v) => onUpdate(localIndex, { required: v })}
            onCopyToken={() => onCopyToken(field.key)}
            onInsert={onInsert ? () => onInsert(field.key, field.label) : undefined}
            onRemove={() => onRemove(localIndex)}
          />
        );
      })}
    </div>
  );
}

interface VariableListProps {
  variables: VariableDefinition[];
  allVariables: VariableDefinition[];
  dataPreview?: Record<string, unknown>;
  onUpdate: (index: number, updates: Partial<VariableDefinition>) => void;
  onRemove: (index: number) => void;
  onCopyToken: (key: string) => void;
  onInsert?: (key: string, label?: string) => void;
  varKeys: Set<string>;
}

function VariableList({ variables, allVariables, dataPreview, onUpdate, onRemove, onCopyToken, onInsert }: VariableListProps) {
  return (
    <div className="space-y-1.5">
      {variables.map((variable, localIndex) => {
        const isDuplicateKey = allVariables.filter((v) => v.key === variable.key).length > 1;
        const isInvalidKey = variable.key ? !VARIABLE_KEY_PATTERN.test(variable.key) : false;
        const previewVal = dataPreview?.[variable.key];
        const hasError = isDuplicateKey || isInvalidKey;

        return (
          <DataRow
            key={`var-${localIndex}-${variable.key}`}
            keyValue={variable.key}
            label={variable.label}
            type={variable.type}
            required={Boolean(variable.required)}
            defaultValue={variable.default !== undefined ? String(variable.default) : ''}
            previewValue={previewVal !== undefined ? String(previewVal) : undefined}
            isDuplicate={isDuplicateKey}
            isInvalidKey={isInvalidKey}
            hasError={hasError}
            onKeyChange={(v) => onUpdate(localIndex, { key: normalizeKey(v) })}
            onLabelChange={(v) => onUpdate(localIndex, { label: v })}
            onTypeChange={(v) => onUpdate(localIndex, { type: v as VariableDefinition['type'] })}
            onRequiredChange={(v) => onUpdate(localIndex, { required: v })}
            onDefaultChange={(v) => onUpdate(localIndex, { default: v })}
            onCopyToken={() => onCopyToken(variable.key)}
            onInsert={onInsert ? () => onInsert(variable.key, variable.label) : undefined}
            onRemove={() => onRemove(localIndex)}
          />
        );
      })}
    </div>
  );
}

interface DataRowProps {
  keyValue: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  previewValue?: string;
  isDuplicate: boolean;
  isInvalidKey: boolean;
  hasError: boolean;
  onKeyChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onRequiredChange: (v: boolean) => void;
  onDefaultChange?: (v: string) => void;
  onCopyToken: () => void;
  onInsert?: () => void;
  onRemove: () => void;
}

function DataRow({
  keyValue,
  label,
  type,
  required,
  defaultValue,
  previewValue,
  isDuplicate,
  isInvalidKey,
  hasError,
  onKeyChange,
  onLabelChange,
  onTypeChange,
  onRequiredChange,
  onDefaultChange,
  onCopyToken,
  onInsert,
  onRemove,
}: DataRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopyToken();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`rounded-xl border p-2 space-y-1.5 ${hasError ? 'border-red-200 bg-red-50/40' : 'border-neutral-200 bg-white'}`}
      data-testid="data-row"
    >
      {/* Key + label */}
      <div className="grid grid-cols-2 gap-1.5">
        <MiniInput
          label="Clave"
          value={keyValue}
          onChange={onKeyChange}
          placeholder="campo_x"
          invalid={hasError}
        />
        <MiniInput
          label="Etiqueta"
          value={label}
          onChange={onLabelChange}
          placeholder="Campo visible"
        />
      </div>

      {/* Type + required + default (optional) */}
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          className="h-7 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
        >
          {VARIABLE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[10px] text-neutral-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => onRequiredChange(e.target.checked)}
            className="h-3 w-3 accent-violet-600"
          />
          Req.
        </label>
      </div>

      {/* Default value (variables only) */}
      {onDefaultChange !== undefined && (
        <MiniInput
          label="Default"
          value={defaultValue || ''}
          onChange={onDefaultChange}
          placeholder="Valor por defecto"
        />
      )}

      {/* Validation badges */}
      {isDuplicate && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600" data-testid="duplicate-badge">
          Clave duplicada
        </span>
      )}
      {isInvalidKey && !isDuplicate && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-600" data-testid="invalid-key-badge">
          Clave inválida (solo a-z, 0-9, _)
        </span>
      )}

      {/* Preview value chip */}
      {previewValue !== undefined && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-neutral-400">muestra:</span>
          <span className="rounded-md bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 truncate max-w-[140px]" data-testid="preview-chip">
            {previewValue}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-0.5">
        {onInsert && (
          <button
            type="button"
            onClick={onInsert}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-violet-600 py-1.5 text-[10px] font-semibold text-white hover:bg-violet-700 transition-colors"
            title="Insertar en canvas como elemento variable"
            data-testid="insert-btn"
          >
            <Zap size={10} /> Insertar
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors"
          title={`Copiar {{${keyValue}}}`}
          data-testid="copy-btn"
        >
          {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
          {copied ? '' : '{{}}'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Eliminar"
          data-testid="remove-btn"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

function MiniInput({
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-7 w-full rounded-lg border px-2 text-[11px] text-neutral-700 outline-none placeholder-neutral-400 transition-colors focus:bg-white ${
          invalid ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-neutral-50 focus:border-violet-300'
        }`}
      />
    </div>
  );
}

function ModeTab({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-colors ${
        active ? 'bg-white text-violet-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
      }`}
    >
      {icon}
      {label}
      {badge > 0 && (
        <span className={`rounded-full px-1 text-[9px] font-bold ${active ? 'bg-violet-100 text-violet-600' : 'bg-neutral-200 text-neutral-500'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function EmptyData({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-4 text-center text-[11px] text-neutral-400">
      {label}
    </div>
  );
}

function EmptySearch({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-4 text-center">
      <p className="text-[11px] text-neutral-400">Sin coincidencias.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800"
      >
        Limpiar búsqueda
      </button>
    </div>
  );
}
