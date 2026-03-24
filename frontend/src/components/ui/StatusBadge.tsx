import React from 'react';
import { cn } from './cn';

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'processing';

export interface StatusBadgeProps {
  tone?: StatusTone;
  dot?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  neutral:
    'border-[var(--g-border)] bg-[var(--g-surface)] text-[var(--g-text-dim)]',
  info: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  success:
    'border-green-500/20 bg-green-500/10 text-green-400',
  warning:
    'border-amber-500/20 bg-amber-500/10 text-amber-300',
  danger:
    'border-red-500/20 bg-red-500/10 text-red-400',
  processing:
    'border-white/20 bg-white text-black',
};

const dotColors: Record<StatusTone, string> = {
  neutral: 'bg-neutral-500',
  info: 'bg-sky-400',
  success: 'bg-green-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  processing: 'bg-black',
};

export default function StatusBadge({
  tone = 'neutral',
  dot = false,
  icon,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em]',
        toneStyles[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', dotColors[tone])}
          aria-hidden
        />
      )}
      {icon}
      {children}
    </span>
  );
}
