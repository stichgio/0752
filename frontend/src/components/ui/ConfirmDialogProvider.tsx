import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmDialogOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmTone;
}

export type ConfirmDialogFn = (options: ConfirmDialogOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmDialogFn | null>(null);

interface ActiveDialog extends ConfirmDialogOptions {
    tone: ConfirmTone;
    confirmLabel: string;
    cancelLabel: string;
}

const DEFAULT_LABELS: Record<ConfirmTone, string> = {
    default: 'Confirmar',
    danger: 'Continuar',
};

export function useConfirmDialog(): ConfirmDialogFn {
    const context = useContext(ConfirmDialogContext);

    if (!context) {
        throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider');
    }

    return context;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
    const [dialog, setDialog] = useState<ActiveDialog | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const previousOverflowRef = useRef<string>('');
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    const restoreFocus = useCallback(() => {
        const target = previousFocusRef.current;
        previousFocusRef.current = null;

        if (target && typeof target.focus === 'function') {
            window.setTimeout(() => target.focus(), 0);
        }
    }, []);

    const settle = useCallback((value: boolean) => {
        const resolver = resolveRef.current;
        resolveRef.current = null;
        setDialog(null);
        resolver?.(value);
        restoreFocus();
    }, [restoreFocus]);

    const confirmDialog = useCallback<ConfirmDialogFn>((options) => {
        if (resolveRef.current) {
            resolveRef.current(false);
            resolveRef.current = null;
        }

        previousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const tone = options.tone ?? 'default';

        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
            setDialog({
                title: options.title,
                description: options.description,
                tone,
                confirmLabel: options.confirmLabel ?? DEFAULT_LABELS[tone],
                cancelLabel: options.cancelLabel ?? 'Cancelar',
            });
        });
    }, []);

    useEffect(() => {
        return () => {
            if (resolveRef.current) {
                resolveRef.current(false);
                resolveRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!dialog) return undefined;

        previousOverflowRef.current = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflowRef.current;
        };
    }, [dialog]);

    useEffect(() => {
        if (!dialog) return;

        const target = dialog.tone === 'danger'
            ? cancelButtonRef.current
            : confirmButtonRef.current;

        target?.focus();
    }, [dialog]);

    useEffect(() => {
        if (!dialog) return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                settle(false);
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = [cancelButtonRef.current, confirmButtonRef.current]
                .filter(Boolean) as HTMLButtonElement[];

            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [dialog, settle]);

    const contextValue = useMemo(() => confirmDialog, [confirmDialog]);

    return (
        <ConfirmDialogContext.Provider value={contextValue}>
            {children}
            {dialog && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
                    data-testid="confirm-dialog-backdrop"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            settle(false);
                        }
                    }}
                >
                    <div
                        aria-describedby={dialog.description ? descriptionId : undefined}
                        aria-labelledby={titleId}
                        aria-modal="true"
                        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-[#111111] p-6 text-neutral-100 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                        data-testid="confirm-dialog"
                        role="dialog"
                    >
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <h2 id={titleId} className="text-lg font-semibold tracking-tight text-white">
                                    {dialog.title}
                                </h2>
                                {dialog.description && (
                                    <p id={descriptionId} className="text-sm leading-6 text-neutral-400">
                                        {dialog.description}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                                <button
                                    ref={cancelButtonRef}
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-700 bg-transparent px-4 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-500/40"
                                    data-testid="confirm-dialog-cancel"
                                    onClick={() => settle(false)}
                                    type="button"
                                >
                                    {dialog.cancelLabel}
                                </button>
                                <button
                                    ref={confirmButtonRef}
                                    className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 ${
                                        dialog.tone === 'danger'
                                            ? 'bg-red-600 hover:bg-red-500 focus:ring-red-500/40'
                                            : 'bg-violet-600 hover:bg-violet-500 focus:ring-violet-500/40'
                                    }`}
                                    data-testid="confirm-dialog-confirm"
                                    onClick={() => settle(true)}
                                    type="button"
                                >
                                    {dialog.confirmLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </ConfirmDialogContext.Provider>
    );
}