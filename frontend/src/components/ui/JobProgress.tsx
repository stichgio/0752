import React from 'react';
import { cn } from './cn';

export type JobState = 'idle' | 'running' | 'success' | 'error';

export interface JobProgressProps {
  label?: string;
  value?: number;
  total?: number;
  detail?: string;
  state?: JobState;
  className?: string;
}

const trackColor: Record<JobState, string> = {
  idle: 'bg-[var(--g-border)]',
  running: 'bg-[var(--g-border)]',
  success: 'bg-[var(--g-border)]',
  error: 'bg-[var(--g-border)]',
};

const barColor: Record<JobState, string> = {
  idle: 'bg-[var(--g-text-dim)]',
  running: 'bg-[var(--g-accent)]',
  success: 'bg-[var(--g-success)]',
  error: 'bg-[var(--g-danger)]',
};

export default function JobProgress({
  label,
  value,
  total,
  detail,
  state = 'idle',
  className,
}: JobProgressProps) {
  const isDeterminate = value != null && total != null && total > 0;
  const percent = isDeterminate
    ? Math.min(100, Math.round((value / total) * 100))
    : 0;

  return (
    <div className={cn('w-full space-y-2', className)} data-testid="job-progress">
      {/* Label row */}
      {(label || isDeterminate) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-xs font-mono text-[var(--g-text-dim)]">
              {label}
            </span>
          )}
          {isDeterminate && (
            <span
              className="text-sm font-mono font-bold text-[var(--g-text)]"
              data-testid="job-progress-percent"
            >
              {percent}%
            </span>
          )}
        </div>
      )}

      {/* Track */}
      <div
        className={cn(
          'h-2 w-full overflow-hidden rounded-full',
          trackColor[state],
        )}
      >
        {isDeterminate ? (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 ease-out',
              barColor[state],
            )}
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        ) : state === 'running' ? (
          <div
            className={cn(
              'h-full w-1/3 rounded-full animate-[indeterminate_1.2s_ease-in-out_infinite]',
              barColor[state],
            )}
            role="progressbar"
            data-testid="job-progress-indeterminate"
          />
        ) : null}
      </div>

      {/* Counter + Detail */}
      {(isDeterminate || detail) && (
        <div className="flex items-center justify-between">
          {isDeterminate && (
            <span className="text-xs font-mono text-[var(--g-text-dim)]">
              {value} / {total}
            </span>
          )}
          {detail && (
            <span className="text-[11px] font-mono text-[var(--g-text-dim)]/70 text-right">
              {detail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
