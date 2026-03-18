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
        className="klyr-glass-strong shrink-0 border-b"
        style={{
          borderColor: 'var(--k-border)',
        }}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-2">
          <div className="klyr-fade-up flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--k-fg)' }}>Klyr</div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--k-muted)' }}>
                  <span 
                    className="h-1.5 w-1.5 rounded-full animate-klyr-pulse"
                    style={{ background: 'var(--k-accent)' }} 
                  />
                  {statusDetail || 'Ready'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ActionIconButton label="New chat" onClick={onNewChat} compact={compact}>
                <NewChatIcon />
              </ActionIconButton>
              <ActionIconButton label="History" onClick={onOpenHistory} compact={compact}>
                <HistoryIcon />
              </ActionIconButton>
              <ActionIconButton label="Settings" onClick={onOpenSettings} compact={compact}>
                <SettingsIcon />
              </ActionIconButton>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollerRef} onScroll={handleScroll} className="klyr-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4">
          {messages.length === 0 && !shouldShowThinkingBubble ? (
            <div className="klyr-fade-up flex h-full flex-col items-center justify-center gap-8">
              <div className="animate-klyr-glow flex items-center justify-center">
                <WelcomeLogo compact={narrow} />
              </div>
              <div className="text-center">
                <h2 className="klyr-fade-up mb-2 text-lg font-medium" style={{ color: 'var(--k-fg)', animationDelay: '0.1s' }}>
                  Welcome to Klyr
                </h2>
                <p className="klyr-fade-up text-sm" style={{ color: 'var(--k-muted)', animationDelay: '0.2s' }}>
                  Your AI coding assistant, powered by local LLMs
                </p>
              </div>
              <div className="klyr-fade-up grid grid-cols-2 gap-3 sm:grid-cols-3" style={{ animationDelay: '0.3s' }}>
                <QuickAction label="Explain code" icon={<ExplainIcon />} />
                <QuickAction label="Fix bugs" icon={<BugIcon />} />
                <QuickAction label="Write tests" icon={<CheckIcon />} />
                <QuickAction label="Refactor" icon={<RefactorIcon />} />
                <QuickAction label="Optimize" icon={<BoltIcon />} />
                <QuickAction label="Document" icon={<DocumentIcon />} />
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
            <div className="flex flex-col">
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
            <div id="klyr-diff-preview" className="mt-4">
              <div className="klyr-fade-up flex items-center justify-between rounded-lg border px-4 py-3" style={{
                borderColor: 'color-mix(in srgb, var(--k-accent) 40%, var(--k-input-border))',
                background: 'color-mix(in srgb, var(--k-selection) 30%, var(--k-surface))',
              }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{
                    background: 'color-mix(in srgb, var(--k-accent) 20%, transparent)',
                    color: 'var(--k-accent)'
                  }}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--k-fg)' }}>
                      {diffPreview.length} file{diffPreview.length === 1 ? '' : 's'} changed
                    </div>
                    <div className="text-xs" style={{ color: 'var(--k-muted)' }}>
                      {plan?.summary || 'Review changes before applying'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChangesExpanded((current) => !current)}
                    className="klyr-inline-button"
                  >
                    {changesExpanded ? 'Hide' : 'View'}
                  </button>
                  <button
                    type="button"
                    onClick={onRejectDraft}
                    className="klyr-inline-button"
                    style={{ borderColor: 'color-mix(in srgb, #f85149 40%, var(--k-input-border))' }}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={onApplyDraft}
                    className="klyr-action-button rounded-lg px-4 py-2 text-sm font-medium"
                  >
                    Apply
                  </button>
                </div>
              </div>
              {changesExpanded ? (
                <div className="klyr-fade-up mt-3">
                  <DiffViewer
                    changes={diffPreview}
                    onApply={onApplyDraft}
                    onReject={onRejectDraft}
                    compact={layoutMode !== 'regular'}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 pb-4">
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
    <div className="relative">
      <div 
        className="absolute inset-0 animate-klyr-glow rounded-full blur-xl"
        style={{ background: 'color-mix(in srgb, var(--k-accent) 30%, transparent)' }}
      />
      <svg
        viewBox="0 0 24 24"
        aria-label="Klyr logo"
        className={`relative ${compact ? 'h-16 w-16' : 'h-24 w-24'}`}
        style={{
          color: 'var(--k-fg)',
          filter: 'drop-shadow(0 8px 26px color-mix(in srgb, var(--k-fg) 28%, transparent))',
        }}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle 
          cx="12" 
          cy="12" 
          r="11" 
          stroke="currentColor" 
          strokeWidth="2" 
          className="animate-klyr-border-glow"
        />
        <path
          d="M 8 7 L 8 17 M 16 7 L 8 13 L 16 17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

interface QuickActionProps {
  label: string;
  icon: React.ReactNode;
}

function QuickAction({ label, icon }: QuickActionProps) {
  return (
    <button
      type="button"
      className="klyr-fade-up klyr-hover-lift flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-all"
      style={{
        borderColor: 'var(--k-input-border)',
        background: 'color-mix(in srgb, var(--k-surface) 50%, transparent)',
        color: 'var(--k-fg)',
        animationDelay: `${Math.random() * 0.3}s`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--k-accent)';
        e.currentTarget.style.background = 'color-mix(in srgb, var(--k-selection) 40%, var(--k-surface))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--k-input-border)';
        e.currentTarget.style.background = 'color-mix(in srgb, var(--k-surface) 50%, transparent)';
      }}
    >
      <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--k-accent)' }}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ExplainIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4.5h9.5L19.5 8v11A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 4.5V8h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h8M8 15h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 7.5a3 3 0 0 1 3 3V16a3 3 0 0 1-6 0v-5.5a3 3 0 0 1 3-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 7 12 5.2 13.8 7M7.5 10.5h9M7.5 14h9M6 8.8 8 10M18 8.8 16 10M6 15.7 8 14.5M18 15.7 16 14.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4.5 12.5 9.5 17.5 19.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefactorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 7h7a3 3 0 1 1 0 6H8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 15H17a3 3 0 1 1 0 6H10" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -4)" />
      <path d="M8 10 5 13l3 3M16 8l3-3-3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M13.2 3.5 6.5 12h4.7L10.8 20.5 17.5 12h-4.7l.4-8.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.5h8L19.5 8v12A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3.5V8h4.5M8.5 12h7M8.5 15h7M8.5 18h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default memo(ChatPanel);
