import React, { memo, useState } from 'react';

interface CodeBlockProps {
  language: string;
  code: string;
  onApply?: () => void;
  onViewDiff?: () => void;
}

function CodeBlock({ language, code, onApply, onViewDiff }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="group overflow-hidden rounded-[22px] border transition duration-200"
      style={{
        borderColor: 'var(--k-input-border)',
        background: 'color-mix(in srgb, var(--k-surface) 88%, transparent)',
        boxShadow: '0 16px 36px color-mix(in srgb, var(--k-bg) 55%, transparent)',
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{
          borderColor: 'var(--k-input-border)',
          background: 'color-mix(in srgb, var(--k-input-bg) 56%, transparent)',
        }}
      >
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: 'var(--k-accent)' }}>
            {language || 'text'}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--k-muted)' }}>
            {code.split(/\r?\n/).length} lines
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onViewDiff ? (
            <button type="button" className="klyr-inline-button" onClick={onViewDiff}>
              Diff
            </button>
          ) : null}
          {onApply ? (
            <button type="button" className="klyr-inline-button" onClick={onApply}>
              Apply
            </button>
          ) : null}
          <button type="button" className="klyr-inline-button" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <pre className="klyr-scrollbar overflow-x-auto px-4 py-4 font-mono text-[12px] leading-6" style={{ color: 'var(--k-input-fg)' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default memo(CodeBlock);
