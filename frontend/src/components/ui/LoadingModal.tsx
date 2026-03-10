
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#111] border border-[#333] rounded-lg p-8 flex flex-col items-center min-w-[340px] max-w-[420px]">
                {!progress ? (
                    <>
                        <div
                            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
                            style={{ borderColor: accentColor }}
                        />
                        <p className="mt-4 text-[#eee] font-mono text-center">{message}</p>
                        <p className="mt-2 text-[#666] text-xs">Por favor espere...</p>
                    </>
                ) : (
                    <>
                        <p className="text-[#eee] font-mono text-center text-sm mb-4">{message}</p>

                        <div className="w-full bg-[#222] rounded-full h-3 overflow-hidden border border-[#333]">
                            <div
                                className="h-full rounded-full transition-all duration-200 ease-out"
                                style={{
                                    width: `${progress.percent}%`,
                                    backgroundColor: accentColor,
                                }}
                            />
                        </div>

                        <div className="w-full flex items-center justify-between mt-3">
                            <span className="text-[#999] text-xs font-mono">
                                {progress.phaseLabel}
                            </span>
                            <span className="text-[#eee] text-sm font-mono font-bold">
                                {progress.percent}%
                            </span>
                        </div>

                        {showGenerationCounter && (
                            <div className="w-full mt-3 rounded-md border border-[#2a2a2a] bg-black/30 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[#8a8a8a] text-[10px] font-mono uppercase tracking-wide">
                                        Generaciones listas
                                    </span>
                                    <span className="text-[#eee] text-sm font-mono font-bold">
                                        {generatedCount} / {totalReports}
                                    </span>
                                </div>
                            </div>
                        )}

                        {progress.detail && (
                            <p className="mt-2 text-[#777] text-[11px] font-mono text-center">
                                {progress.detail}
                            </p>
                        )}

                        {showStageCounter && (
                            <p className="mt-1 text-[#666] text-xs font-mono">
                                {getStageCounterLabel(progress.phase)}: {progress.current ?? 0} / {progress.total}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
