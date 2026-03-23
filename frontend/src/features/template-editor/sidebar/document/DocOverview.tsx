import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { CanvasDocument, TemplateValidationIssue } from '../../canvasTypes';

interface DocOverviewProps {
  document: CanvasDocument;
  activePageId: string;
  pageElementsCount: number;
  fieldCount: number;
  variableCount: number;
  validationIssues: TemplateValidationIssue[];
}

export function DocOverview({
  document,
  activePageId,
  pageElementsCount,
  fieldCount,
  variableCount,
  validationIssues,
}: DocOverviewProps) {
  const [issuesOpen, setIssuesOpen] = useState(false);

  const activePage = (document.pages || []).find((p) => p.id === activePageId);
  const activeVariant = (document.variants || []).find((v) => v.id === document.activeVariantId);
  const activeBrandKit = (document.brandKits || []).find((b) => b.id === document.brandKitId);
  const pageCount = (document.pages || []).length;

  const errorCount = validationIssues.filter((i) => i.level === 'error').length;
  const warningCount = validationIssues.filter((i) => i.level === 'warning').length;
  const health: 'ok' | 'warning' | 'error' =
    errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok';

  return (
    <div
      className="sticky top-0 z-10 border-b border-neutral-100 bg-white px-3 py-2.5 space-y-2"
      data-testid="doc-overview"
    >
      {/* Name + health */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText size={12} className="shrink-0 text-neutral-400" />
          <span
            className="truncate text-[12px] font-semibold text-neutral-700"
            title={document.name}
          >
            {document.name || 'Sin nombre'}
          </span>
        </div>
        <HealthBadge
          health={health}
          errorCount={errorCount}
          warningCount={warningCount}
          onClick={() => validationIssues.length > 0 && setIssuesOpen((v) => !v)}
          isOpen={issuesOpen}
        />
      </div>

      {/* Issues list */}
      {issuesOpen && validationIssues.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2 space-y-1 max-h-40 overflow-y-auto">
          {validationIssues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px]">
              {issue.level === 'error'
                ? <AlertCircle size={10} className="mt-0.5 shrink-0 text-red-500" />
                : <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-500" />
              }
              <span className="text-neutral-600">{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Counters */}
      <div className="flex flex-wrap gap-1.5">
        <StatChip label="páginas" value={pageCount} />
        <StatChip label="elementos" value={pageElementsCount} />
        <StatChip label="campos" value={fieldCount} />
        <StatChip label="variables" value={variableCount} />
      </div>

      {/* Active badges */}
      {(activePage || activeVariant || activeBrandKit) && (
        <div className="flex flex-wrap gap-1">
          {activePage && (
            <ActiveBadge label="Pág." value={activePage.name} color="violet" />
          )}
          {activeVariant && (
            <ActiveBadge label="Var." value={activeVariant.name} color="blue" />
          )}
          {activeBrandKit && (
            <ActiveBadge label="Kit" value={activeBrandKit.name} color="emerald" />
          )}
        </div>
      )}
    </div>
  );
}

function HealthBadge({
  health,
  errorCount,
  warningCount,
  onClick,
  isOpen,
}: {
  health: 'ok' | 'warning' | 'error';
  errorCount: number;
  warningCount: number;
  onClick: () => void;
  isOpen: boolean;
}) {
  if (health === 'ok') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
        <CheckCircle2 size={10} /> OK
      </span>
    );
  }

  const count = health === 'error' ? errorCount : warningCount;
  const colorClass =
    health === 'error'
      ? 'bg-red-50 text-red-600 hover:bg-red-100'
      : 'bg-amber-50 text-amber-600 hover:bg-amber-100';
  const Icon = health === 'error' ? AlertCircle : AlertTriangle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${colorClass}`}
      data-testid="health-badge"
    >
      <Icon size={10} />
      {count}
      {isOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
    </button>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5">
      <span className="text-[10px] font-bold text-neutral-600">{value}</span>
      <span className="text-[10px] text-neutral-400">{label}</span>
    </div>
  );
}

function ActiveBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'violet' | 'blue' | 'emerald';
}) {
  const colorMap = {
    violet: 'bg-violet-50 text-violet-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${colorMap[color]}`}>
      {label} {value}
    </span>
  );
}
