import React, { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import CodeBlock from './CodeBlock';
import MarkdownText from './MarkdownText';
import { parseMessageContent, type MessageSegment } from '../lib/chat';
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
  const isStreaming = streaming && message.role === 'assistant';
  const renderedContent = (isStreaming || (animateOnAppear && message.role === 'assistant')) ? visibleContent : message.content;
  const segments = parseMessageContent(renderedContent);
  const isGeneratingEmpty = isStreaming && renderedContent.length < 10;

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

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center py-2"
      >
        <span className="text-xs" style={{ color: 'var(--k-muted)' }}>
          {message.content}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {segments.length === 0 || isGeneratingEmpty ? (
          <CursorThinking />
        ) : (
          <div className="w-full">
            {segments.map((segment, segmentIndex) => {
              if (segment.type === 'thinking') {
                return (
                  <ThinkingBlock
                    key={`${message.id}-thinking-${segmentIndex}`}
                    content={segment.content}
                  />
                );
              }
              
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
    </motion.div>
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

function CursorThinking() {
  return (
    <div className="flex flex-col gap-2 py-3 px-1 w-full max-w-md">
      <div className="flex items-center gap-1.5">
        <span className="thinking-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--nami-primary)' }} />
        <span className="thinking-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--nami-primary)' }} />
        <span className="thinking-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--nami-primary)' }} />
      </div>
      <div className="h-3 w-32 rounded skeleton-shimmer" style={{ background: 'var(--nami-surface-2)' }} />
    </div>
  );
}

interface ThinkingBlockProps {
  content: string;
}

function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div
      className="mb-3 overflow-hidden rounded-lg border transition-all duration-300"
      style={{
        borderColor: 'color-mix(in srgb, var(--k-accent) 30%, var(--k-border))',
        background: 'color-mix(in srgb, var(--k-surface) 60%, transparent)',
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-color-mix(in srgb, var(--k-surface) 40%, transparent)"
      >
        <span className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--k-accent)' }}>
          <ThinkingIcon />
          Thinking
        </span>
        <ChevronIcon expanded={isExpanded} />
      </button>
      
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: isExpanded ? '500px' : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="px-3 pb-3">
          <pre
            className="text-[12px] leading-[1.5] whitespace-pre-wrap"
            style={{ color: 'var(--k-muted)' }}
          >
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
}

function ThinkingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="transition-transform duration-200"
      style={{
        color: 'var(--k-muted)',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default memo(ChatMessage);