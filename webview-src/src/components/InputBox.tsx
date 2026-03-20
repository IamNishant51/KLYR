import React, { memo, useEffect, useRef } from 'react';
import { phaseLabel } from '../lib/chat';
import type { ChatImageAttachment, UiPhase } from '../types';
import type { PanelLayoutMode } from '../App';

interface InputBoxProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  attachments: ChatImageAttachment[];
  onAddImage: (attachment: ChatImageAttachment) => void;
  onRemoveImage: (id: string) => void;
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
  attachments,
  onAddImage,
  onRemoveImage,
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
  const isNarrow = layoutMode === 'narrow';

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

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) {
      return;
    }

    event.preventDefault();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) {
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result.startsWith('data:image/')) {
          return;
        }

        onAddImage({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          dataUrl: result,
          mimeType: file.type || 'image/png',
          name: file.name,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className="border-t"
      style={{
        borderColor: 'var(--k-border)',
        background: 'color-mix(in srgb, var(--k-surface) 90%, transparent)',
        padding: isNarrow ? '8px 12px' : '12px 16px',
      }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div
          className="rounded-xl"
          style={{
            background: 'color-mix(in srgb, var(--k-input-bg) 42%, transparent)',
            border: '1px solid var(--k-input-border)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything..."
            rows={1}
            className="w-full resize-none bg-transparent px-4 pb-2 pt-3 text-sm outline-none"
            style={{ 
              color: 'var(--k-input-fg)',
              minHeight: '48px',
              borderRadius: '12px 12px 0 0',
            }}
          />

          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="relative overflow-hidden rounded-md border"
                  style={{ borderColor: 'var(--k-input-border)' }}
                >
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.name || 'Pasted attachment'}
                    className="h-16 w-24 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(attachment.id)}
                    className="absolute right-1 top-1 rounded px-1 py-0 text-[10px]"
                    style={{
                      background: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                    }}
                    aria-label="Remove attachment"
                    title="Remove"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <select
                value={selectedModel}
                onChange={(event) => onModelChange(event.target.value)}
                className="max-w-[90px] sm:max-w-[130px] truncate rounded-md border bg-transparent px-2 py-1 text-xs outline-none flex-shrink-0"
                style={{
                  borderColor: 'var(--k-input-border)',
                  background: 'color-mix(in srgb, var(--k-surface) 82%, transparent)',
                  color: 'var(--k-muted)',
                }}
              >
                {(availableModels.length > 0 ? availableModels : [selectedModel]).map((model) => (
                  <option key={model} value={model} style={{ background: 'var(--k-surface-2)', color: 'var(--k-fg)' }}>
                    {model}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChatModeChange('agent')}
                  className="rounded-md border px-2 py-1 text-xs transition-all"
                  style={{
                    background: chatMode === 'agent' 
                      ? 'color-mix(in srgb, var(--k-selection) 40%, transparent)' 
                      : 'color-mix(in srgb, var(--k-input-bg) 34%, transparent)',
                    borderColor: chatMode === 'agent' ? 'color-mix(in srgb, var(--k-accent) 55%, var(--k-border))' : 'var(--k-input-border)',
                    color: chatMode === 'agent' ? 'var(--k-accent)' : 'var(--k-muted)',
                    fontWeight: chatMode === 'agent' ? 600 : 400,
                  }}
                >
                  Agent
                </button>
                <button
                  type="button"
                  onClick={() => onChatModeChange('plan')}
                  className="rounded-md border px-2 py-1 text-xs transition-all"
                  style={{
                    background: chatMode === 'plan' 
                      ? 'color-mix(in srgb, var(--k-selection) 40%, transparent)' 
                      : 'color-mix(in srgb, var(--k-input-bg) 34%, transparent)',
                    borderColor: chatMode === 'plan' ? 'color-mix(in srgb, var(--k-accent) 55%, var(--k-border))' : 'var(--k-input-border)',
                    color: chatMode === 'plan' ? 'var(--k-accent)' : 'var(--k-muted)',
                    fontWeight: chatMode === 'plan' ? 600 : 400,
                  }}
                >
                  Plan
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={busy ? onStopMessage : onSendMessage}
              disabled={!busy && !inputValue.trim() && attachments.length === 0}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={
                busy
                  ? {
                      background: 'linear-gradient(135deg, #ffffff, #f3f3f3)',
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                      color: '#1e1e1e',
                      boxShadow: 'none',
                    }
                  : {
                      background: 'linear-gradient(135deg, var(--k-button-bg), color-mix(in srgb, var(--k-button-bg) 72%, var(--k-surface)))',
                      borderColor: 'color-mix(in srgb, var(--k-button-bg) 62%, var(--k-border))',
                      color: 'white',
                      boxShadow: 'none',
                    }
              }
            >
              {busy ? <StopIcon /> : <SendIcon />}
            </button>
          </div>
        </div>

        <div className="mt-2 px-1 text-left text-xs" style={{ color: 'var(--k-muted)' }}>
          <span className="hidden sm:inline">
            {busy ? `${phaseLabel(phase)}...` : 'Enter to send, Shift+Enter for new line'}
          </span>
          <span className="sm:hidden">
            {busy ? `${phaseLabel(phase)}...` : 'Enter to send'}
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
