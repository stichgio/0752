import React from 'react';

interface ProgressInfo {
    percent: number;
    phaseLabel: string;
    current?: number;
    total?: number;
}

interface LoadingModalProps {
    message?: string;
    accentColor?: string;
    progress?: ProgressInfo | null;
}

export default function LoadingModal({
    message = 'Procesando...',
    accentColor = '#00a0b0',
    progress = null,
}: LoadingModalProps) {
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

                        {/* Progress bar */}
                        <div className="w-full bg-[#222] rounded-full h-3 overflow-hidden border border-[#333]">
                            <div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                    width: `${progress.percent}%`,
                                    backgroundColor: accentColor,
                                }}
                            />
                        </div>

                        {/* Percentage + phase */}
                        <div className="w-full flex items-center justify-between mt-3">
                            <span className="text-[#999] text-xs font-mono">
                                {progress.phaseLabel}
                            </span>
                            <span className="text-[#eee] text-sm font-mono font-bold">
                                {progress.percent}%
                            </span>
                        </div>

                        {/* Item counter */}
                        {progress.total != null && progress.total > 0 && (
                            <p className="mt-1 text-[#666] text-xs font-mono">
                                {progress.current ?? 0} / {progress.total}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
