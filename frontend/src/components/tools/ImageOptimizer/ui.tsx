import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageItem, Toast } from './types';
import { formatBytes } from '@/utils/formatBytes';

export function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
    return (
        <div className="fixed right-4 top-20 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 36, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 36, scale: 0.96 }}
                        className={`flex items-center gap-2 rounded-[20px] border px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl ${toast.type === 'error'
                            ? 'border-red-500/20 bg-red-950/90 text-red-300'
                            : toast.type === 'success'
                                ? 'border-primary-500/20 bg-primary-950/90 text-primary-300'
                                : 'border-white/10 bg-black/80 text-neutral-200'
                            }`}
                    >
                        {toast.type === 'error' && <AlertCircle size={16} />}
                        {toast.type === 'success' && <CheckCircle size={16} />}
                        {toast.type === 'info' && <Info size={16} />}
                        <span className="flex-1 text-sm font-mono leading-snug">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    return (
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
                className="h-full bg-primary-500 shadow-[0_0_10px_rgba(var(--color-primary-500),0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
            />
        </div>
    );
}

export function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
}) {
    return (
        <div className="inline-flex rounded-[20px] border border-white/10 bg-black/40 p-1 shadow-inner backdrop-blur-sm">
            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className={`rounded-[16px] px-4 py-2 text-[10px] font-mono uppercase tracking-[0.2em] transition-all hover:bg-white/5 ${value === option.value ? 'bg-white font-semibold text-black hover:bg-white' : 'text-neutral-500 hover:text-white'
                        }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function BeforeAfterSlider({ before, after, alt }: { before: string; after: string; alt: string }) {
    const [position, setPosition] = useState(50);
    return (
        <div className="space-y-4 w-full h-full">
            <div className="relative h-full w-full overflow-hidden rounded-[20px] border border-white/5 bg-black/40">
                <img src={before} alt={`${alt} original`} className="absolute inset-0 h-full w-full object-contain" />
                <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${position}%` }}>
                    <img src={after} alt={`${alt} resultado`} className="h-full w-full object-contain" />
                </div>
                <div className="absolute inset-y-0" style={{ left: `calc(${position}% - 1px)` }}>
                    <div className="h-full w-0.5 bg-primary-500 shadow-[0_0_12px_rgba(var(--color-primary-500),0.8)]" />
                </div>
                <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neutral-300 backdrop-blur-md">
                    Original
                </div>
                <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-primary-400 backdrop-blur-md">
                    Resultado
                </div>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                className="w-full accent-white"
                aria-label="Comparar antes y despues"
            />
        </div>
    );
}

export function ItemSummary({ item }: { item: ImageItem }) {
    const reduction = item.resultSize && item.originalSize > 0
        ? Math.max(0, ((item.originalSize - item.resultSize) / item.originalSize) * 100)
        : 0;

    const statusLabel = useMemo(() => {
        if (item.excluded) return 'Excluida';
        if (item.status === 'processing') return 'Procesando';
        if (item.status === 'error') return 'Error';
        if (item.stale) return 'Stale';
        if (item.status === 'completed') return 'Lista';
        return 'Pendiente';
    }, [item]);

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[16px] border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Estado</p>
                <p className="mt-1.5 text-sm font-medium text-white">{statusLabel}</p>
            </div>
            <div className="rounded-[16px] border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Peso</p>
                <p className="mt-1.5 text-sm font-medium text-white">
                    {formatBytes(item.originalSize)}
                    {item.resultSize ? <span className="text-neutral-500"> / {formatBytes(item.resultSize)}</span> : null}
                </p>
            </div>
            <div className="rounded-[16px] border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Dimensiones</p>
                <p className="mt-1.5 text-sm font-medium text-white">
                    {item.sourceWidth && item.sourceHeight ? `${item.sourceWidth}x${item.sourceHeight}` : 'Sin datos'}
                    {item.finalWidth && item.finalHeight ? <span className="text-neutral-500"> / {item.finalWidth}x{item.finalHeight}</span> : null}
                </p>
            </div>
            <div className="rounded-[16px] border border-white/5 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">Ahorro</p>
                <p className="mt-1.5 text-sm font-medium text-white">{item.resultSize ? `${reduction.toFixed(1)}%` : '--'}</p>
            </div>
        </div>
    );
}

// --- Studio Pro UI Primitives ------------------------------------------------

export function OperationSection({
    title,
    icon,
    accentColor,
    enabled,
    onToggle,
    disabled,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    accentColor: string;
    enabled: boolean;
    onToggle?: (value: boolean) => void;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    const isCollapsible = !!onToggle;
    const isOpen = !isCollapsible || enabled;

    const headerContent = (
        <>
            <span style={{ color: enabled ? accentColor : '#52525b' }} className="shrink-0 transition-colors duration-200">
                {icon}
            </span>
            <span className="flex-1 text-[11px] font-mono uppercase tracking-[0.15em] text-zinc-300">
                {title}
            </span>
            {isCollapsible && (
                <span
                    className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200"
                    style={enabled ? { backgroundColor: accentColor } : { backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                </span>
            )}
        </>
    );

    return (
        <div
            className={`relative overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#111114] transition-all duration-200 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
            style={{ borderLeftColor: enabled ? accentColor : 'rgba(255,255,255,0.06)', borderLeftWidth: '3px' }}
        >
            {isCollapsible ? (
                <button
                    type="button"
                    onClick={() => onToggle?.(!enabled)}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
                >
                    {headerContent}
                </button>
            ) : (
                <div className="flex w-full items-center gap-2.5 px-4 py-3">
                    {headerContent}
                </div>
            )}
            <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="px-4 pb-4 pt-1 space-y-3">
                    {children}
                </div>
            </div>
        </div>
    );
}

export function ModeToggle({
    label,
    enabled,
    onChange,
    activeClassName,
}: {
    label: string;
    enabled: boolean;
    onChange: (value: boolean) => void;
    activeClassName?: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!enabled)}
            aria-pressed={enabled}
            className={`flex shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] transition-all duration-150 border ${enabled
                    ? activeClassName ?? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                }`}
        >
            {label}
        </button>
    );
}

export function PillPreset({
    label,
    accentClassName,
    active,
    onClick,
}: {
    label: string;
    accentClassName: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] transition-all duration-150 border ${active
                    ? accentClassName
                    : 'border-white/[0.12] bg-white/[0.03] text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                }`}
        >
            {label}
        </button>
    );
}
