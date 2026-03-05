import React from 'react';
import { Braces, Database, Palette, Plus, Trash2, Type } from 'lucide-react';
import {
  VARIABLE_KEY_PATTERN,
  generateId,
  type CanvasDocument,
  type DocumentTheme,
  type TextStyleToken,
  type VariableDefinition,
} from '../canvasTypes';

type DataSourceDefinition = NonNullable<CanvasDocument['dataSourceDefinition']>;

interface DocumentPanelProps {
  variables: VariableDefinition[];
  onVariablesChange: (variables: VariableDefinition[]) => void;
  theme?: DocumentTheme;
  onThemeChange: (theme: DocumentTheme) => void;
  dataSourceDefinition?: CanvasDocument['dataSourceDefinition'];
  onDataSourceDefinitionChange: (definition: DataSourceDefinition) => void;
}

const VARIABLE_TYPES: Array<VariableDefinition['type']> = ['string', 'number', 'date', 'boolean', 'list'];
const FONT_WEIGHT_OPTIONS: TextStyleToken['style']['fontWeight'][] = ['400', '500', '600', '700', '800', '900'];

function normalizeKey(value: string): string {
  return value
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function ensureTheme(theme: DocumentTheme | undefined): Required<DocumentTheme> {
  return {
    textStyles: Array.isArray(theme?.textStyles) ? theme.textStyles : [],
    colorTokens: Array.isArray(theme?.colorTokens) ? theme.colorTokens : [],
  };
}

function ensureDataSourceDefinition(
  definition: CanvasDocument['dataSourceDefinition'],
): DataSourceDefinition {
  const fields = Array.isArray(definition?.fields) ? definition.fields : [];
  return {
    schemaVersion: definition?.schemaVersion || '1.0',
    fields,
    ...(definition?.notes ? { notes: definition.notes } : {}),
  };
}

function buildNextVariable(index: number): VariableDefinition {
  const key = `variable_${index}`;
  return {
    key,
    label: `Variable ${index}`,
    type: 'string',
  };
}

function buildNextField(index: number): NonNullable<DataSourceDefinition['fields']>[number] {
  const key = `campo_${index}`;
  return {
    key,
    label: `Campo ${index}`,
    type: 'string',
    required: false,
  };
}

export function DocumentPanel({
  variables,
  onVariablesChange,
  theme,
  onThemeChange,
  dataSourceDefinition,
  onDataSourceDefinitionChange,
}: DocumentPanelProps) {
  const safeTheme = ensureTheme(theme);
  const safeDefinition = ensureDataSourceDefinition(dataSourceDefinition);

  const updateVariable = (index: number, updates: Partial<VariableDefinition>) => {
    onVariablesChange(variables.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...updates } : item
    )));
  };

  const addVariable = () => {
    const nextIndex = variables.length + 1;
    onVariablesChange([...variables, buildNextVariable(nextIndex)]);
  };

  const removeVariable = (index: number) => {
    onVariablesChange(variables.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateField = (
    index: number,
    updates: Partial<NonNullable<DataSourceDefinition['fields']>[number]>,
  ) => {
    onDataSourceDefinitionChange({
      ...safeDefinition,
      fields: safeDefinition.fields.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...updates } : item
      )),
    });
  };

  const addField = () => {
    const nextIndex = safeDefinition.fields.length + 1;
    onDataSourceDefinitionChange({
      ...safeDefinition,
      fields: [...safeDefinition.fields, buildNextField(nextIndex)],
    });
  };

  const removeField = (index: number) => {
    onDataSourceDefinitionChange({
      ...safeDefinition,
      fields: safeDefinition.fields.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const updateColorTokens = (updater: (tokens: Required<DocumentTheme>['colorTokens']) => Required<DocumentTheme>['colorTokens']) => {
    onThemeChange({
      ...safeTheme,
      colorTokens: updater(safeTheme.colorTokens),
    });
  };

  const updateTextStyles = (updater: (tokens: Required<DocumentTheme>['textStyles']) => Required<DocumentTheme>['textStyles']) => {
    onThemeChange({
      ...safeTheme,
      textStyles: updater(safeTheme.textStyles),
    });
  };

  return (
    <div className="p-3 space-y-5">
      <SectionHeader
        icon={<Database size={12} />}
        title="Campos del documento"
        actionLabel="+ Campo"
        onAction={addField}
      />
      <div className="space-y-2">
        <div className="flex items-center h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            Notas
          </span>
          <input
            value={safeDefinition.notes || ''}
            onChange={(event) => onDataSourceDefinitionChange({
              ...safeDefinition,
              notes: event.target.value,
            })}
            className="ml-2 h-full flex-1 bg-transparent text-xs text-neutral-700 outline-none placeholder-neutral-400"
            placeholder="Describe la estructura de datos de esta plantilla"
          />
        </div>
        {safeDefinition.fields.length === 0 ? (
          <EmptyState label="Aun no hay campos definidos para el documento." />
        ) : safeDefinition.fields.map((field, index) => (
          <div key={`${field.key}-${index}`} className="rounded-xl border border-neutral-200 bg-white p-2 space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <InlineInput
                label="Clave"
                value={field.key}
                onChange={(value) => updateField(index, { key: normalizeKey(value) })}
                placeholder="campo"
              />
              <InlineInput
                label="Etiqueta"
                value={field.label || ''}
                onChange={(value) => updateField(index, { label: value })}
                placeholder="Etiqueta visible"
              />
              <IconAction
                title="Eliminar campo"
                onClick={() => removeField(index)}
                icon={<Trash2 size={14} />}
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <InlineSelect
                label="Tipo"
                value={field.type || 'string'}
                onChange={(value) => updateField(index, { type: value })}
                options={VARIABLE_TYPES}
              />
              <label className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-[11px] text-neutral-600">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(event) => updateField(index, { required: event.target.checked })}
                  className="rounded border-neutral-300"
                />
                Requerido
              </label>
            </div>
          </div>
        ))}
      </div>

      <SectionHeader
        icon={<Braces size={12} />}
        title="Variables internas"
        actionLabel="+ Variable"
        onAction={addVariable}
      />
      <div className="space-y-2">
        {variables.length === 0 ? (
          <EmptyState label="No hay variables registradas. Puedes usarlas como inventario interno del documento." />
        ) : variables.map((variable, index) => {
          const isValidKey = VARIABLE_KEY_PATTERN.test(variable.key);
          return (
            <div key={`${variable.key}-${index}`} className="rounded-xl border border-neutral-200 bg-white p-2 space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <InlineInput
                  label="Clave"
                  value={variable.key}
                  onChange={(value) => updateVariable(index, { key: normalizeKey(value) })}
                  placeholder="variable_1"
                  invalid={!isValidKey}
                />
                <InlineInput
                  label="Etiqueta"
                  value={variable.label}
                  onChange={(value) => updateVariable(index, { label: value })}
                  placeholder="Etiqueta"
                />
                <IconAction
                  title="Eliminar variable"
                  onClick={() => removeVariable(index)}
                  icon={<Trash2 size={14} />}
                />
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <InlineSelect
                  label="Tipo"
                  value={variable.type}
                  onChange={(value) => updateVariable(index, { type: value as VariableDefinition['type'] })}
                  options={VARIABLE_TYPES}
                />
                <InlineInput
                  label="Default"
                  value={variable.default === undefined ? '' : String(variable.default)}
                  onChange={(value) => updateVariable(index, { default: value })}
                  placeholder="-"
                />
                <label className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-[11px] text-neutral-600">
                  <input
                    type="checkbox"
                    checked={Boolean(variable.required)}
                    onChange={(event) => updateVariable(index, { required: event.target.checked })}
                    className="rounded border-neutral-300"
                  />
                  Req.
                </label>
              </div>
              {!isValidKey && (
                <p className="text-[10px] text-red-500">
                  Usa solo letras minusculas, numeros y guion bajo.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <SectionHeader
        icon={<Palette size={12} />}
        title="Brand kit"
      />
      <div className="space-y-3">
        <SubHeader
          icon={<Palette size={11} />}
          title="Colores"
          actionLabel="+ Color"
          onAction={() => updateColorTokens((tokens) => [
            ...tokens,
            { id: generateId(), label: `Color ${tokens.length + 1}`, value: '#111827' },
          ])}
        />
        {safeTheme.colorTokens.length === 0 ? (
          <EmptyState label="Guarda colores reutilizables para aplicarlos desde el inspector." />
        ) : (
          <div className="space-y-2">
            {safeTheme.colorTokens.map((token, index) => (
              <div key={token.id} className="rounded-xl border border-neutral-200 bg-white p-2 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                <input
                  type="color"
                  value={token.value}
                  onChange={(event) => updateColorTokens((tokens) => tokens.map((item, itemIndex) => (
                    itemIndex === index ? { ...item, value: event.target.value } : item
                  )))}
                  className="h-8 w-8 cursor-pointer rounded border border-neutral-300 p-0"
                />
                <div className="space-y-2">
                  <InlineInput
                    label="Etiqueta"
                    value={token.label}
                    onChange={(value) => updateColorTokens((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, label: value } : item
                    )))}
                    placeholder="Primario"
                  />
                  <InlineInput
                    label="HEX"
                    value={token.value}
                    onChange={(value) => updateColorTokens((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, value } : item
                    )))}
                    placeholder="#111827"
                  />
                </div>
                <IconAction
                  title="Eliminar color"
                  onClick={() => updateColorTokens((tokens) => tokens.filter((_, itemIndex) => itemIndex !== index))}
                  icon={<Trash2 size={14} />}
                />
              </div>
            ))}
          </div>
        )}

        <SubHeader
          icon={<Type size={11} />}
          title="Estilos de texto"
          actionLabel="+ Estilo"
          onAction={() => updateTextStyles((tokens) => [
            ...tokens,
            {
              id: generateId(),
              label: `Estilo ${tokens.length + 1}`,
              style: {
                fontSize: 12,
                fontFamily: 'Arial',
                fontWeight: '600',
                color: '#111827',
                lineHeight: 1.2,
              },
            },
          ])}
        />
        {safeTheme.textStyles.length === 0 ? (
          <EmptyState label="Define estilos de texto reutilizables y aplicalos en un clic." />
        ) : (
          <div className="space-y-2">
            {safeTheme.textStyles.map((token, index) => (
              <div key={token.id} className="rounded-xl border border-neutral-200 bg-white p-2 space-y-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <InlineInput
                    label="Etiqueta"
                    value={token.label}
                    onChange={(value) => updateTextStyles((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, label: value } : item
                    )))}
                    placeholder="Titulo H1"
                  />
                  <IconAction
                    title="Eliminar estilo"
                    onClick={() => updateTextStyles((tokens) => tokens.filter((_, itemIndex) => itemIndex !== index))}
                    icon={<Trash2 size={14} />}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InlineInput
                    label="Fuente"
                    value={token.style.fontFamily || ''}
                    onChange={(value) => updateTextStyles((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index
                        ? { ...item, style: { ...item.style, fontFamily: value } }
                        : item
                    )))}
                    placeholder="Arial"
                  />
                  <InlineInput
                    label="Tamano"
                    value={token.style.fontSize === undefined ? '' : String(token.style.fontSize)}
                    onChange={(value) => updateTextStyles((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index
                        ? { ...item, style: { ...item.style, fontSize: Number(value) || 12 } }
                        : item
                    )))}
                    placeholder="12"
                  />
                  <InlineSelect
                    label="Peso"
                    value={token.style.fontWeight || '600'}
                    onChange={(value) => updateTextStyles((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index
                        ? { ...item, style: { ...item.style, fontWeight: value as TextStyleToken['style']['fontWeight'] } }
                        : item
                    )))}
                    options={FONT_WEIGHT_OPTIONS}
                  />
                  <InlineInput
                    label="Color"
                    value={token.style.color || '#111827'}
                    onChange={(value) => updateTextStyles((tokens) => tokens.map((item, itemIndex) => (
                      itemIndex === index
                        ? { ...item, style: { ...item.style, color: value } }
                        : item
                    )))}
                    placeholder="#111827"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <span className="text-neutral-400">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          {title}
        </span>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-50"
        >
          <Plus size={11} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SubHeader({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-neutral-500">
        {icon}
        <span className="text-[11px] font-semibold">{title}</span>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-50"
      >
        <Plus size={11} />
        {actionLabel}
      </button>
    </div>
  );
}

function InlineInput({
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <label className={`flex h-8 items-center rounded-lg border px-2 ${invalid ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-neutral-50'}`}>
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent text-[11px] text-neutral-700 outline-none placeholder-neutral-400"
      />
    </label>
  );
}

function InlineSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="flex h-8 items-center rounded-lg border border-neutral-200 bg-neutral-50 px-2">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full bg-transparent text-[11px] text-neutral-700 outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function IconAction({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
    >
      {icon}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-4 text-[11px] text-neutral-400">
      {label}
    </div>
  );
}

