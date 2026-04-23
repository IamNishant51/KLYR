import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface MarkdownTextProps {
  compact?: boolean;
  content: string;
  showCursor?: boolean;
}

function MarkdownText({ compact = false, content, showCursor = false }: MarkdownTextProps) {
  const cursorElement = useMemo(() => {
    if (!showCursor) return null;
    return <span className="klyr-cursor ml-1 align-middle" />;
  }, [showCursor]);

  const components = useMemo(() => ({
    code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;

      if (isInline) {
        return (
          <code
            className="rounded-md border px-1.5 py-0.5 font-mono text-[0.88em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--k-input-border) 75%, transparent)',
              background: 'color-mix(in srgb, var(--k-surface) 86%, transparent)',
              color: 'var(--k-input-fg)',
            }}
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1
        className={compact ? 'text-[15px] font-semibold tracking-tight leading-[1.3]' : 'text-[18px] font-semibold tracking-tight leading-[1.3]'}
        style={{ color: 'var(--k-fg)', marginTop: '1em', marginBottom: '0.5em' }}
      >
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2
        className={compact ? 'text-[14px] font-semibold tracking-tight leading-[1.3]' : 'text-[16px] font-semibold tracking-tight leading-[1.32]'}
        style={{ color: 'var(--k-fg)', marginTop: '1em', marginBottom: '0.5em' }}
      >
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3
        className={compact ? 'text-[13px] font-semibold tracking-tight leading-[1.35]' : 'text-[15px] font-semibold tracking-tight leading-[1.35]'}
        style={{ color: 'var(--k-fg)', marginTop: '1em', marginBottom: '0.5em' }}
      >
        {children}
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4
        className={compact ? 'text-[12px] font-semibold uppercase tracking-[0.14em]' : 'text-[13px] font-semibold uppercase tracking-[0.14em]'}
        style={{ color: 'var(--k-fg)', marginTop: '1em', marginBottom: '0.5em' }}
      >
        {children}
      </h4>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p
        className={`whitespace-pre-wrap break-words ${compact ? 'text-[13px] leading-[1.52]' : 'text-[14px] leading-[1.58]'}`}
        style={{ color: 'var(--k-fg)', marginBottom: '0.75em' }}
      >
        {children}
      </p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul
        className={`space-y-1 pl-5 ${compact ? 'text-[13px] leading-[1.5]' : 'text-sm leading-[1.55]'}`}
        style={{ color: 'var(--k-fg)', marginBottom: '0.75em', listStyleType: 'disc' }}
      >
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol
        className={`space-y-1 pl-5 ${compact ? 'text-[13px] leading-[1.5]' : 'text-sm leading-[1.55]'}`}
        style={{ color: 'var(--k-fg)', marginBottom: '0.75em', listStyleType: 'decimal' }}
      >
        {children}
      </ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="list-disc" style={{ color: 'var(--k-fg)' }}>
        <span className="whitespace-pre-wrap break-words">{children}</span>
      </li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold" style={{ color: 'var(--k-fg)' }}>
        {children}
      </strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic" style={{ color: 'var(--k-fg)' }}>
        {children}
      </em>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote
        className={`border-l-4 pl-4 italic ${compact ? 'text-[13px]' : 'text-[14px]'}`}
        style={{ borderColor: 'var(--k-accent)', color: 'var(--k-muted)', margin: '0.75em 0' }}
      >
        {children}
      </blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        className="underline"
        style={{ color: 'var(--k-accent)' }}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto">
        <table
          className="min-w-full border text-sm"
          style={{ borderColor: 'var(--k-border)', marginBottom: '0.75em' }}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th
        className="border px-3 py-2 text-left font-semibold"
        style={{ borderColor: 'var(--k-border)', background: 'var(--k-surface)' }}
      >
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="border px-3 py-2" style={{ borderColor: 'var(--k-border)' }}>
        {children}
      </td>
    ),
    hr: () => (
      <hr className="my-4" style={{ borderColor: 'var(--k-border)' }} />
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
  }), [compact]);

  const processedContent = content
    .replace(/\r\n/g, '\n')
    .replace(/\\([`*_])/g, '$1');

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
      {cursorElement}
    </div>
  );
}

export default memo(MarkdownText);