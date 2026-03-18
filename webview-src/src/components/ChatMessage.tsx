import React, { memo, useEffect, useState } from 'react';
import CodeBlock from './CodeBlock';
import MarkdownText from './MarkdownText';
import { parseMessageContent } from '../lib/chat';
import type { ChatMessage as ChatMessageType } from '../types';
import type { PanelLayoutMode } from '../App';

interface DraftActions {
  onApply: () => void;
  onOpenDiff: () => void;
}

interface ChatMessageProps {
  message: ChatMessageType;
  streaming: boolean;
  animateOnAppear?: boolean;
  draftActions?: DraftActions;
  layoutMode: PanelLayoutMode;
}

function ChatMessage({ message, streaming, animateOnAppear = false, draftActions, layoutMode }: ChatMessageProps) {
  const [visibleContent, setVisibleContent] = useState(message.content);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const compact = layoutMode !== 'regular';
  const narrow = layoutMode === 'narrow';
  const wrapperMaxWidth = narrow ? 'max-w-full' : compact ? 'max-w-[96%]' : 'max-w-[92%]';

  useEffect(() => {
    const shouldTypeAnimate = streaming || (animateOnAppear && message.role === 'assistant');
    if (!shouldTypeAnimate) {
      setVisibleContent(message.content);
      return;
    }

    setVisibleContent((current) => (streaming ? current : ''));

    let animationFrame = 0;
    const tick = () => {
      let done = false;
      setVisibleContent((currentContent) => {
        if (currentContent.length >= message.content.length) {
          done = true;
          return currentContent;
        }

        const remaining = message.content.length - currentContent.length;
        const nextLength =
          currentContent.length + Math.max(1, Math.min(remaining, Math.ceil(remaining / 6) + 1));
        const nextContent = message.content.slice(0, nextLength);
        done = nextContent.length >= message.content.length;
        return nextContent;
      });

      if (!done) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [message.content, streaming, animateOnAppear, message.role]);

  const renderedContent = (streaming || (animateOnAppear && message.role === 'assistant')) ? visibleContent : message.content;
  const segments = parseMessageContent(renderedContent);
  const lastTextSegmentIndex = findLastTextSegmentIndex(segments);

  return (
    <article
      className={`klyr-fade-up flex w-full ${
        isSystem ? 'justify-center' : isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`flex w-full ${wrapperMaxWidth} flex-col gap-2 ${
          isSystem ? 'items-center' : isUser ? 'items-end' : 'items-start'
        }`}
      >
        {!isSystem && (
          <div className={`px-1 font-medium uppercase tracking-[0.22em] ${narrow ? 'text-[10px]' : 'text-[11px]'}`} style={{ color: 'var(--k-muted)' }}>
            {isUser ? 'You' : 'Klyr'}
          </div>
        )}

        <div
          className={
            isSystem
              ? 'w-fit max-w-full rounded-full border px-4 py-2 text-xs'
              : isUser
              ? `w-fit max-w-full ${narrow ? 'space-y-2.5 rounded-[20px] border px-3 py-2.5 text-[13px] leading-6' : compact ? 'space-y-2.5 rounded-[22px] border px-3.5 py-2.5 text-[13px] leading-6' : 'space-y-3 rounded-[24px] border px-4 py-3 text-sm leading-7'}`
              : `w-fit max-w-full ${narrow ? 'space-y-2.5 rounded-[20px] border px-3 py-2.5 text-[13px] leading-6' : compact ? 'space-y-2.5 rounded-[22px] border px-3.5 py-2.5 text-[13px] leading-6' : 'space-y-3 rounded-[24px] border px-4 py-3 text-sm leading-7'}`
          }
          style={
            isSystem
              ? {
                  borderColor: 'var(--k-input-border)',
                  background: 'color-mix(in srgb, var(--k-input-bg) 62%, transparent)',
                  color: 'var(--k-muted)',
                }
              : isUser
              ? {
                  borderColor: 'color-mix(in srgb, var(--k-accent) 34%, transparent)',
                  background: 'color-mix(in srgb, var(--k-selection) 52%, var(--k-surface) 48%)',
                  color: 'var(--k-fg)',
                  boxShadow: '0 14px 34px color-mix(in srgb, var(--k-bg) 56%, transparent)',
                }
              : {
                  borderColor: 'var(--k-input-border)',
                  background: 'color-mix(in srgb, var(--k-surface) 86%, transparent)',
                  color: 'var(--k-fg)',
                  boxShadow: '0 16px 36px color-mix(in srgb, var(--k-bg) 54%, transparent)',
                }
          }
        >
          {segments.length === 0 ? (
            <div className="flex items-center gap-2" style={{ color: 'var(--k-muted)' }}>
              <span className="h-2 w-2 animate-klyr-pulse rounded-full" style={{ background: 'var(--k-accent)' }} />
              <span className="h-2 w-2 animate-klyr-pulse rounded-full [animation-delay:120ms]" style={{ background: 'color-mix(in srgb, var(--k-accent) 68%, transparent)' }} />
              <span className="h-2 w-2 animate-klyr-pulse rounded-full [animation-delay:240ms]" style={{ background: 'color-mix(in srgb, var(--k-accent) 38%, transparent)' }} />
            </div>
          ) : (
            segments.map((segment, segmentIndex) => {
              if (segment.type === 'code') {
                const treatAsMarkdown = shouldRenderAsMarkdown(segment.language, segment.content);
                if (treatAsMarkdown) {
                  const showCursor = streaming && segmentIndex === segments.length - 1;
                  return (
                    <div
                      key={`${message.id}-markdown-${segmentIndex}`}
                      className={`${narrow ? 'space-y-2.5' : 'space-y-3'} ${!isUser ? `${narrow ? 'border-l pl-2.5' : 'border-l pl-3'}` : ''}`}
                      style={!isUser ? { borderColor: 'color-mix(in srgb, var(--k-accent) 28%, transparent)' } : undefined}
                    >
                      <MarkdownText
                        compact={compact}
                        content={segment.content}
                        showCursor={showCursor}
                      />
                    </div>
                  );
                }

                return (
                  <CodeBlock
                    key={`${message.id}-code-${segmentIndex}`}
                    language={segment.language}
                    code={segment.content}
                    compact={compact}
                    onApply={segmentIndex === 0 ? draftActions?.onApply : undefined}
                    onViewDiff={segmentIndex === 0 ? draftActions?.onOpenDiff : undefined}
                  />
                );
              }

              const showCursor =
                streaming &&
                segmentIndex === lastTextSegmentIndex;

              return (
                <div
                  key={`${message.id}-text-${segmentIndex}`}
                  className={`${narrow ? 'space-y-2.5' : 'space-y-3'} ${!isUser ? `${narrow ? 'border-l pl-2.5' : 'border-l pl-3'}` : ''}`}
                  style={!isUser ? { borderColor: 'color-mix(in srgb, var(--k-accent) 28%, transparent)' } : undefined}
                >
                  {!isUser ? (
                    <MarkdownText
                      compact={compact}
                      content={segment.content}
                      showCursor={showCursor}
                    />
                  ) : (
                    segment.content.split(/\n{2,}/).map((paragraph, paragraphIndex, paragraphs) => {
                      const showParagraphCursor =
                        showCursor &&
                        paragraphIndex === paragraphs.length - 1;

                      return (
                        <p
                          key={`${message.id}-paragraph-${segmentIndex}-${paragraphIndex}`}
                          className={`whitespace-pre-wrap break-words ${narrow ? 'leading-6' : 'leading-7'}`}
                        >
                          {paragraph}
                          {showParagraphCursor ? <span className="klyr-cursor ml-1 align-middle" /> : null}
                        </p>
                      );
                    })
                  )}
                </div>
              );
            })
          )}

          {segments.length > 0 && streaming && lastTextSegmentIndex === -1 ? (
            <div className="pt-1">
              <span className="klyr-cursor align-middle" />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function findLastTextSegmentIndex(segments: ReturnType<typeof parseMessageContent>): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].type === 'text') {
      return index;
    }
  }

  return -1;
}

function shouldRenderAsMarkdown(language: string, content: string): boolean {
  const normalizedLanguage = (language || '').trim().toLowerCase();
  if (!['markdown', 'md', 'mdx'].includes(normalizedLanguage)) {
    return false;
  }

  if (!content.trim()) {
    return false;
  }

  return true;
}

export default memo(ChatMessage);
