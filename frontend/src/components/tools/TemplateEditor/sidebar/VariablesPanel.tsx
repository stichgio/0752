import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Braces, Loader2 } from 'lucide-react';
import type { ElementPreset, ElementType, TemplateElement } from '../canvasTypes';

interface VariableItem {
    key: string;
    label: string;
    category?: string;
}

interface VariablesPanelProps {
    onAddElement: (
        type: ElementType,
        pos?: { x: number; y: number },
        presetId?: ElementPreset,
        overrides?: Partial<TemplateElement>,
    ) => void;
}

const CATEGORY_FALLBACK = 'Otros';
const CATEGORY_ORDER = [
    'Identificadores',
    'Infraestructura',
    'Inspeccion',
    'Medidas',
    'Valvulas',
    'Canastillas',
    'Observaciones',
    'Sugerencias',
    'Generales',
    CATEGORY_FALLBACK,
];

function normalizePayload(payload: unknown): VariableItem[] {
    const maybeList = Array.isArray(payload)
        ? payload
        : (payload && typeof payload === 'object' && Array.isArray((payload as { variables?: unknown[] }).variables))
            ? (payload as { variables: unknown[] }).variables
            : [];

    return maybeList
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
            key: typeof item.key === 'string' ? item.key : '',
            label: typeof item.label === 'string' ? item.label : '',
            category: typeof item.category === 'string' ? item.category : CATEGORY_FALLBACK,
        }))
        .filter((item) => item.key && item.label);
}

export function VariablesPanel({ onAddElement }: VariablesPanelProps) {
    const [items, setItems] = useState<VariableItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [draggingKey, setDraggingKey] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const loadVariables = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch('/api/technical-reports/variables', {
                    method: 'GET',
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const payload = await response.json();
                setItems(normalizePayload(payload));
            } catch (err) {
                if ((err as { name?: string })?.name === 'AbortError') return;
                setItems([]);
                setError('No se pudieron cargar las variables.');
            } finally {
                setIsLoading(false);
            }
        };

        void loadVariables();
        return () => controller.abort();
    }, []);

    const grouped = useMemo(() => {
        const map = new Map<string, VariableItem[]>();
        items.forEach((item) => {
            const category = item.category || CATEGORY_FALLBACK;
            if (!map.has(category)) {
                map.set(category, []);
            }
            map.get(category)!.push(item);
        });

        return Array.from(map.entries()).sort(([a], [b]) => {
            const ai = CATEGORY_ORDER.indexOf(a);
            const bi = CATEGORY_ORDER.indexOf(b);
            const safeA = ai === -1 ? CATEGORY_ORDER.length : ai;
            const safeB = bi === -1 ? CATEGORY_ORDER.length : bi;
            if (safeA !== safeB) return safeA - safeB;
            return a.localeCompare(b);
        });
    }, [items]);

    const addVariable = useCallback(
        (key: string) => {
            onAddElement('variable', undefined, undefined, {
                variableName: key,
                content: `{{${key}}}`,
            });
        },
        [onAddElement],
    );

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

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-neutral-500 text-sm gap-2">
                <Loader2 size={14} className="animate-spin" />
                Cargando variables...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="p-4 text-sm text-neutral-500">
                No hay variables disponibles.
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-3 space-y-4">
            {grouped.map(([category, groupItems]) => (
                <section key={category}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            {category}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {groupItems.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                draggable
                                onClick={() => addVariable(item.key)}
                                onDragStart={(event) => handleDragStart(event, item.key)}
                                onDragEnd={handleDragEnd}
                                className={`w-full text-left p-2 rounded-lg border transition-all ${
                                    draggingKey === item.key
                                        ? 'border-blue-300 bg-blue-50/70'
                                        : 'border-neutral-200 hover:border-blue-300 hover:bg-blue-50/40'
                                }`}
                                title="Click para insertar o arrastra al canvas"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                        <Braces size={12} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[11px] font-medium text-neutral-700 truncate">
                                            {item.label}
                                        </div>
                                        <div className="mt-0.5 inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 font-mono">
                                            {`{{${item.key}}}`}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
