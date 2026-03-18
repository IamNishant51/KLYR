import React, { memo } from 'react';
import type { DiffChange } from '../types';

interface DiffViewerProps {
  changes: DiffChange[];
  onApply: () => void;
  onReject: () => void;
  compact?: boolean;
}

function DiffViewer({ changes, onApply, onReject, compact = false }: DiffViewerProps) {
  if (changes.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
        No diff is waiting right now. Draft edits will appear here with additions, deletions, and quick review controls.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {changes.map((change) => {
        const stats = getDiffStats(change.diff);
        return (
          <section
            key={`${change.path}-${change.summary}`}
            className="overflow-hidden rounded-[24px] border border-white/8 bg-[#10161d] shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/6 bg-white/[0.03] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-[12px] text-slate-200">{change.path}</div>
                <div className="mt-1 text-xs leading-6 text-slate-500">{change.summary}</div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {change.operation}
                </span>
                <span className="rounded-full bg-emerald-400/[0.12] px-2 py-1 text-[10px] font-medium text-emerald-300">
                  +{stats.additions}
                </span>
                <span className="rounded-full bg-rose-400/[0.12] px-2 py-1 text-[10px] font-medium text-rose-300">
                  -{stats.deletions}
                </span>
              </div>
            </header>

            <div className="klyr-scrollbar max-h-[18rem] overflow-auto bg-[#0b1016]/85 py-2">
              {change.diff.split(/\r?\n/).map((line, index) => {
                const lineKind = getDiffLineKind(line);
                return (
                  <div
                    key={`${change.path}-line-${index}`}
                    className={`grid grid-cols-[auto_1fr] items-start gap-3 px-4 py-1 font-mono text-[12px] leading-6 ${diffLineClass(lineKind)}`}
                  >
                    <span className="select-none opacity-70">
                      {lineKind === 'meta' ? '@' : line[0] || ' '}
                    </span>
                    <span className="whitespace-pre-wrap break-words">
                      {lineKind === 'meta' ? line : line.slice(1) || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className={`flex gap-2 ${compact ? 'flex-col' : 'flex-row'}`}>
        <button type="button" className="klyr-action-button flex-1 rounded-full px-4 py-3 text-sm font-medium text-white" onClick={onApply}>
          Accept Draft
        </button>
        <button
          type="button"
          className="klyr-secondary-button flex-1 rounded-full px-4 py-3 text-sm font-medium text-slate-200"
          onClick={onReject}
        >
          Reject Draft
        </button>
      </div>
    </div>
  );
}

function getDiffStats(diff: string) {
  const lines = diff.split(/\r?\n/);
  return {
    additions: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
    deletions: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
  };
}

function getDiffLineKind(line: string): 'add' | 'remove' | 'meta' | 'context' {
  if (line.startsWith('@@')) {
    return 'meta';
  }
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'add';
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'remove';
  }
  return 'context';
}

function diffLineClass(kind: ReturnType<typeof getDiffLineKind>): string {
  switch (kind) {
    case 'add':
      return 'bg-emerald-400/[0.07] text-emerald-100';
    case 'remove':
      return 'bg-rose-400/[0.07] text-rose-100';
    case 'meta':
      return 'bg-amber-400/[0.06] text-amber-200';
    case 'context':
    default:
      return 'text-slate-400';
  }
}

export default memo(DiffViewer);
