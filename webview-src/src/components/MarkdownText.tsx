import React, { memo } from 'react';

interface MarkdownTextProps {
  compact?: boolean;
  content: string;
  showCursor?: boolean;
}

type MarkdownBlock =
  | { type: 'heading'; level: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] };

function MarkdownText({ compact = false, content, showCursor = false }: MarkdownTextProps) {
  const blocks = parseMarkdownBlocks(normalizeMarkdown(content));

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {blocks.map((block, index) => renderBlock(block, compact, showCursor && index === blocks.length - 1, `block-${index}`))}
    </div>
  );
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\\(#{1,6})\s+/gm, '$1 ')
    .replace(/\\([`*_])/g, '$1');
}

function renderBlock(
  block: MarkdownBlock,
  compact: boolean,
  showCursor: boolean,
  key: string
): React.ReactNode {
  switch (block.type) {
    case 'heading': {
      const headingClass = getHeadingClass(block.level, compact);
      return (
        <div key={key} className={headingClass} style={{ color: 'var(--k-fg)' }}>
          {renderInlineMarkdown(block.content, `${key}-heading`, showCursor)}
        </div>
      );
    }
    case 'unordered-list':
      return (
        <ul
          key={key}
          className={`space-y-1 pl-5 ${compact ? 'text-[13px] leading-[1.5]' : 'text-sm leading-[1.55]'}`}
          style={{ color: 'var(--k-fg)' }}
        >
          {block.items.map((item, index) => (
            <li key={`${key}-item-${index}`} className="list-disc">
              <span className="whitespace-pre-wrap break-words">
                {renderInlineMarkdown(item, `${key}-item-${index}`, showCursor && index === block.items.length - 1)}
              </span>
            </li>
          ))}
        </ul>
      );
    case 'ordered-list':
      return (
        <ol
          key={key}
          className={`space-y-1 pl-5 ${compact ? 'text-[13px] leading-[1.5]' : 'text-sm leading-[1.55]'}`}
          style={{ color: 'var(--k-fg)' }}
        >
          {block.items.map((item, index) => (
            <li key={`${key}-item-${index}`} className="list-decimal">
              <span className="whitespace-pre-wrap break-words">
                {renderInlineMarkdown(item, `${key}-item-${index}`, showCursor && index === block.items.length - 1)}
              </span>
            </li>
          ))}
        </ol>
      );
    case 'paragraph':
    default:
      return (
        <p
          key={key}
          className={`whitespace-pre-wrap break-words ${compact ? 'text-[13px] leading-[1.52]' : 'text-[14px] leading-[1.58]'}`}
        >
          {renderInlineMarkdown(block.content, `${key}-paragraph`, showCursor)}
        </p>
      );
  }
}

function renderInlineMarkdown(
  content: string,
  keyPrefix: string,
  showCursor: boolean
): React.ReactNode[] {
  const tokenPattern = /(`[^`\n]+`|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of content.matchAll(tokenPattern)) {
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) {
      nodes.push(content.slice(lastIndex, startIndex));
    }

    const token = match[0];
    const tokenKey = `${keyPrefix}-${matchIndex}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={tokenKey}
          className="rounded-md border px-1.5 py-0.5 font-mono text-[0.88em]"
          style={{
            borderColor: 'color-mix(in srgb, var(--k-input-border) 75%, transparent)',
            background: 'color-mix(in srgb, var(--k-surface) 86%, transparent)',
            color: 'var(--k-input-fg)',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      nodes.push(
        <strong key={tokenKey} className="font-semibold" style={{ color: 'var(--k-fg)' }}>
          {renderInlineMarkdown(token.slice(2, -2), `${tokenKey}-strong`, false)}
        </strong>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      nodes.push(
        <em key={tokenKey} className="italic" style={{ color: 'var(--k-fg)' }}>
          {renderInlineMarkdown(token.slice(1, -1), `${tokenKey}-em`, false)}
        </em>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = startIndex + token.length;
    matchIndex += 1;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  if (showCursor) {
    nodes.push(<span key={`${keyPrefix}-cursor`} className="klyr-cursor ml-1 align-middle" />);
  }

  return nodes;
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [{ type: 'paragraph', content: '' }];
  }

  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphLines.join('\n').trim();
    if (paragraph) {
      blocks.push({ type: 'paragraph', content: paragraph });
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const unorderedItems = collectList(lines, index, /^\s*[-*+]\s+(.*)$/);
    if (unorderedItems) {
      flushParagraph();
      blocks.push({ type: 'unordered-list', items: unorderedItems.items });
      index = unorderedItems.nextIndex;
      continue;
    }

    const orderedItems = collectList(lines, index, /^\s*\d+\.\s+(.*)$/);
    if (orderedItems) {
      flushParagraph();
      blocks.push({ type: 'ordered-list', items: orderedItems.items });
      index = orderedItems.nextIndex;
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph();

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', content: normalized }];
}

function collectList(
  lines: string[],
  startIndex: number,
  pattern: RegExp
): { items: string[]; nextIndex: number } | null {
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match) {
      break;
    }
    items.push(match[1].trim());
    index += 1;
  }

  if (items.length === 0) {
    return null;
  }

  return { items, nextIndex: index };
}

function getHeadingClass(level: number, compact: boolean): string {
  switch (level) {
    case 1:
      return compact ? 'text-[15px] font-semibold tracking-tight leading-[1.3]' : 'text-[18px] font-semibold tracking-tight leading-[1.3]';
    case 2:
      return compact ? 'text-[14px] font-semibold tracking-tight leading-[1.3]' : 'text-[16px] font-semibold tracking-tight leading-[1.32]';
    case 3:
      return compact ? 'text-[13px] font-semibold tracking-tight leading-[1.35]' : 'text-[15px] font-semibold tracking-tight leading-[1.35]';
    default:
      return compact ? 'text-[12px] font-semibold uppercase tracking-[0.14em]' : 'text-[13px] font-semibold uppercase tracking-[0.14em]';
  }
}

export default memo(MarkdownText);
