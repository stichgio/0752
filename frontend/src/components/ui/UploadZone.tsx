import React, { useState, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { cn } from './cn';

export interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  hint?: string;
  statusTone?: 'neutral' | 'success' | 'error';
  metaLabel?: string;
  disabled?: boolean;
  className?: string;
}

const toneBorder: Record<NonNullable<UploadZoneProps['statusTone']>, string> = {
  neutral: 'border-[var(--g-border)]',
  success: 'border-green-500/50',
  error: 'border-red-500/50',
};

export default function UploadZone({
  onFiles,
  accept,
  multiple = false,
  icon,
  title = 'Arrastra archivos aqui',
  description = 'o haz click para seleccionar',
  hint,
  statusTone = 'neutral',
  metaLabel,
  disabled = false,
  className,
}: UploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    },
    [openPicker],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragActive(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;

      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) {
        onFiles(multiple ? dropped : [dropped[0]]);
      }
    },
    [disabled, multiple, onFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length > 0) {
        onFiles(multiple ? selected : [selected[0]]);
      }
      e.target.value = '';
    },
    [multiple, onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title}
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-all duration-200 select-none',
        isDragActive
          ? 'border-white/60 bg-white/[0.04] shadow-[0_0_30px_rgba(255,255,255,0.05)]'
          : cn(toneBorder[statusTone], 'bg-[var(--g-surface)]/40 hover:border-neutral-500'),
        disabled && 'opacity-40 pointer-events-none',
        className,
      )}
      data-testid="upload-zone"
      data-drag-active={isDragActive}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
        data-testid="upload-zone-input"
      />

      {/* Icon */}
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
          isDragActive
            ? 'border-white/30 bg-white/10'
            : 'border-[var(--g-border)] bg-[var(--g-bg)]',
        )}
      >
        {icon || (
          <Upload
            size={18}
            className={isDragActive ? 'text-white' : 'text-[var(--g-text-dim)]'}
          />
        )}
      </div>

      {/* Title */}
      <span className="text-sm font-mono text-[var(--g-text)]">{title}</span>

      {/* Description */}
      {description && (
        <span className="text-xs text-[var(--g-text-dim)]">{description}</span>
      )}

      {/* Hint */}
      {hint && (
        <span className="text-[10px] font-mono text-[var(--g-text-dim)]/60">
          {hint}
        </span>
      )}

      {/* Meta label */}
      {metaLabel && (
        <span className="mt-1 rounded-full border border-[var(--g-border)] px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-[var(--g-text-dim)]">
          {metaLabel}
        </span>
      )}

      {/* Drag-active overlay */}
      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-white/20" />
      )}
    </div>
  );
}
