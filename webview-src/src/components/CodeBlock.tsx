import React, { memo, useState } from 'react';

interface CodeBlockProps {
  language: string;
  code: string;
  onApply?: () => void;
  onViewDiff?: () => void;
  compact?: boolean;
}

function CodeBlock({ language, code, onApply, onViewDiff, compact = false }: CodeBlockProps) {
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
      className={`group overflow-hidden border transition duration-200 ${compact ? 'rounded-[18px]' : 'rounded-[22px]'}`}
      style={{
        borderColor: 'var(--k-input-border)',
        background: 'color-mix(in srgb, var(--k-surface) 88%, transparent)',
        boxShadow: '0 16px 36px color-mix(in srgb, var(--k-bg) 55%, transparent)',
      }}
    >
      <div
        className={`border-b ${compact ? 'space-y-2 px-3 py-2.5' : 'flex items-center justify-between gap-3 px-4 py-3'}`}
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

        <div className={`flex ${compact ? 'flex-wrap gap-1.5' : 'items-center gap-2'}`}>
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

      <pre className={`klyr-scrollbar overflow-x-auto font-mono ${compact ? 'px-3 py-3 text-[11px] leading-5' : 'px-4 py-4 text-[12px] leading-6'}`} style={{ color: 'var(--k-input-fg)' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default memo(CodeBlock);
