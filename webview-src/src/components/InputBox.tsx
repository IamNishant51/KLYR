import React, { memo, useEffect, useRef } from 'react';
import { phaseLabel } from '../lib/chat';
import type { UiPhase } from '../types';

interface InputBoxProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  onSendMessage: () => void;
  onStopMessage: () => void;
  busy: boolean;
  phase: UiPhase;
  statusDetail: string;
  compact: boolean;
}

function InputBox({
  inputValue,
  onInputChange,
  selectedModel,
  availableModels,
  onModelChange,
  onSendMessage,
  onStopMessage,
  busy,
  phase,
  statusDetail,
  compact,
}: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      className="border-t px-3 pb-4 pt-3 backdrop-blur-xl sm:px-4"
      style={{
        borderColor: 'var(--k-border)',
        background: 'color-mix(in srgb, var(--k-surface) 72%, transparent)',
      }}
    >
      <div
        className="group rounded-[30px] border px-3 py-3 transition duration-200 focus-within:scale-[1.01]"
        style={{
          borderColor: 'var(--k-input-border)',
          background: 'color-mix(in srgb, var(--k-input-bg) 66%, transparent)',
          boxShadow: '0 16px 44px color-mix(in srgb, var(--k-bg) 56%, transparent)',
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--k-muted)' }}>
            Model
          </span>
          <select
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value)}
            className="max-w-[75%] rounded-full border px-3 py-1.5 text-xs outline-none"
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

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Klyr to edit, explain, or build..."
              rows={1}
              className="klyr-scrollbar min-h-[28px] w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm leading-7 outline-none"
              style={{ color: 'var(--k-input-fg)' }}
            />
          </div>

          <button
            type="button"
            onClick={busy ? onStopMessage : onSendMessage}
            disabled={!busy && !inputValue.trim()}
            className="klyr-action-button h-12 min-w-[3.25rem] rounded-full px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-40"
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
              {!compact ? <span>{busy ? 'Stop' : 'Send'}</span> : null}
            </span>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500">
          <span className="truncate" style={{ color: 'var(--k-muted)' }}>
            {busy ? statusDetail || `${phaseLabel(phase)} with workspace context.` : 'Inline ghost text is available in-editor. Use Tab there to accept.'}
          </span>
          <span className="shrink-0" style={{ color: 'var(--k-muted)' }}>
            {compact ? 'Enter to send' : 'Enter to send | Shift+Enter for newline'}
          </span>
        </div>
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
