import { useState, useRef, useCallback } from 'react';
import { getApiBase } from '@/utils/apiBase';

interface ProgressState {
    phase: string;
    current: number;
    total: number;
    percent: number;
    phaseLabel: string;
}

interface SSEProgressOptions {
    onComplete: (downloadUrl: string) => void;
    onError?: (error: string) => void;
}

// Weighted phase percentages for smooth progress
const PHASE_WEIGHTS: Record<string, [number, number]> = {
    preparing:   [0, 30],
    rendering:   [30, 75],
    merging:     [75, 90],
    compressing: [90, 100],
};

function calcPercent(phase: string, current: number, total: number): number {
    const range = PHASE_WEIGHTS[phase];
    if (!range) return 0;
    const [lo, hi] = range;
    if (total <= 0) return lo;
    const frac = Math.min(current / total, 1);
    return Math.round(lo + frac * (hi - lo));
}

const PHASE_LABELS: Record<string, string> = {
    preparing: 'Preparando documentos...',
    rendering: 'Renderizando PDFs...',
    merging: 'Uniendo documentos...',
    compressing: 'Comprimiendo archivo...',
};

export function useSSEProgress() {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<ProgressState | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const run = useCallback(async (
        endpoint: string,
        formData: FormData,
        opts: SSEProgressOptions
    ) => {
        const controller = new AbortController();
        abortRef.current = controller;
        setIsLoading(true);
        setProgress({ phase: 'preparing', current: 0, total: 0, percent: 0, phaseLabel: 'Iniciando...' });

        try {
            const base = getApiBase();
            const url = `${base}${endpoint}`;

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No se pudo obtener el flujo de lectura');

            const decoder = new TextDecoder();
            let buffer = '';

            let completed = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEvent = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        const raw = line.slice(6);
                        try {
                            const data = JSON.parse(raw);

                            if (currentEvent === 'done' || data.phase === 'done') {
                                completed = true;
                                setProgress(p => p ? { ...p, percent: 100, phaseLabel: 'Completado!' } : p);
                                setIsLoading(false);
                                opts.onComplete(data.download_url);
                                return;
                            }

                            if (currentEvent === 'error' || data.phase === 'error') {
                                throw new Error(data.detail || 'Error en generación');
                            }

                            // Regular progress event
                            const phase = data.phase || '';
                            const current = data.current ?? 0;
                            const total = data.total ?? 0;
                            setProgress({
                                phase,
                                current,
                                total,
                                percent: calcPercent(phase, current, total),
                                phaseLabel: PHASE_LABELS[phase] || phase,
                            });
                        } catch (parseErr) {
                            if (parseErr instanceof SyntaxError) {
                                console.warn('[SSE] Chunk malformado descartado:', currentEvent.slice(0, 120), parseErr);
                                continue;
                            }
                            throw parseErr;
                        }
                        currentEvent = '';
                    }
                }
            }

            // Stream closed without a 'done' event — treat as error to release spinner
            if (!completed) {
                throw new Error('La conexión SSE se cerró sin completar la operación');
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            setIsLoading(false);
            setProgress(null);
            opts.onError?.(err.message || 'Error desconocido');
        }
    }, []);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        setIsLoading(false);
        setProgress(null);
    }, []);

    return { isLoading, progress, run, cancel };
}
