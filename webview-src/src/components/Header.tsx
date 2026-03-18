import React, { memo } from 'react';
import StatusIndicator from './StatusIndicator';
import type { UiPhase } from '../types';

interface HeaderProps {
  phase: UiPhase;
  statusDetail: string;
  selectedModel: string;
  onModelChange: (model: string) => void;
  availableModels: string[];
  onOpenSettings: () => void;
  onClearChat: () => void;
  hasMessages: boolean;
  compact: boolean;
}

function Header({
  phase,
  statusDetail,
  selectedModel,
  onModelChange,
  availableModels,
  onOpenSettings,
  onClearChat,
  hasMessages,
  compact,
}: HeaderProps) {
  return (
    <header
      className="border-b backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--k-surface) 82%, transparent)',
        borderColor: 'var(--k-border)',
      }}
    >
      <div className="px-4 py-3">
        <div className={`flex ${compact ? 'flex-col gap-3' : 'items-center justify-between gap-4'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="klyr-welcome-shimmer flex h-10 w-10 items-center justify-center rounded-[18px] border text-sm font-semibold tracking-[0.28em]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--k-accent) 38%, transparent)',
                  background: 'color-mix(in srgb, var(--k-selection) 62%, transparent)',
                  color: 'color-mix(in srgb, var(--k-fg) 92%, var(--k-accent) 8%)',
                }}
              >
                K
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.32em]" style={{ color: 'var(--k-muted)' }}>
                  AI Workspace
                </div>
                <h1 className="text-sm font-semibold tracking-tight sm:text-base" style={{ color: 'var(--k-fg)' }}>
                  Klyr
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <IconButton label="Open Klyr settings" onClick={onOpenSettings}>
                <SettingsIcon />
              </IconButton>
              <IconButton label="Clear chat" onClick={onClearChat} disabled={!hasMessages}>
                <ClearIcon />
              </IconButton>
            </div>
          </div>

          <div className={`flex ${compact ? 'flex-col gap-3' : 'items-center gap-4'}`}>
            <StatusIndicator phase={phase} detail={statusDetail} compact={compact} />

            <label
              className={`flex items-center gap-3 rounded-full border px-3 py-2 ${
                compact ? 'w-full justify-between' : 'min-w-[15rem]'
              }`}
              style={{
                borderColor: 'var(--k-input-border)',
                background: 'color-mix(in srgb, var(--k-input-bg) 62%, transparent)',
              }}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--k-muted)' }}>
                Model
              </span>
              <select
                value={selectedModel}
                onChange={(event) => onModelChange(event.target.value)}
                className="w-full min-w-0 bg-transparent text-sm outline-none"
                style={{ color: 'var(--k-input-fg)' }}
              >
                {(availableModels.length > 0 ? availableModels : [selectedModel]).map((model) => (
                  <option key={model} value={model} style={{ background: 'var(--k-surface-2)', color: 'var(--k-fg)' }}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </header>
  );
}

interface IconButtonProps {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

function IconButton({ children, disabled = false, label, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="klyr-icon-button disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path
        d="M10.12 3.92a1.7 1.7 0 0 1 3.76 0l.23.56a1.7 1.7 0 0 0 1.45 1.03l.6.05a1.7 1.7 0 0 1 1.88 1.88l-.05.6a1.7 1.7 0 0 0 1.03 1.45l.56.23a1.7 1.7 0 0 1 0 3.76l-.56.23a1.7 1.7 0 0 0-1.03 1.45l.05.6a1.7 1.7 0 0 1-1.88 1.88l-.6-.05a1.7 1.7 0 0 0-1.45 1.03l-.23.56a1.7 1.7 0 0 1-3.76 0l-.23-.56a1.7 1.7 0 0 0-1.45-1.03l-.6.05a1.7 1.7 0 0 1-1.88-1.88l.05-.6a1.7 1.7 0 0 0-1.03-1.45l-.56-.23a1.7 1.7 0 0 1 0-3.76l.56-.23a1.7 1.7 0 0 0 1.03-1.45l-.05-.6a1.7 1.7 0 0 1 1.88-1.88l.6.05a1.7 1.7 0 0 0 1.45-1.03l.23-.56Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 9.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5.5 7.5h13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9.2 10.3.4 7a1.2 1.2 0 0 0 1.2 1.1h2.4a1.2 1.2 0 0 0 1.2-1.1l.4-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.8 10.9v5.8M13.2 10.9v5.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default memo(Header);
