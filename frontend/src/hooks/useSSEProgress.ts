import { useState, useRef, useCallback } from 'react';
import { getApiBase } from '@/utils/apiBase';

interface ProgressState {
    phase: string;
    current: number;
    total: number;
    percent: number;
    phaseLabel: string;
    detail: string;
    totalReports?: number;
    preparedCount?: number;
    generatedCount?: number;
    mergedCount?: number;
}

interface SSEProgressOptions {
    onComplete: (downloadUrl: string) => void;
    onError?: (error: string) => void;
}

interface ProgressEventData {
    phase?: string;
    current?: number;
    total?: number;
    detail?: string;
    overall_percent?: number;
    total_reports?: number;
    prepared_count?: number;
    generated_count?: number;
    merged_count?: number;
}

// Weighted phase percentages for smooth progress
const PHASE_WEIGHTS: Record<string, [number, number]> = {
    preparing: [0, 30],
    rendering: [30, 75],
    merging: [75, 90],
    compressing: [90, 100],
};

const PHASE_LABELS: Record<string, string> = {
    preparing: 'Preparando documentos...',
    rendering: 'Renderizando PDFs...',
    merging: 'Uniendo documentos...',
    compressing: 'Comprimiendo archivo...',
};

const FINALIZATION_UNITS = 1;

function normalizeCount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed);
}

function clampCount(value: number, max?: number): number {
    if (typeof max !== 'number' || max <= 0) return Math.max(0, value);
    return Math.max(0, Math.min(value, max));
}

function calcPhasePercent(phase: string, current: number, total: number): number {
    const range = PHASE_WEIGHTS[phase];
    if (!range) return 0;
    const [lo, hi] = range;
    if (total <= 0) return lo;
    const frac = Math.min(current / total, 1);
    return Math.round(lo + frac * (hi - lo));
}

function calcOverallPercent(
    totalReports: number,
    preparedCount: number,
    generatedCount: number,
    mergedCount: number
): number {
    if (totalReports <= 0) return 0;
    const totalUnits = (totalReports * 3) + FINALIZATION_UNITS;
    const completedUnits = clampCount(preparedCount, totalReports)
        + clampCount(generatedCount, totalReports)
        + clampCount(mergedCount, totalReports);
    return Math.min(99, Math.round((completedUnits / totalUnits) * 100));
}

export function deriveProgressState(
    previous: ProgressState | null,
    data: ProgressEventData
): ProgressState {
    const phase = data.phase || '';
    const current = normalizeCount(data.current);
    const total = normalizeCount(data.total);
    const previousTotalReports = previous?.totalReports ?? 0;
    const inferredTotalReports = normalizeCount(
        data.total_reports ?? (phase !== 'compressing' ? total : previousTotalReports)
    );
    const totalReports = inferredTotalReports > 0 ? inferredTotalReports : previousTotalReports;

    const previousPrepared = previous?.preparedCount ?? 0;
    const previousGenerated = previous?.generatedCount ?? 0;
    const previousMerged = previous?.mergedCount ?? 0;

    const preparedCount = clampCount(
        normalizeCount(
            data.prepared_count
            ?? (phase === 'preparing' ? Math.max(previousPrepared, current) : previousPrepared)
        ),
        totalReports || undefined
    );
    const generatedCount = clampCount(
        normalizeCount(
            data.generated_count
            ?? (phase === 'rendering' ? Math.max(previousGenerated, current) : previousGenerated)
        ),
        totalReports || undefined
    );
    const mergedCount = clampCount(
        normalizeCount(
            data.merged_count
            ?? (phase === 'merging' ? Math.max(previousMerged, current) : previousMerged)
        ),
        totalReports || undefined
    );

    const overallPercent = typeof data.overall_percent === 'number'
        ? Math.max(0, Math.min(100, normalizeCount(data.overall_percent)))
        : totalReports > 0
            ? calcOverallPercent(totalReports, preparedCount, generatedCount, mergedCount)
            : calcPhasePercent(phase, current, total);

    return {
        phase,
        current,
        total,
        percent: overallPercent,
        phaseLabel: PHASE_LABELS[phase] || phase,
        detail: data.detail || '',
        totalReports: totalReports || undefined,
        preparedCount,
        generatedCount,
        mergedCount,
    };
}

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
        setProgress({
            phase: 'preparing',
            current: 0,
            total: 0,
            percent: 0,
            phaseLabel: 'Iniciando...',
            detail: '',
            totalReports: undefined,
            preparedCount: 0,
            generatedCount: 0,
            mergedCount: 0,
        });

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
                                setProgress((previous) => previous
                                    ? { ...previous, phase: 'done', percent: 100, phaseLabel: 'Completado!' }
                                    : previous
                                );
                                setIsLoading(false);
                                opts.onComplete(data.download_url);
                                return;
                            }

                            if (currentEvent === 'error' || data.phase === 'error') {
                                throw new Error(data.detail || 'Error en generacion');
                            }

                            setProgress((previous) => deriveProgressState(previous, data));
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

            if (!completed) {
                throw new Error('La conexion SSE se cerro sin completar la operacion');
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
