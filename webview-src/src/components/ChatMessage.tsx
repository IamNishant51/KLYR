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

  if (isSystem) {
    return (
      <div className="klyr-fade-up flex justify-center py-2">
        <span className="text-xs" style={{ color: 'var(--k-muted)' }}>
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`klyr-fade-up flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {segments.length === 0 ? (
          <div className="flex items-center gap-2 py-3">
            <span className="h-1.5 w-1.5 animate-klyr-pulse rounded-full" style={{ background: 'var(--k-accent)' }} />
            <span className="h-1.5 w-1.5 animate-klyr-pulse rounded-full [animation-delay:120ms]" style={{ background: 'color-mix(in srgb, var(--k-accent) 68%, transparent)' }} />
            <span className="h-1.5 w-1.5 animate-klyr-pulse rounded-full [animation-delay:240ms]" style={{ background: 'color-mix(in srgb, var(--k-accent) 38%, transparent)' }} />
          </div>
        ) : (
          <div className="w-full">
            {segments.map((segment, segmentIndex) => {
              if (segment.type === 'code') {
                const treatAsMarkdown = shouldRenderAsMarkdown(segment.language, segment.content);
                if (treatAsMarkdown) {
                  return (
                    <div
                      key={`${message.id}-markdown-${segmentIndex}`}
                      className="space-y-1.5"
                    >
                      <MarkdownText
                        content={segment.content}
                        showCursor={streaming && segmentIndex === segments.length - 1}
                      />
                    </div>
                  );
                }

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

              const showCursor = streaming && segmentIndex === segments.length - 1;

              return (
                <div key={`${message.id}-text-${segmentIndex}`} className="space-y-1.5">
                  {isUser ? (
                    <div
                      className="rounded-lg px-3 py-2 text-sm leading-relaxed"
                      style={{
                        background: 'linear-gradient(135deg, color-mix(in srgb, var(--k-accent) 85%, var(--k-surface)), color-mix(in srgb, var(--k-accent) 70%, var(--k-surface)))',
                        color: '#ffffff',
                        maxWidth: '100%',
                        wordBreak: 'break-word',
                      }}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {segment.content}
                        {showCursor ? <span className="klyr-cursor ml-1 inline-block h-4 w-[3px] align-middle" /> : null}
                      </p>
                    </div>
                  ) : (
                    <MarkdownText
                      content={segment.content}
                      showCursor={showCursor}
                    />
                  )}
                </div>
              );
            })}

            {segments.length > 0 && streaming ? (
              <span className="klyr-cursor ml-1 inline-block h-4 w-[3px] align-middle" />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
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
