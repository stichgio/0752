import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  children?: React.ReactNode;
}

const sizeMap: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  /* Escape key handler */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  /* Auto-focus close button on mount */
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        data-testid="dialog-backdrop"
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-[calc(100%-2rem)] rounded-2xl border border-[var(--g-border)] bg-[var(--g-surface)] p-6 shadow-2xl',
          sizeMap[size],
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="mb-4">
            {title && (
              <h2 className="text-base font-bold text-[var(--g-text)] font-mono">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-[var(--g-text-dim)]">
                {description}
              </p>
            )}
          </div>
        )}

        {/* Close button */}
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--g-text-dim)] transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Cerrar"
          data-testid="dialog-close"
        >
          <X size={16} />
        </button>

        {/* Body */}
        {children}

        {/* Footer */}
        {footer && (
          <div className="mt-5 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
