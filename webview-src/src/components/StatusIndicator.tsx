import React, { memo } from 'react';
import type { UiPhase } from '../types';

interface StatusIndicatorProps {
  phase: UiPhase;
  detail: string;
  compact?: boolean;
}

const STATUS_META: Record<UiPhase, { dotColor: string; helper: string; label: string }> = {
  idle: {
    dotColor: 'var(--k-muted)',
    helper: 'Standing by for the next edit or question.',
    label: 'Idle',
  },
  thinking: {
    dotColor: 'var(--vscode-editorWarning-foreground, #cca700)',
    helper: 'Scanning context and shaping the response.',
    label: 'Thinking',
  },
  generating: {
    dotColor: 'var(--k-accent)',
    helper: 'Streaming an answer with workspace awareness.',
    label: 'Generating',
  },
  validating: {
    dotColor: 'var(--vscode-editorWarning-foreground, #cca700)',
    helper: 'Double-checking edits and structure.',
    label: 'Validating',
  },
  ready: {
    dotColor: 'var(--vscode-testing-iconPassed, #73c991)',
    helper: 'Draft is ready to review.',
    label: 'Ready',
  },
  executing: {
    dotColor: 'var(--vscode-charts-green, #89d185)',
    helper: 'Applying validated changes to the workspace.',
    label: 'Executing',
  },
  error: {
    dotColor: 'var(--vscode-errorForeground, #f14c4c)',
    helper: 'Something needs attention before continuing.',
    label: 'Error',
  },
};

function StatusIndicator({ phase, detail, compact = false }: StatusIndicatorProps) {
  const meta = STATUS_META[phase];

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${phase !== 'idle' && phase !== 'ready' ? 'animate-klyr-pulse' : ''}`}
        style={{
          background: meta.dotColor,
          boxShadow: '0 0 0 5px color-mix(in srgb, var(--k-border) 35%, transparent)',
        }}
      />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--k-fg)' }}>
          {meta.label}
        </div>
        {!compact ? (
          <div className="truncate text-xs" style={{ color: 'var(--k-muted)' }}>
            {detail || meta.helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(StatusIndicator);
