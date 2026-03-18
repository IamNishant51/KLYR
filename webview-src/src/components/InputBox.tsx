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
      className="klyr-glass border-t"
      style={{
        borderColor: 'var(--k-border)',
      }}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-4">
        <div
          className="rounded-xl"
          style={{
            background: 'color-mix(in srgb, var(--k-input-bg) 60%, transparent)',
            border: '1px solid var(--k-input-border)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Klyr to edit, explain, or build..."
            rows={1}
            className="w-full resize-none bg-transparent px-4 pb-2 pt-3 text-sm outline-none"
            style={{ 
              color: 'var(--k-input-fg)',
              minHeight: '48px',
              borderRadius: '12px 12px 0 0',
            }}
          />

          <div className="flex items-center justify-end gap-2 px-3 pb-3">
            <select
              value={selectedModel}
              onChange={(event) => onModelChange(event.target.value)}
              className="max-w-[58%] truncate rounded-lg border bg-transparent px-2 py-1 text-xs outline-none"
              style={{
                borderColor: 'var(--k-input-border)',
                background: 'color-mix(in srgb, var(--k-surface) 70%, transparent)',
                color: 'var(--k-muted)',
              }}
            >
              {(availableModels.length > 0 ? availableModels : [selectedModel]).map((model) => (
                <option key={model} value={model} style={{ background: 'var(--k-surface-2)', color: 'var(--k-fg)' }}>
                  {model}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={busy ? onStopMessage : onSendMessage}
              disabled={!busy && !inputValue.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={
                busy
                  ? {
                      background: 'linear-gradient(135deg, #f85149, #da3633)',
                      boxShadow: '0 4px 15px rgba(248, 81, 73, 0.4)',
                    }
                  : {
                      background: 'linear-gradient(135deg, var(--k-accent), color-mix(in srgb, var(--k-accent) 70%, var(--k-surface)))',
                      boxShadow: '0 4px 15px color-mix(in srgb, var(--k-accent) 40%, transparent)',
                    }
              }
            >
              {busy ? <StopIcon /> : <SendIcon />}
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--k-muted)' }}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChatModeChange('agent')}
              className="rounded-md px-2.5 py-1 transition-all"
              style={{
                background: chatMode === 'agent' 
                  ? 'color-mix(in srgb, var(--k-accent) 25%, transparent)' 
                  : 'transparent',
                color: chatMode === 'agent' ? 'var(--k-accent)' : 'var(--k-muted)',
                fontWeight: chatMode === 'agent' ? 600 : 400,
              }}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => onChatModeChange('plan')}
              className="rounded-md px-2.5 py-1 transition-all"
              style={{
                background: chatMode === 'plan' 
                  ? 'color-mix(in srgb, var(--k-accent) 25%, transparent)' 
                  : 'transparent',
                color: chatMode === 'plan' ? 'var(--k-accent)' : 'var(--k-muted)',
                fontWeight: chatMode === 'plan' ? 600 : 400,
              }}
            >
              Plan
            </button>
          </div>
          <span>
            {busy ? `${phaseLabel(phase)}...` : 'Enter to send | Shift+Enter for newline'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export default memo(InputBox);
