import React, { memo, useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [inputValue]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (busy && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onStopMessage();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSendMessage();
    }
  }, [busy, onStopMessage, onSendMessage]);

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    event.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result.startsWith('data:image/')) return;
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

  const canSend = !busy && (inputValue.trim().length > 0 || attachments.length > 0);

  return (
    <div className="relative">
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="relative overflow-hidden rounded-lg border" style={{ borderColor: 'var(--nami-border)' }}>
                <img src={attachment.dataUrl} alt={attachment.name || 'Attachment'} className="h-16 w-16 object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveImage(attachment.id)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs"
                  style={{ background: 'var(--nami-danger)', color: '#fff' }}
                >×</button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="relative overflow-hidden rounded-2xl border-2 transition-all duration-200"
        style={{
          background: 'var(--nami-surface)',
          borderColor: isFocused ? 'var(--nami-primary)' : 'var(--nami-border)',
          boxShadow: isFocused ? '0 0 0 4px rgba(232, 121, 249, 0.1)' : 'none',
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Ask Nami to help with your code..."
          rows={1}
          className="w-full resize-none bg-transparent px-5 pt-5 pb-3 text-base outline-none"
          style={{ color: 'var(--nami-fg)', minHeight: '56px' }}
        />

        <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: 'var(--nami-border)' }}>
          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              for (const file of files) {
                if (file.type.startsWith('image/')) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = typeof reader.result === 'string' ? reader.result : '';
                    onAddImage({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, dataUrl: result, mimeType: file.type, name: file.name });
                  };
                  reader.readAsDataURL(file);
                }
              }
              e.target.value = '';
            }} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors" style={{ color: 'var(--nami-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--nami-primary)'; e.currentTarget.style.background = 'var(--nami-surface-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--nami-muted)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <AttachIcon />
            </button>

            {/* Model Selector - Always visible */}
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
              style={{ borderColor: 'var(--nami-border)', background: 'var(--nami-surface-2)', color: 'var(--nami-fg)' }}
            >
              {(availableModels.length > 0 ? availableModels : [selectedModel]).map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>

            {/* Mode Toggle */}
            <div className="flex items-center rounded-lg border p-1" style={{ borderColor: 'var(--nami-border)', background: 'var(--nami-surface-2)' }}>
              <button
                type="button"
                onClick={() => onChatModeChange('agent')}
                className="rounded-md px-3 py-1 text-sm font-medium transition-all"
                style={{ background: chatMode === 'agent' ? 'var(--nami-primary)' : 'transparent', color: chatMode === 'agent' ? '#fff' : 'var(--nami-muted)' }}
              >Agent</button>
              <button
                type="button"
                onClick={() => onChatModeChange('plan')}
                className="rounded-md px-3 py-1 text-sm font-medium transition-all"
                style={{ background: chatMode === 'plan' ? 'var(--nami-primary)' : 'transparent', color: chatMode === 'plan' ? '#fff' : 'var(--nami-muted)' }}
              >Plan</button>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={busy ? onStopMessage : onSendMessage}
            disabled={!canSend && !busy}
            className="flex h-10 w-10 items-center justify-center rounded-xl transition-all"
            style={{
              background: busy ? 'linear-gradient(135deg, var(--nami-danger), #dc2626)' : 'var(--nami-gradient)',
              opacity: canSend || busy ? 1 : 0.4,
              boxShadow: (canSend || busy) ? '0 4px 12px rgba(232, 121, 249, 0.4)' : 'none',
            }}
          >
            {busy ? <StopIcon /> : <SendIcon />}
          </motion.button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between px-2 text-xs" style={{ color: 'var(--nami-muted)' }}>
        <span>{busy ? 'Nami is thinking...' : 'Enter to send • Shift+Enter for new line'}</span>
        {chatMode === 'agent' && <span className="flex items-center gap-1"><ToolIcon />Tools enabled</span>}
      </div>
    </div>
  );
}

function SendIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function StopIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>; }
function AttachIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ToolIcon() { return <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

export default memo(InputBox);
