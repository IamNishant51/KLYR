import React, { memo, useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import DiffViewer from './DiffViewer';
import InputBox from './InputBox';
import ThinkingTrace from './ThinkingTrace';
import { estimateMessageHeight, getLatestAssistantMessage, isBusyPhase } from '../lib/chat';
import type {
  ChatMessage as ChatMessageType,
  ContextReference,
  DiffChange,
  GhostSuggestion,
  Plan,
  ThinkingTraceEntry,
  UiPhase,
} from '../types';
import type { PanelLayoutMode } from '../App';

interface ChatPanelProps {
  messages: ChatMessageType[];  
  phase: UiPhase;
  statusDetail: string;
  plan: Plan | null;
  contextRefs: ContextReference[];
  diffPreview: DiffChange[];
  ghostSuggestion: GhostSuggestion | null;
  thinkingTrace: ThinkingTraceEntry[];
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void
  chatMode: 'agent' | 'plan';
  onChatModeChange: (mode: 'agent' | 'plan') => void;
  onSendMessage: () => void;
  onStopMessage: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onApplyDraft: () => void;
  onRejectDraft: () => void;
  onOpenDiff: () => void;
  diffAvailable: boolean;
  layoutMode: PanelLayoutMode;
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
  plan,
  contextRefs,
  diffPreview,
  ghostSuggestion,
  thinkingTrace,
  inputValue,
  onInputChange,
  selectedModel,
  availableModels,
  onModelChange,
  chatMode,
  onChatModeChange,
  onSendMessage,
  onStopMessage,
  onOpenHistory,
  onOpenSettings,
  onNewChat,
  onApplyDraft,
  onRejectDraft,
  onOpenDiff,
  diffAvailable,
  layoutMode,
}: ChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const compact = layoutMode !== 'regular';

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
  const showVirtualizedList = displayMessages.length > VIRTUALIZATION_THRESHOLD && !shouldShowThinkingBubble;
  const narrow = layoutMode === 'narrow';
  const virtualItems = showVirtualizedList ? createVirtualItems(displayMessages) : [];
  const totalVirtualHeight =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1].top + virtualItems[virtualItems.length - 1].height
      : 0;
  const visibleVirtualItems = showVirtualizedList
    ? getVisibleVirtualItems(virtualItems, scrollTop, viewportHeight)
    : [];
  const pendingFiles = Array.from(new Set(diffPreview.map((change) => change.path)));

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
  }, [displayMessages, diffPreview, phase]);

  useEffect(() => {
    if (thinkingTrace.length === 0) {
      setThinkingExpanded(false);
    }
  }, [thinkingTrace.length]);

  useEffect(() => {
    if (diffPreview.length > 0) {
      setChangesExpanded(false);
    }
  }, [diffPreview.length]);

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
      <div
        className="shrink-0 border-b backdrop-blur-xl"
        style={{
          borderColor: 'var(--k-border)',
          background: 'color-mix(in srgb, var(--k-surface) 76%, transparent)',
        }}
      >
        <div className={`mx-auto w-full max-w-5xl ${narrow ? 'px-2 py-2' : 'px-3 py-3 sm:px-4'}`}>
          <div className={`klyr-fade-up px-1 ${narrow ? 'flex items-center gap-2' : 'flex items-center justify-between gap-2'}`}>
            <div className={narrow ? 'flex w-full items-center justify-between gap-2' : 'contents'}>
              <div
                className={`inline-flex min-w-0 items-center gap-2 rounded-full border ${narrow ? 'flex-1 px-2.5 py-1.5 text-[11px]' : 'max-w-full px-3 py-1.5 text-xs'}`}
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
                <span className="truncate">{statusDetail || 'Answer ready.'}</span>
              </div>

              <div className={`flex shrink-0 items-center ${narrow ? 'gap-1' : 'gap-2'}`}>
                <ActionIconButton label="History" onClick={onOpenHistory} compact={compact}>
                  <HistoryIcon />
                </ActionIconButton>
                <ActionIconButton label="New chat" onClick={onNewChat} compact={compact}>
                  <NewChatIcon />
                </ActionIconButton>
                <ActionIconButton label="Settings" onClick={onOpenSettings} compact={compact}>
                  <SettingsIcon />
                </ActionIconButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollerRef} onScroll={handleScroll} className="klyr-scrollbar flex-1 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-5xl flex-col ${narrow ? 'gap-3 px-2 py-3' : 'gap-4 px-3 py-4 sm:px-4'}`}>
          {messages.length === 0 && !shouldShowThinkingBubble ? (
            <div className={`klyr-fade-up flex items-center justify-center text-center ${narrow ? 'min-h-[28vh] px-3 py-8' : 'min-h-[40vh] px-6 py-12'}`}>
              <div className={`klyr-welcome-shimmer flex items-center justify-center ${narrow ? 'h-20 w-20' : 'h-28 w-28'}`}>
                <WelcomeLogo compact={narrow} />
              </div>
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
                  {item.message.id === SYNTHETIC_THINKING_ID ? (
                    <ThinkingTrace
                      currentDetail={statusDetail}
                      entries={thinkingTrace}
                      expanded={thinkingExpanded}
                      layoutMode={layoutMode}
                      onToggle={() => setThinkingExpanded((current) => !current)}
                    />
                  ) : (
                    <ChatMessage
                      message={item.message}
                      layoutMode={layoutMode}
                      streaming={
                        item.message.id === SYNTHETIC_THINKING_ID ||
                        (item.message.id === latestAssistantId && isBusyPhase(phase))
                      }
                      animateOnAppear={item.message.id === latestAssistantId}
                      draftActions={
                        diffAvailable && item.message.id === latestAssistantId
                          ? {
                              onApply: onApplyDraft,
                              onOpenDiff,
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={`space-y-3 ${narrow ? 'px-0.5' : 'px-1'}`}>
              {displayMessages.map((message) => (
                message.id === SYNTHETIC_THINKING_ID ? (
                  <ThinkingTrace
                    key={message.id}
                    currentDetail={statusDetail}
                    entries={thinkingTrace}
                    expanded={thinkingExpanded}
                    layoutMode={layoutMode}
                    onToggle={() => setThinkingExpanded((current) => !current)}
                  />
                ) : (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    layoutMode={layoutMode}
                    streaming={
                      message.id === SYNTHETIC_THINKING_ID ||
                      (message.id === latestAssistantId && isBusyPhase(phase))
                    }
                    animateOnAppear={message.id === latestAssistantId}
                    draftActions={
                      diffAvailable && message.id === latestAssistantId
                        ? {
                            onApply: onApplyDraft,
                            onOpenDiff,
                          }
                        : undefined
                    }
                  />
                )
              ))}
            </div>
          )}

          {diffPreview.length > 0 ? (
            <div id="klyr-diff-preview" className={`${narrow ? 'px-0.5' : 'px-1'}`}>
              <div
                className={`mb-3 rounded-[18px] border ${narrow ? 'px-3 py-2.5' : 'px-4 py-3'}`}
                style={{
                  borderColor: 'var(--k-input-border)',
                  background: 'color-mix(in srgb, var(--k-input-bg) 56%, transparent)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: 'var(--k-muted)' }}>
                    Agent Review
                  </div>
                  <button
                    type="button"
                    onClick={() => setChangesExpanded((current) => !current)}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      borderColor: 'var(--k-input-border)',
                      background: 'color-mix(in srgb, var(--k-surface) 72%, transparent)',
                      color: 'var(--k-muted)',
                    }}
                  >
                    {changesExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                <div className="mt-1 text-[12px] leading-6" style={{ color: 'var(--k-muted)' }}>
                  {diffPreview.length} file{diffPreview.length === 1 ? '' : 's'} prepared. Expand to inspect full added/removed lines.
                </div>
                {(plan || contextRefs.length > 0 || ghostSuggestion) ? (
                  <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--k-muted)' }}>
                    {[plan ? `Intent: ${plan.intent}` : null, contextRefs.length > 0 ? `Context: ${contextRefs.length} file${contextRefs.length === 1 ? '' : 's'}` : null, ghostSuggestion ? `Preview: ${ghostSuggestion.source}` : null]
                      .filter(Boolean)
                      .join(' | ')}
                  </div>
                ) : null}
              </div>
              {changesExpanded ? (
                <DiffViewer
                  changes={diffPreview}
                  onApply={onApplyDraft}
                  onReject={onRejectDraft}
                  compact={layoutMode !== 'regular'}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl">
        {pendingFiles.length > 0 ? (
          <div
            className={`mx-2 mb-2 rounded-2xl border ${narrow ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}
            style={{
              borderColor: 'var(--k-input-border)',
              background: 'color-mix(in srgb, var(--k-input-bg) 62%, transparent)',
            }}
          >
            <div className={`flex ${narrow ? 'flex-col gap-2' : 'items-center justify-between gap-3'}`}>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--k-muted)' }}>
                  Pending edits
                </div>
                <div className="mt-1 text-xs font-medium" style={{ color: 'var(--k-fg)' }}>
                  {pendingFiles.length} file{pendingFiles.length === 1 ? '' : 's'} changed
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {pendingFiles.slice(0, 4).map((filePath) => (
                    <span
                      key={filePath}
                      className="max-w-[11rem] truncate rounded-full border px-2 py-0.5 text-[11px]"
                      style={{
                        borderColor: 'var(--k-input-border)',
                        color: 'var(--k-muted)',
                        background: 'color-mix(in srgb, var(--k-surface) 70%, transparent)',
                      }}
                      title={filePath}
                    >
                      {filePath}
                    </span>
                  ))}
                  {pendingFiles.length > 4 ? (
                    <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: 'var(--k-input-border)', color: 'var(--k-muted)' }}>
                      +{pendingFiles.length - 4} more
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onApplyDraft}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--k-accent) 45%, transparent)',
                    background: 'color-mix(in srgb, var(--k-selection) 58%, transparent)',
                    color: 'var(--k-fg)',
                  }}
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={onRejectDraft}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: 'var(--k-input-border)',
                    background: 'color-mix(in srgb, var(--k-surface) 70%, transparent)',
                    color: 'var(--k-muted)',
                  }}
                >
                  Undo
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <InputBox
          inputValue={inputValue}
          onInputChange={onInputChange}
          selectedModel={selectedModel}
          availableModels={availableModels}
          onModelChange={onModelChange}
          chatMode={chatMode}
          onChatModeChange={onChatModeChange}
          onSendMessage={onSendMessage}
          onStopMessage={onStopMessage}
          busy={isBusyPhase(phase)}
          phase={phase}
          statusDetail={statusDetail}
          layoutMode={layoutMode}
        />
      </div>
    </section>
  );
}

function createVirtualItems(messages: ChatMessageType[]): VirtualItem[] {
  const items: VirtualItem[] = [];
  let offset = 0;

  messages.forEach((message) => {
    const height = estimateMessageHeight(message) + 16;
    items.push({
      height,
      message,
      top: offset,
    });
    offset += height;
  });

  return items;
}

function getVisibleVirtualItems(
  items: VirtualItem[],
  scrollTop: number,
  viewportHeight: number
): VirtualItem[] {
  const lowerBound = Math.max(0, scrollTop - OVERSCAN);
  const upperBound = scrollTop + viewportHeight + OVERSCAN;

  return items.filter((item) => item.top + item.height >= lowerBound && item.top <= upperBound);
}

function ActionIconButton({
  children,
  label,
  onClick,
  compact = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`klyr-icon-button shrink-0 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}
    >
      {children}
    </button>
  );
}

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-3.2L8.6 20.5c-.5.4-1.2 0-1.1-.7l.4-2.8A4 4 0 0 1 4 13V8a4 4 0 0 1 4-4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v5M9.5 10.5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 4.5v3.8h3.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8.2v4.1l2.9 1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path
        d="M10.12 3.92a1.7 1.7 0 0 1 3.76 0l.23.56a1.7 1.7 0 0 0 1.45 1.03l.6.05a1.7 1.7 0 0 1 1.88 1.88l-.05.6a1.7 1.7 0 0 0 1.03 1.45l.56.23a1.7 1.7 0 0 1 0 3.76l-.56.23a1.7 1.7 0 0 0-1.03 1.45l.05.6a1.7 1.7 0 0 1-1.88 1.88l-.6-.05a1.7 1.7 0 0 0-1.45 1.03l-.23.56a1.7 1.7 0 0 1-3.76 0l-.23-.56a1.7 1.7 0 0 0-1.45-1.03l-.6.05a1.7 1.7 0 0 1-1.88-1.88l.05-.6a1.7 1.7 0 0 0-1.03-1.45l-.56-.23a1.7 1.7 0 0 1 0-3.76l.56-.23a1.7 1.7 0 0 0 1.03-1.45l-.05-.6a1.7 1.7 0 0 1 1.88-1.88l.6.05a1.7 1.7 0 0 0 1.45-1.03l.23-.56Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 9.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WelcomeLogo({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Klyr logo"
      className={compact ? 'h-16 w-16' : 'h-24 w-24'}
      style={{
        color: 'var(--k-fg)',
        filter: 'drop-shadow(0 8px 26px color-mix(in srgb, var(--k-fg) 28%, transparent))',
      }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
      <path
        d="M 8 7 L 8 17 M 16 7 L 8 13 L 16 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default memo(ChatPanel);
