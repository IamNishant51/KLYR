import React, { memo, useEffect, useState } from 'react';
import CodeBlock from './CodeBlock';
import { parseMessageContent } from '../lib/chat';
import type { ChatMessage as ChatMessageType } from '../types';

interface DraftActions {
  onApply: () => void;
  onOpenDiff: () => void;
}

interface ChatMessageProps {
  message: ChatMessageType;
  streaming: boolean;
  draftActions?: DraftActions;
}

function ChatMessage({ message, streaming, draftActions }: ChatMessageProps) {
  const [visibleContent, setVisibleContent] = useState(message.content);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  useEffect(() => {
    if (!streaming) {
      setVisibleContent(message.content);
      return;
    }

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
  }, [message.content, streaming]);

  const renderedContent = streaming ? visibleContent : message.content;
  const segments = parseMessageContent(renderedContent);
  const lastTextSegmentIndex = findLastTextSegmentIndex(segments);

  return (
    <article
      className={`klyr-fade-up flex w-full ${
        isSystem ? 'justify-center' : isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`flex max-w-[92%] flex-col gap-2 ${
          isSystem ? 'items-center' : isUser ? 'items-end' : 'items-start'
        }`}
      >
        {!isSystem && (
          <div className="px-1 text-[11px] font-medium uppercase tracking-[0.22em]" style={{ color: 'var(--k-muted)' }}>
            {isUser ? 'You' : 'Klyr'}
          </div>
        )}

        <div
          className={
            isSystem
              ? 'rounded-full border px-4 py-2 text-xs'
              : isUser
              ? 'space-y-3 rounded-[24px] border px-4 py-3 text-sm leading-7'
              : 'space-y-3 rounded-[24px] border px-4 py-3 text-sm leading-7'
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
                return (
                  <CodeBlock
                    key={`${message.id}-code-${segmentIndex}`}
                    language={segment.language}
                    code={segment.content}
                    onApply={segmentIndex === 0 ? draftActions?.onApply : undefined}
                    onViewDiff={segmentIndex === 0 ? draftActions?.onOpenDiff : undefined}
                  />
                );
              }

              return (
                <div
                  key={`${message.id}-text-${segmentIndex}`}
                  className={`space-y-3 ${!isUser ? 'border-l pl-3' : ''}`}
                  style={!isUser ? { borderColor: 'color-mix(in srgb, var(--k-accent) 28%, transparent)' } : undefined}
                >
                  {segment.content.split(/\n{2,}/).map((paragraph, paragraphIndex, paragraphs) => {
                    const showCursor =
                      streaming &&
                      segmentIndex === lastTextSegmentIndex &&
                      paragraphIndex === paragraphs.length - 1;

                    return (
                      <p
                        key={`${message.id}-paragraph-${segmentIndex}-${paragraphIndex}`}
                        className="whitespace-pre-wrap break-words leading-7"
                      >
                        {paragraph}
                        {showCursor ? <span className="klyr-cursor ml-1 align-middle" /> : null}
                      </p>
                    );
                  })}
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

export default memo(ChatMessage);
