import React, { memo, useEffect, useRef } from 'react';
import { phaseLabel } from '../lib/chat';
import type { UiPhase } from '../types';
import type { PanelLayoutMode } from '../App';

interface InputBoxProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  chatMode: 'agent' | 'plan';
  onChatModeChange: (mode: 'agent' | 'plan') => void;
  onSendMessage: () => void;
  onStopMessage: () => void;
  busy: boolean;
  phase: UiPhase;
  statusDetail: string;
  layoutMode: PanelLayoutMode;
}

function InputBox({
  inputValue,
  onInputChange,
  selectedModel,
  availableModels,
  onModelChange,
  chatMode,
  onChatModeChange,
  onSendMessage,
  onStopMessage,
  busy,
  phase,
  statusDetail,
  layoutMode,
}: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const compact = layoutMode !== 'regular';
  const narrow = layoutMode === 'narrow';
  const showActionLabel = layoutMode === 'regular';

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [inputValue]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (busy && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onStopMessage();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div
      className={`border-t backdrop-blur-xl ${narrow ? 'px-2 pb-2 pt-2' : 'px-3 pb-4 pt-3 sm:px-4'}`}
      style={{
        borderColor: 'var(--k-border)',
        background: 'color-mix(in srgb, var(--k-surface) 72%, transparent)',
      }}
    >
      <div
        className={`group border transition duration-200 focus-within:scale-[1.01] ${narrow ? 'rounded-[20px] px-2.5 py-2.5' : compact ? 'rounded-[24px] px-3 py-2.5' : 'rounded-[30px] px-3 py-3'}`}
        style={{
          borderColor: 'var(--k-input-border)',
          background: 'color-mix(in srgb, var(--k-input-bg) 66%, transparent)',
          boxShadow: '0 16px 44px color-mix(in srgb, var(--k-bg) 56%, transparent)',
        }}
      >
        <div className={`mb-2 px-1 ${narrow ? 'space-y-2' : 'flex items-center justify-between gap-2'}`}>
          <div className={`flex ${narrow ? 'w-full items-center gap-1.5' : 'items-center gap-2'}`}>
            <button
              type="button"
              onClick={() => onChatModeChange('agent')}
              className={`rounded-full border font-medium ${narrow ? 'flex-1 px-2.5 py-1 text-[11px]' : compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-[11px]'}`}
              style={{
                borderColor: chatMode === 'agent' ? 'var(--k-accent)' : 'var(--k-input-border)',
                background:
                  chatMode === 'agent'
                    ? 'color-mix(in srgb, var(--k-selection) 65%, transparent)'
                    : 'color-mix(in srgb, var(--k-input-bg) 62%, transparent)',
                color: chatMode === 'agent' ? 'var(--k-fg)' : 'var(--k-muted)',
              }}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => onChatModeChange('plan')}
              className={`rounded-full border font-medium ${narrow ? 'flex-1 px-2.5 py-1 text-[11px]' : compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-[11px]'}`}
              style={{
                borderColor: chatMode === 'plan' ? 'var(--k-accent)' : 'var(--k-input-border)',
                background:
                  chatMode === 'plan'
                    ? 'color-mix(in srgb, var(--k-selection) 65%, transparent)'
                    : 'color-mix(in srgb, var(--k-input-bg) 62%, transparent)',
                color: chatMode === 'plan' ? 'var(--k-fg)' : 'var(--k-muted)',
              }}
            >
              Plan
            </button>
          </div>

          <div className={`flex min-w-0 ${narrow ? 'w-full items-center gap-2' : 'items-center gap-2'}`}>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--k-muted)' }}>
              Model
            </span>
            <select
              value={selectedModel}
              onChange={(event) => onModelChange(event.target.value)}
              className={`min-w-0 rounded-full border text-xs outline-none ${narrow ? 'flex-1 px-3 py-1.5' : compact ? 'max-w-[12rem] px-2.5 py-1.5' : 'max-w-[75%] px-3 py-1.5'}`}
              style={{
                borderColor: 'var(--k-input-border)',
                background: 'color-mix(in srgb, var(--k-input-bg) 74%, transparent)',
                color: 'var(--k-input-fg)',
              }}
            >
              {(availableModels.length > 0 ? availableModels : [selectedModel]).map((model) => (
                <option key={model} value={model} style={{ background: 'var(--k-surface-2)', color: 'var(--k-fg)' }}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Klyr to edit, explain, or build..."
              rows={1}
              className={`klyr-scrollbar w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm outline-none ${narrow ? 'min-h-[44px] leading-6' : compact ? 'min-h-[34px] leading-6' : 'min-h-[28px] leading-7'}`}
              style={{ color: 'var(--k-input-fg)' }}
            />
          </div>

          <button
            type="button"
            onClick={busy ? onStopMessage : onSendMessage}
            disabled={!busy && !inputValue.trim()}
            className={`klyr-action-button shrink-0 rounded-full text-sm font-medium text-white disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-40 ${narrow ? 'h-10 min-w-[2.75rem] px-3' : compact ? 'h-10 min-w-[2.75rem] px-3' : 'h-12 min-w-[3.25rem] px-4'}`}
            style={
              busy
                ? {
                    background: 'var(--vscode-testing-iconFailed, #f14c4c)',
                    color: '#fff',
                    boxShadow: '0 10px 26px color-mix(in srgb, var(--vscode-testing-iconFailed, #f14c4c) 40%, transparent)',
                  }
                : undefined
            }
          >
            <span className="flex items-center justify-center gap-2">
              {busy ? <StopIcon /> : <SendIcon />}
              {showActionLabel ? <span>{busy ? 'Stop' : 'Send'}</span> : null}
            </span>
          </button>
        </div>

        {narrow ? (
          <div className="mt-2 px-1 text-[11px]" style={{ color: 'var(--k-muted)' }}>
            Enter sends. Shift+Enter adds a new line.
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500">
            <span className="truncate" style={{ color: 'var(--k-muted)' }}>
              {busy ? statusDetail || `${phaseLabel(phase)} with workspace context.` : ''}
            </span>
            <span className="shrink-0" style={{ color: 'var(--k-muted)' }}>
              {compact ? 'Enter to send' : 'Enter to send | Shift+Enter for newline'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12h12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m12 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="7" y="7" width="10" height="10" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default memo(InputBox);
