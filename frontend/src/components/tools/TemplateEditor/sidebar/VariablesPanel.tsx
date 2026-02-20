import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Braces,
    Check,
    Copy,
    GripVertical,
    Pencil,
    Plus,
    Search,
    Trash2,
    Wand2,
} from 'lucide-react';
import type {
    ElementPreset,
    ElementType,
    TemplateElement,
    VariableDefinition,
    VariableType,
} from '../canvasTypes';
import {
    VARIABLE_KEY_PATTERN,
    deriveVariableDefinitionsFromElements,
    normalizeVariableRegistry,
} from '../canvasTypes';
import {
    Badge,
    Button,
    Card,
    FieldLabel,
    InlineAlert,
    Input,
    Panel,
    Select,
} from '../ui/ui';

interface VariablesPanelProps {
    onAddElement: (
        type: ElementType,
        pos?: { x: number; y: number },
        presetId?: ElementPreset,
        overrides?: Partial<TemplateElement>,
    ) => void;
    variables?: VariableDefinition[] | null;
    elements?: TemplateElement[] | null;
    onVariablesChange?: (variables: VariableDefinition[]) => void;
}

interface VariableFormState {
    key: string;
    label: string;
    type: VariableType;
    required: boolean;
    defaultValue: string;
    format: string;
    optionsText: string;
}

const VARIABLE_TYPE_OPTIONS: Array<{ value: VariableType; label: string }> = [
    { value: 'string', label: 'Texto' },
    { value: 'number', label: 'Numero' },
    { value: 'date', label: 'Fecha' },
    { value: 'boolean', label: 'Booleano' },
    { value: 'list', label: 'Lista' },
];

const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
    string: 'Texto',
    number: 'Numero',
    date: 'Fecha',
    boolean: 'Booleano',
    list: 'Lista',
};

const EMPTY_FORM: VariableFormState = {
    key: '',
    label: '',
    type: 'string',
    required: false,
    defaultValue: '',
    format: '',
    optionsText: '',
};

const VARIABLE_TYPE_TONE: Record<VariableType, 'neutral' | 'info' | 'success' | 'warning'> = {
    string: 'neutral',
    number: 'info',
    date: 'success',
    boolean: 'warning',
    list: 'info',
};

function VariableListSkeleton() {
    return (
        <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((index) => (
                <div
                    key={index}
                    className="rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    <div className="h-4 w-2/5 rounded bg-neutral-200" />
                    <div className="mt-2 h-3 w-3/5 rounded bg-neutral-100" />
                    <div className="mt-3 h-8 w-full rounded-lg bg-neutral-100" />
                </div>
            ))}
        </div>
    );
}

function toFormState(definition?: VariableDefinition): VariableFormState {
    if (!definition) return EMPTY_FORM;

    const defaultValue =
        definition.default === undefined || definition.default === null
            ? ''
            : String(definition.default);

    return {
        key: definition.key,
        label: definition.label,
        type: definition.type,
        required: Boolean(definition.required),
        defaultValue,
        format: definition.format || '',
        optionsText: Array.isArray(definition.options) ? definition.options.join(', ') : '',
    };
}

function parseOptions(optionsText: string): string[] | undefined {
    const seen = new Set<string>();
    const options = optionsText
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => {
            if (!entry) return false;
            const normalized = entry.toLocaleLowerCase('es');
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });

    return options.length > 0 ? options : undefined;
}

function parseDefaultValue(
    value: string,
    type: VariableType,
): { parsed?: string | number | boolean; error?: string } {
    const raw = value.trim();
    if (!raw) return {};

    if (type === 'number') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            return { error: 'El valor por defecto debe ser numerico.' };
        }
        return { parsed };
    }

    if (type === 'boolean') {
        const normalized = raw.toLocaleLowerCase('es');
        if (normalized === 'true') return { parsed: true };
        if (normalized === 'false') return { parsed: false };
        return { error: 'Para booleano usa true o false.' };
    }

    return { parsed: raw };
}

function isSameKey(left: string | null, right: string): boolean {
    if (!left) return false;
    return left.toLocaleLowerCase('es') === right.toLocaleLowerCase('es');
}

function hasDefault(definition: VariableDefinition): boolean {
    return definition.default !== undefined && definition.default !== null && String(definition.default).trim() !== '';
}

function getDefaultLabel(definition: VariableDefinition): string {
    if (definition.default === true) return 'true';
    if (definition.default === false) return 'false';
    return String(definition.default);
}

