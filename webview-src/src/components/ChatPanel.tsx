import React, { memo, useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import InputBox from './InputBox';
import { estimateMessageHeight, getLatestAssistantMessage, isBusyPhase } from '../lib/chat';
import type { ChatMessage as ChatMessageType, UiPhase } from '../types';

interface ChatPanelProps {
  messages: ChatMessageType[];
  phase: UiPhase;
  statusDetail: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  onSendMessage: () => void;
  onStopMessage: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onApplyDraft: () => void;
  onOpenDiff: () => void;
  diffAvailable: boolean;
  compact: boolean;
}

interface VirtualItem {
  height: number;
  message: ChatMessageType;
  top: number;
}

const OVERSCAN = 320;
const SYNTHETIC_THINKING_ID = '__klyr-thinking__';
const VIRTUALIZATION_THRESHOLD = 24;

function ChatPanel({
  messages,
  phase,
  statusDetail,
  inputValue,
  onInputChange,
  selectedModel,
  availableModels,
  onModelChange,
  onSendMessage,
  onStopMessage,
  onOpenSettings,
  onNewChat,
  onApplyDraft,
  onOpenDiff,
  diffAvailable,
  compact,
}: ChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const shouldShowThinkingBubble =
    isBusyPhase(phase) &&
    (messages.length === 0 || messages[messages.length - 1].role === 'user');
  const displayMessages: ChatMessageType[] = shouldShowThinkingBubble
    ? [
        ...messages,
        {
          id: SYNTHETIC_THINKING_ID,
          role: 'assistant' as ChatMessageType['role'],
          content: '',
          createdAt: Date.now(),
          isStreaming: true,
        },
      ]
    : messages;
  const latestAssistantId = getLatestAssistantMessage(messages)?.id;
  const showVirtualizedList = displayMessages.length > VIRTUALIZATION_THRESHOLD;
  const virtualItems = showVirtualizedList ? createVirtualItems(displayMessages) : [];
  const totalVirtualHeight =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1].top + virtualItems[virtualItems.length - 1].height
      : 0;
  const visibleVirtualItems = showVirtualizedList
    ? getVisibleVirtualItems(virtualItems, scrollTop, viewportHeight)
    : [];

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const handleResize = () => {
      setViewportHeight(scroller.clientHeight);
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(scroller);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) {
      return;
    }

    const behavior = isBusyPhase(phase) ? 'auto' : 'smooth';
    window.requestAnimationFrame(() => {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior,
      });
    });
  }, [displayMessages, phase]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    setScrollTop(scroller.scrollTop);
    stickToBottomRef.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} onScroll={handleScroll} className="klyr-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-4">
          {(statusDetail || phase !== 'idle') && (
            <div className="klyr-fade-up flex items-center justify-between gap-2 px-1">
              <div
                className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                style={{
                  borderColor: 'var(--k-input-border)',
                  background: 'color-mix(in srgb, var(--k-input-bg) 62%, transparent)',
                  color: 'var(--k-muted)',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--k-accent)', boxShadow: '0 0 0 5px color-mix(in srgb, var(--k-accent) 20%, transparent)' }}
                />
                <span className="truncate">{statusDetail || 'Klyr is ready.'}</span>
              </div>

              <div className="flex items-center gap-2">
                <ActionIconButton label="New chat" onClick={onNewChat}>
                  <NewChatIcon />
                </ActionIconButton>
                <ActionIconButton label="Settings" onClick={onOpenSettings}>
                  <SettingsIcon />
                </ActionIconButton>
              </div>
            </div>
          )}

          {messages.length === 0 && !shouldShowThinkingBubble ? (
            <div className="klyr-welcome-card klyr-fade-up flex min-h-[40vh] flex-col items-center justify-center rounded-[28px] px-6 py-12 text-center">
              <div className="klyr-welcome-badge klyr-welcome-shimmer mb-4 rounded-3xl px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em]">
                Klyr Workspace
              </div>
              <h2 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--k-fg)' }}>
                Start from a file, bug, or feature.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7" style={{ color: 'var(--k-muted)' }}>
                Ask Klyr to inspect code, explain behavior, or draft changes. Mention a filename like config.py and it will be pulled into context automatically.
              </p>
            </div>
          ) : showVirtualizedList ? (
            <div style={{ height: totalVirtualHeight, position: 'relative' }}>
              {visibleVirtualItems.map((item) => (
                <div
                  key={item.message.id}
                  className="klyr-virtual-row px-1"
                  style={{
                    left: 0,
                    minHeight: item.height,
                    position: 'absolute',
                    right: 0,
                    top: item.top,
                  }}
                >
                  <ChatMessage
                    message={item.message}
                    streaming={
                      item.message.id === SYNTHETIC_THINKING_ID ||
                      (item.message.id === latestAssistantId && isBusyPhase(phase))
                    }
                    draftActions={
                      diffAvailable && item.message.id === latestAssistantId
                        ? {
                            onApply: onApplyDraft,
                            onOpenDiff,
                          }
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 px-1">
              {displayMessages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  streaming={
                    message.id === SYNTHETIC_THINKING_ID ||
                    (message.id === latestAssistantId && isBusyPhase(phase))
                  }
                  draftActions={
                    diffAvailable && message.id === latestAssistantId
                      ? {
                          onApply: onApplyDraft,
                          onOpenDiff,
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl">
        <InputBox
          inputValue={inputValue}
          onInputChange={onInputChange}
          selectedModel={selectedModel}
          availableModels={availableModels}
          onModelChange={onModelChange}
          onSendMessage={onSendMessage}
          onStopMessage={onStopMessage}
          busy={isBusyPhase(phase)}
          phase={phase}
          statusDetail={statusDetail}
          compact={compact}
        />
      </div>
    </section>
  );
}

function createVirtualItems(messages: ChatMessageType[]): VirtualItem[] {
  const items: VirtualItem[] = [];
  let offset = 0;

  messages.forEach((message) => {
    const height = estimateMessageHeight(message) + 16