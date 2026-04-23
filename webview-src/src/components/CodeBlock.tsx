import React, { memo, useState, useMemo } from 'react';

interface CodeBlockProps {
  language: string;
  code: string;
  onApply?: () => void;
  onViewDiff?: () => void;
  compact?: boolean;
}

function CodeBlock({ language, code, onApply, onViewDiff, compact = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const lines = code.split(/\r?\n/);
  const showLineNumbers = lines.length > 5;
  const lineNumberWidth = useMemo(() => {
    const maxDigits = String(lines.length).length;
    return `${maxDigits * 8 + 16}px`;
  }, [lines.length]);

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
        <div className="min-w-0 flex items-center gap-3">
          <div className="truncate font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: 'var(--k-accent)' }}>
            {language || 'text'}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--k-muted)' }}>
            {lines.length} lines
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
          <button
            type="button"
            className="klyr-inline-button"
            onClick={handleCopy}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {copied ? (
              <span className="flex items-center gap-1">
                <CheckIcon />
                <span>Copied</span>
              </span>
            ) : hovered ? (
              <span className="flex items-center gap-1">
                <CopyIcon />
                <span>Copy</span>
              </span>
            ) : (
              'Copy'
            )}
          </button>
        </div>
      </div>

      <div className="relative">
        {showLineNumbers && (
          <div
            className="absolute left-0 top-0 bottom-0 overflow-hidden border-r select-none pointer-events-none"
            style={{
              width: lineNumberWidth,
              background: 'color-mix(in srgb, var(--k-surface) 95%, transparent)',
              borderColor: 'color-mix(in srgb, var(--k-input-border) 60%, transparent)',
            }}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className={`font-mono text-right pr-3 ${compact ? 'text-[11px] leading-5' : 'text-[12px] leading-6'}`}
                style={{ color: 'var(--k-muted)', opacity: 0.5 }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <pre
          className={`klyr-scrollbar overflow-x-auto font-mono ${compact ? 'px-3 py-3 text-[11px] leading-5' : 'px-4 py-4 text-[12px] leading-6'}`}
          style={{
            color: 'var(--k-input-fg)',
            paddingLeft: showLineNumbers ? `calc(${lineNumberWidth} + 0.5rem)` : undefined,
          }}
        >
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default memo(CodeBlock);