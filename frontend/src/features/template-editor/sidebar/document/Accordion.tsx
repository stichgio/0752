import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface AccordionProps {
  icon: React.ReactNode;
  title: string;
  badge?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function Accordion({ icon, title, badge, isOpen, onToggle, children }: AccordionProps) {
  return (
    <div className="border-b border-neutral-100 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-neutral-50/60 transition-colors"
      >
        <span className="shrink-0 text-neutral-400">{icon}</span>
        <span className="flex-1 text-[11px] font-semibold text-neutral-600">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-neutral-200 px-1.5 py-px text-[10px] font-semibold text-neutral-500">
            {badge}
          </span>
        )}
        {isOpen
          ? <ChevronDown size={12} className="shrink-0 text-neutral-400" />
          : <ChevronRight size={12} className="shrink-0 text-neutral-400" />
        }
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
