import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-6' : 'gap-3 py-12',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl border border-[var(--g-border)] bg-[var(--g-surface)]',
          compact ? 'h-10 w-10' : 'h-14 w-14',
        )}
      >
        {icon || (
          <Inbox
            size={compact ? 18 : 24}
            className="text-[var(--g-text-dim)]"
          />
        )}
      </div>

      <h3
        className={cn(
          'font-mono font-medium text-[var(--g-text)]',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            'max-w-xs text-[var(--g-text-dim)]',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
