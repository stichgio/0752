import React from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  align?: 'left' | 'center';
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  align = 'left',
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between',
        align === 'center' && 'items-center text-center xl:flex-col',
      )}
    >
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--g-text-dim)]">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.55)]" />
          <h1 className="font-[DotGothic16] text-4xl tracking-tight text-white">
            {title}
          </h1>
        </div>
        {description && (
          <p className="max-w-2xl text-xs font-mono uppercase tracking-[0.22em] text-[var(--g-text-dim)]">
            {description}
          </p>
        )}
      </div>

      {(meta || actions) && (
        <div className="flex flex-wrap items-center gap-3">
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}
