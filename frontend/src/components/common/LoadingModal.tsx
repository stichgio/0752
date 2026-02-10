import React from 'react';

interface LoadingModalProps {
    message?: string;
    accentColor?: string;
}

export default function LoadingModal({ message = 'Procesando...', accentColor = '#00a0b0' }: LoadingModalProps) {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#111] border border-[#333] rounded-lg p-8 flex flex-col items-center min-w-[300px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: accentColor }}></div>
                <p className="mt-4 text-[#eee] font-mono text-center">{message}</p>
                <p className="mt-2 text-[#666] text-xs">Por favor espere...</p>
            </div>
        </div>
    );
}
