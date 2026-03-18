import React, { memo } from 'react';
import type { PanelLayoutMode } from '../App';
import type { ExtensionStatus, ThinkingTraceEntry } from '../types';

interface ThinkingTraceProps {
  currentDetail: string;
  entries: ThinkingTraceEntry[];
  expanded: boolean;
  layoutMode: PanelLayoutMode;
  onToggle: () => void;
}

function ThinkingTrace({
  currentDetail,
  entries,
  expanded,
  layoutMode,
  onToggle,
}: ThinkingTraceProps) {
  const compact = layoutMode !== 'regular';
  const narrow = layoutMode === 'narrow';
  const visibleEntries = entries.slice(-6);

  return (
    <article className="klyr-fade-up w-full px-1">
      <div className="w-full">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`w-full text-left transition duration-150 ${narrow ? 'py-1.5' : 'py-2'} hover:opacity-95`}
          style={{ color: 'var(--k-fg)' }}
        >
          <div className="flex items-start gap-2.5">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full animate-klyr-pulse"
              style={{ background: 'var(--k-accent)' }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${compact ? 'text-[13px]' : 'text-sm'}`}>Thinking</span>
                <ThinkingDots />
                <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--k-accent)' }}>
                  {labelForStatus(visibleEntries[visibleEntries.length - 1]?.status)}
                </span>
              </div>

              <div
                className={`mt-1 ${compact ? 'text-[12px] leading-6' : 'text-[13px] leading-6'} ${expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
                style={{ color: 'var(--k-muted)' }}
              >
                {currentDetail || 'Working through the request with workspace context.'}
              </div>
            </div>

            <Chevron expanded={expanded} />
          </div>
        </button>

        {expanded ? (
          <div className={`${narrow ? 'ml-3.5 pl-2.5' : 'ml-4 pl-3'} space-y-2 border-l`} style={{ borderColor: 'color-mix(in srgb, var(--k-accent) 26%, transparent)' }}>
            {visibleEntries.length > 0 ? (
              visibleEntries.map((entry) => (
                <div key={entry.id} className={narrow ? 'py-1' : 'py-1.5'}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--k-accent)' }}>
                      {labelForStatus(entry.status)}
                    </span>
                    <span className="h-1 w-1 rounded-full" style={{ background: 'var(--k-muted)' }} />
                    <span className="text-[10px]" style={{ color: 'var(--k-muted)' }}>
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] leading-6" style={{ color: 'var(--k-fg)' }}>
                    {entry.detail}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-1 text-[12px] leading-6" style={{ color: 'var(--k-muted)' }}>
                Waiting for the next execution update.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full animate-klyr-pulse" style={{ background: 'var(--k-accent)' }} />
      <span className="h-1.5 w-1.5 rounded-full animate-klyr-pulse [animation-delay:140ms]" style={{ background: 'color-mix(in srgb, var(--k-accent) 74%, transparent)' }} />
      <span className="h-1.5 w-1.5 rounded-full animate-klyr-pulse [animation-delay:280ms]" style={{ background: 'color-mix(in srgb, var(--k-accent) 44%, transparent)' }} />
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      style={{ color: 'var(--k-muted)' }}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function labelForStatus(status: ExtensionStatus | undefined): string {
  switch (status) {
    case 'planning':
      return 'Planning';
    case 'retrieving':
      return 'Retrieving';
    case 'thinking':
      return 'Generating';
    case 'validating':
      return 'Validating';
    case 'executing':
      return 'Executing';
    case 'review':
      return 'Review';
    case 'idle':
    default:
      return 'Active';
  }
}

function formatRelativeTime(createdAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - createdAt) / 1000));
  if (seconds < 2) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export default memo(ThinkingTrace);