export function VariablesPanel({
    onAddElement,
    variables,
    elements,
    onVariablesChange,
}: VariablesPanelProps) {
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [form, setForm] = useState<VariableFormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [selectedInsertKey, setSelectedInsertKey] = useState('');
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [listQuery, setListQuery] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const keyInputRef = useRef<HTMLInputElement>(null);

    const insertSelectId = useId();
    const keyInputId = useId();
    const labelInputId = useId();
    const defaultInputId = useId();
    const formatInputId = useId();
    const optionsInputId = useId();
    const listSearchId = useId();

    const { registry, fallback, registryError } = useMemo(() => {
        try {
            return {
                registry: normalizeVariableRegistry(variables),
                fallback: deriveVariableDefinitionsFromElements(elements),
                registryError: null as string | null,
            };
        } catch {
            return {
                registry: [] as VariableDefinition[],
                fallback: [] as VariableDefinition[],
                registryError: 'No se pudo renderizar el listado de variables.',
            };
        }
    }, [elements, variables]);

    const visibleVariables = registry.length > 0 ? registry : fallback;
    const canEditRegistry = typeof onVariablesChange === 'function';
    const isListLoading = variables == null && elements == null;
    const isListEmpty = !isListLoading && !registryError && visibleVariables.length === 0;

    const filteredVariables = useMemo(() => {
        const query = listQuery.trim().toLocaleLowerCase('es');
        if (!query) return visibleVariables;

        return visibleVariables.filter((item) => {
            const keyMatch = item.key.toLocaleLowerCase('es').includes(query);
            const labelMatch = item.label.toLocaleLowerCase('es').includes(query);
            const typeMatch = VARIABLE_TYPE_LABEL[item.type].toLocaleLowerCase('es').includes(query);
            return keyMatch || labelMatch || typeMatch;
        });
    }, [listQuery, visibleVariables]);

    useEffect(() => {
        if (visibleVariables.length === 0) {
            if (selectedInsertKey) setSelectedInsertKey('');
            return;
        }

        const stillExists = visibleVariables.some((item) => item.key === selectedInsertKey);
        if (!stillExists) {
            setSelectedInsertKey(visibleVariables[0].key);
        }
    }, [visibleVariables, selectedInsertKey]);

    useEffect(() => {
        if (copiedKey && !visibleVariables.some((item) => item.key === copiedKey)) {
            setCopiedKey(null);
        }
    }, [copiedKey, visibleVariables]);

    const updateRegistry = useCallback((next: VariableDefinition[]) => {
        if (!onVariablesChange) return;
        onVariablesChange(normalizeVariableRegistry(next));
    }, [onVariablesChange]);

    const baseRegistryForCrud = useMemo(
        () => (registry.length > 0 ? registry : fallback),
        [registry, fallback],
    );

    const resetForm = useCallback(() => {
        setEditingKey(null);
        setForm(EMPTY_FORM);
        setFormError(null);
    }, []);

    const handleSubmit = useCallback((event: React.FormEvent) => {
        event.preventDefault();
        if (!canEditRegistry) return;

        setFormError(null);
        const key = form.key.trim().toLocaleLowerCase('es');
        if (!key) {
            setFormError('La key es obligatoria.');
            return;
        }

        if (!VARIABLE_KEY_PATTERN.test(key)) {
            setFormError('La key debe cumplir [a-z0-9_]+.');
            return;
        }

        const duplicate = baseRegistryForCrud.some(
            (item) => item.key.toLocaleLowerCase('es') === key && !isSameKey(editingKey, item.key),
        );
        if (duplicate) {
            setFormError('La key ya existe.');
            return;
        }

        const { parsed: parsedDefault, error } = parseDefaultValue(form.defaultValue, form.type);
        if (error) {
            setFormError(error);
            return;
        }

        const options = form.type === 'list' ? parseOptions(form.optionsText) : undefined;
        if (form.type === 'list' && (!options || options.length === 0)) {
            setFormError('Para tipo lista define al menos una opcion.');
            return;
        }

        const nextDefinition: VariableDefinition = {
            key,
            label: form.label.trim() || key,
            type: form.type,
            ...(form.required ? { required: true } : {}),
            ...(parsedDefault !== undefined ? { default: parsedDefault } : {}),
            ...(form.format.trim() ? { format: form.format.trim() } : {}),
            ...(options ? { options } : {}),
        };

        const nextRegistry = editingKey
            ? baseRegistryForCrud.map((item) => (isSameKey(editingKey, item.key) ? nextDefinition : item))
            : [...baseRegistryForCrud, nextDefinition];

        updateRegistry(nextRegistry);
        resetForm();
    }, [baseRegistryForCrud, canEditRegistry, editingKey, form, resetForm, updateRegistry]);

    const handleDelete = useCallback((key: string) => {
        if (!canEditRegistry) return;
        const ok = window.confirm(`Eliminar variable "${key}"?`);
        if (!ok) return;

        const nextRegistry = baseRegistryForCrud.filter((item) => item.key !== key);
        updateRegistry(nextRegistry);

        if (isSameKey(editingKey, key)) {
            resetForm();
        }
    }, [baseRegistryForCrud, canEditRegistry, editingKey, resetForm, updateRegistry]);

    const handleEdit = useCallback((definition: VariableDefinition) => {
        setEditingKey(definition.key);
        setForm(toFormState(definition));
        setFormError(null);
        keyInputRef.current?.focus();
    }, []);

    const handleInsert = useCallback((key: string) => {
        if (!key) return;
        onAddElement('variable', undefined, undefined, {
            variableName: key,
            content: `{{${key}}}`,
        });
    }, [onAddElement]);

    const handleDragStart = useCallback((event: React.DragEvent, key: string) => {
        setDraggingKey(key);
        event.dataTransfer.setData('application/react-dnd', 'variable');
        event.dataTransfer.setData(
            'application/template-editor-element-overrides',
            JSON.stringify({
                variableName: key,
                content: `{{${key}}}`,
            }),
        );
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggingKey(null);
    }, []);

    const handleCopyToken = useCallback(async (key: string) => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

        try {
            await navigator.clipboard.writeText(`{{${key}}}`);
            setCopiedKey(key);
            window.setTimeout(() => {
                setCopiedKey((prev) => (prev === key ? null : prev));
            }, 1400);
        } catch {
            setCopiedKey(null);
        }
    }, []);

    const isFilterEmpty =
        !isListLoading &&
        !registryError &&
        visibleVariables.length > 0 &&
        filteredVariables.length === 0;

    const previewKey = form.key.trim().toLocaleLowerCase('es') || 'tu_variable';

    return (
        <Panel className="space-y-4 pb-5">
            <Card className="space-y-3 border-neutral-200/90 bg-white">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-neutral-800">Insertar en canvas</h3>
                        <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">
                            Elige una variable y agregala al documento.
                        </p>
                    </div>
                    <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                        <Wand2 size={14} />
                    </span>
                </div>

                <div>
                    <FieldLabel htmlFor={insertSelectId} className="text-[11px] uppercase tracking-wide text-neutral-500">
                        Variable disponible
                    </FieldLabel>
                    <Select
                        id={insertSelectId}
                        value={selectedInsertKey}
                        onChange={(event) => setSelectedInsertKey(event.target.value)}
                        disabled={visibleVariables.length === 0}
                        className="h-10 rounded-xl border-neutral-300 bg-neutral-50"
                    >
                        {visibleVariables.length === 0 && (
                            <option value="">Sin variables disponibles</option>
                        )}
                        {visibleVariables.map((item) => (
                            <option key={item.key} value={item.key}>
                                {item.label} ({item.key})
                            </option>
                        ))}
                    </Select>
                </div>

                <Button
                    onClick={() => handleInsert(selectedInsertKey)}
                    disabled={!selectedInsertKey}
                    className="h-10 w-full rounded-xl"
                >
                    <Plus size={12} />
                    Insertar variable
                </Button>

                {visibleVariables.length > 0 && (
                    <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                            Insercion rapida
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {visibleVariables.slice(0, 4).map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => handleInsert(item.key)}
                                    className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-100"
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            <Card className="space-y-3 border-violet-200/70 bg-gradient-to-b from-violet-50/55 to-white">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-violet-700 shadow-sm">
                            <Braces size={14} />
                        </span>
                        <div>
                            <h3 className="text-sm font-semibold text-neutral-800">
                                {editingKey ? 'Editar variable' : 'Nueva variable'}
                            </h3>
                            <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">
                                Configura key, tipo y reglas para reutilizar datos.
                            </p>
                        </div>
                    </div>
                    {editingKey && (
                        <Button onClick={resetForm} variant="ghost" size="sm">
                            Cancelar
                        </Button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <FieldLabel htmlFor={keyInputId}>Key tecnica</FieldLabel>
                            <Input
                                id={keyInputId}
                                ref={keyInputRef}
                                type="text"
                                value={form.key}
                                onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
                                placeholder="a-z0-9_"
                                disabled={!canEditRegistry}
                                className="h-10 rounded-xl border-neutral-300 bg-white"
                            />
                        </div>
                        <div>
                            <FieldLabel htmlFor={labelInputId}>Nombre visible</FieldLabel>
                            <Input
                                id={labelInputId}
                                type="text"
                                value={form.label}
                                onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                                placeholder="Ejemplo: Fecha de visita"
                                disabled={!canEditRegistry}
                                className="h-10 rounded-xl border-neutral-300 bg-white"
                            />
                        </div>
                    </div>

                    <div>
                        <FieldLabel className="text-[11px] uppercase tracking-wide text-neutral-500">Tipo</FieldLabel>
                        <div className="grid grid-cols-2 gap-2">
                            {VARIABLE_TYPE_OPTIONS.map((option) => {
                                const isActive = form.type === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, type: option.value }))}
                                        disabled={!canEditRegistry}
                                        className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                                            isActive
                                                ? 'border-violet-300 bg-violet-100 text-violet-800 shadow-sm'
                                                : 'border-neutral-200 bg-white text-neutral-600 hover:border-violet-200 hover:bg-violet-50'
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <FieldLabel htmlFor={defaultInputId}>Valor por defecto</FieldLabel>
                            <Input
                                id={defaultInputId}
                                type="text"
                                value={form.defaultValue}
                                onChange={(event) => setForm((prev) => ({ ...prev, defaultValue: event.target.value }))}
                                placeholder="Opcional"
                                disabled={!canEditRegistry}
                                className="h-10 rounded-xl border-neutral-300 bg-white"
                            />
                        </div>
                        <div>
                            <FieldLabel htmlFor={formatInputId}>Formato</FieldLabel>
                            <Input
                                id={formatInputId}
                                type="text"
                                value={form.format}
                                onChange={(event) => setForm((prev) => ({ ...prev, format: event.target.value }))}
                                placeholder="Opcional"
                                disabled={!canEditRegistry}
                                className="h-10 rounded-xl border-neutral-300 bg-white"
                            />
                        </div>
                    </div>

                    {form.type === 'list' && (
                        <div>
                            <FieldLabel htmlFor={optionsInputId}>Opciones de lista</FieldLabel>
                            <Input
                                id={optionsInputId}
                                type="text"
                                value={form.optionsText}
                                onChange={(event) => setForm((prev) => ({ ...prev, optionsText: event.target.value }))}
                                placeholder="alta, media, baja"
                                disabled={!canEditRegistry}
                                className="h-10 rounded-xl border-neutral-300 bg-white"
                            />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => {
                            if (!canEditRegistry) return;
                            setForm((prev) => ({ ...prev, required: !prev.required }));
                        }}
                        disabled={!canEditRegistry}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                            form.required
                                ? 'border-violet-300 bg-violet-100/70'
                                : 'border-neutral-200 bg-white'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        <div>
                            <p className="text-sm font-medium text-neutral-700">Variable requerida</p>
                            <p className="text-[11px] text-neutral-500">Define si este dato es obligatorio.</p>
                        </div>
                        <span className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                            form.required ? 'bg-violet-600' : 'bg-neutral-300'
                        }`}>
                            <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                form.required ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                        </span>
                    </button>

                    <div className="rounded-xl border border-violet-100 bg-white px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Preview</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                            <code className="min-w-0 truncate rounded-md bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">
                                {`{{${previewKey}}}`}
                            </code>
                            <Badge tone={VARIABLE_TYPE_TONE[form.type]}>{VARIABLE_TYPE_LABEL[form.type]}</Badge>
                        </div>
                    </div>

                    {formError && (
                        <InlineAlert tone="error">
                            {formError}
                        </InlineAlert>
                    )}

                    <Button
                        type="submit"
                        disabled={!canEditRegistry}
                        className="h-10 w-full rounded-xl"
                    >
                        <Plus size={12} />
                        {editingKey ? 'Guardar cambios' : 'Crear variable'}
                    </Button>
                </form>
            </Card>

            <Card className="space-y-3 border-neutral-200/90 bg-white">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-neutral-800">Listado de variables</h3>
                        <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">
                            Click para insertar, arrastra al canvas o edita cada registro.
                        </p>
                    </div>
                    <Badge tone="info">{filteredVariables.length}</Badge>
                </div>

                <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <Input
                        id={listSearchId}
                        type="search"
                        value={listQuery}
                        onChange={(event) => setListQuery(event.target.value)}
                        placeholder="Buscar por key, nombre o tipo"
                        className="h-10 rounded-xl border-neutral-300 bg-neutral-50 pl-9"
                    />
                </div>

                {registry.length === 0 && fallback.length > 0 && (
                    <InlineAlert tone="warning">
                        Registry vacio: se muestran variables derivadas de elementos del documento.
                    </InlineAlert>
                )}

                {registryError && (
                    <InlineAlert tone="error">
                        {registryError}
                    </InlineAlert>
                )}

                {isListLoading ? (
                    <VariableListSkeleton />
                ) : isListEmpty ? (
                    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center">
                        <p className="text-sm font-medium text-neutral-700">Aun no hay variables</p>
                        <p className="mt-1 text-xs text-neutral-500">
                            Crea la primera variable para reutilizar datos en el template.
                        </p>
                        <Button
                            className="mt-3"
                            size="sm"
                            onClick={() => keyInputRef.current?.focus()}
                            disabled={!canEditRegistry}
                        >
                            <Plus size={12} />
                            Crear primera variable
                        </Button>
                    </div>
                ) : isFilterEmpty ? (
                    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center">
                        <p className="text-sm font-medium text-neutral-700">Sin resultados</p>
                        <p className="mt-1 text-xs text-neutral-500">
                            Ajusta la busqueda para ver variables disponibles.
                        </p>
                        <Button
                            className="mt-3"
                            size="sm"
                            variant="secondary"
                            onClick={() => setListQuery('')}
                        >
                            Limpiar busqueda
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredVariables.map((item) => (
                            <div
                                key={item.key}
                                draggable
                                onDragStart={(event) => handleDragStart(event, item.key)}
                                onDragEnd={handleDragEnd}
                                className={`rounded-xl border p-3 transition-all ${
                                    draggingKey === item.key
                                        ? 'border-violet-300 bg-violet-50/70 shadow-sm'
                                        : 'border-neutral-200 bg-white hover:border-violet-200 hover:shadow-sm'
                                }`}
                                title="Arrastra al canvas"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700">
                                                <Braces size={12} />
                                            </span>
                                            <p className="truncate text-sm font-semibold text-neutral-800">
                                                {item.label}
                                            </p>
                                        </div>
                                        <p className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                                            {item.key}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <Badge tone={VARIABLE_TYPE_TONE[item.type]}>
                                            {VARIABLE_TYPE_LABEL[item.type]}
                                        </Badge>
                                        {item.required && <Badge tone="danger">Requerida</Badge>}
                                    </div>
                                </div>

                                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-blue-200/80 bg-blue-50/70 px-2 py-1.5">
                                    <button
                                        type="button"
                                        onClick={() => handleInsert(item.key)}
                                        className="min-w-0 flex-1 truncate text-left font-mono text-xs font-medium text-blue-700 hover:text-blue-800"
                                        title="Insertar token"
                                    >
                                        {`{{${item.key}}}`}
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1.5 text-blue-700 hover:bg-blue-100"
                                        onClick={() => {
                                            void handleCopyToken(item.key);
                                        }}
                                        title="Copiar token"
                                    >
                                        {copiedKey === item.key ? <Check size={12} /> : <Copy size={12} />}
                                    </Button>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {hasDefault(item) && (
                                        <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-600">
                                            {`Default: ${getDefaultLabel(item)}`}
                                        </span>
                                    )}
                                    {item.format && (
                                        <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-600">
                                            {`Formato: ${item.format}`}
                                        </span>
                                    )}
                                    {item.type === 'list' && Array.isArray(item.options) && item.options.length > 0 && (
                                        <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-600">
                                            {`${item.options.length} opciones`}
                                        </span>
                                    )}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        onClick={() => handleInsert(item.key)}
                                        size="sm"
                                        className="h-8 min-w-[90px] flex-1"
                                    >
                                        <Plus size={11} />
                                        Insertar
                                    </Button>
                                    <Button
                                        onClick={() => handleEdit(item)}
                                        disabled={!canEditRegistry}
                                        size="sm"
                                        variant="secondary"
                                        className="h-8"
                                    >
                                        <Pencil size={11} />
                                        Editar
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(item.key)}
                                        disabled={!canEditRegistry}
                                        size="sm"
                                        variant="danger"
                                        className="h-8"
                                    >
                                        <Trash2 size={11} />
                                        Eliminar
                                    </Button>
                                </div>

                                <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-neutral-400">
                                    <GripVertical size={10} />
                                    Arrastra esta tarjeta al canvas
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </Panel>
    );
}
