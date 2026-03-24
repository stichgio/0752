import Dialog from './Dialog';
import JobProgress from './JobProgress';

interface ProgressInfo {
    percent: number;
    phaseLabel: string;
    phase?: string;
    current?: number;
    total?: number;
    detail?: string;
    totalReports?: number;
    generatedCount?: number;
}

interface LoadingModalProps {
    message?: string;
    accentColor?: string;
    progress?: ProgressInfo | null;
}

function getStageCounterLabel(phase?: string): string {
    switch (phase) {
        case 'preparing':
            return 'Preparados';
        case 'rendering':
            return 'Renderizados';
        case 'merging':
            return 'Integrados';
        case 'compressing':
            return 'Finalizando';
        default:
            return 'Etapa actual';
    }
}

/**
 * Full-screen loading modal for PDF generation and long processes.
 *
 * Backwards-compatible API: `message`, `accentColor`, `progress`.
 * Internally composed with Dialog + JobProgress from the design system v1.
 */
export default function LoadingModal({
    message = 'Procesando...',
    accentColor = '#00a0b0',
    progress = null,
}: LoadingModalProps) {
    const totalReports = progress?.totalReports && progress.totalReports > 0
        ? progress.totalReports
        : undefined;
    const generatedCount = totalReports
        ? Math.min(progress?.generatedCount ?? 0, totalReports)
        : 0;
    const showGenerationCounter = Boolean(totalReports);
    const showStageCounter = Boolean(
        progress
        && progress.total != null
        && progress.total > 0
        && (
            progress.phase !== 'rendering'
            || progress.current !== generatedCount
            || progress.total !== totalReports
        )
    );

    return (
        <Dialog
            open={true}
            onClose={() => { /* non-dismissable */ }}
            closeOnBackdrop={false}
            closeOnEscape={false}
            size="sm"
        >
            <div className="flex flex-col items-center min-w-[300px]">
                {/* Hide the close button via CSS since this modal is non-dismissable */}
                <style>{`[data-testid="dialog-close"] { display: none !important; }`}</style>

                {!progress ? (
                    <>
                        <div
                            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
                            style={{ borderColor: accentColor }}
                        />
                        <p className="mt-4 text-[var(--g-text)] font-mono text-center">{message}</p>
                        <p className="mt-2 text-[var(--g-text-dim)] text-xs">Por favor espere...</p>
                    </>
                ) : (
                    <>
                        <p className="text-[var(--g-text)] font-mono text-center text-sm mb-4">{message}</p>

                        {/* Main progress bar */}
                        <div className="w-full">
                            <JobProgress
                                value={progress.percent}
                                total={100}
                                label={progress.phaseLabel}
                                state="running"
                            />
                        </div>

                        {showGenerationCounter && (
                            <div className="w-full mt-3 rounded-md border border-[var(--g-border)] bg-black/30 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[var(--g-text-dim)] text-[10px] font-mono uppercase tracking-wide">
                                        Generaciones listas
                                    </span>
                                    <span className="text-[var(--g-text)] text-sm font-mono font-bold">
                                        {generatedCount} / {totalReports}
                                    </span>
                                </div>
                            </div>
                        )}

                        {progress.detail && (
                            <p className="mt-2 text-[var(--g-text-dim)]/70 text-[11px] font-mono text-center">
                                {progress.detail}
                            </p>
                        )}

                        {showStageCounter && (
                            <p className="mt-1 text-[var(--g-text-dim)] text-xs font-mono">
                                {getStageCounterLabel(progress.phase)}: {progress.current ?? 0} / {progress.total}
                            </p>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}
