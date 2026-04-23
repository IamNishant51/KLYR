import React, { memo, useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import DiffViewer from './DiffViewer';
import InputBox from './InputBox';
import ThinkingTrace from './ThinkingTrace';
import { getLatestAssistantMessage, isBusyPhase } from '../lib/chat';
import type {
  ChatImageAttachment,
  ChatMessage as ChatMessageType,
  ContextReference,
  DiffChange,
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
  thinkingTrace: ThinkingTraceEntry[];
  inputValue: string;
  onInputChange: (value: string) => void;
  attachments: ChatImageAttachment[];
  onAddImage: (attachment: ChatImageAttachment) => void;
  onRemoveImage: (id: string) => void;
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

const SYNTHETIC_THINKING_ID = '__nami-thinking__';

const NAMI_ASCII = `
　　██░▀██████████████▀░██
　　█▌▒▒░████████████░▒▒▐█
　　█░▒▒▒░██████████░▒▒▒░█
　　▌░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▐
　　░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░
　 ███▀▀▀██▄▒▒▒▒▒▒▒▄██▀▀▀██
　 ██░░░▐█░▀█▒▒▒▒▒█▀░█▌░░░█
　 ▐▌░░░▐▄▌░▐▌▒▒▒▐▌░▐▄▌░░▐▌
　　█░░░▐█▌░░▌▒▒▒▐░░▐█▌░░█
　　▒▀▄▄▄█▄▄▄▌░▄░▐▄▄▄█▄▄▀▒
　　░░░░░░░░░░└┴┘░░░░░░░░░
　　██▄▄░░░░░░░░░░░░░░▄▄██
　　████████▒▒▒▒▒▒████████
　　█▀░░███▒▒░░▒░░▒▀██████
　　█▒░███▒▒╖░░╥░░╓▒▐█████
　　█▒░▀▀▀░░║░░║░░║░░█████
　　██▄▄▄▄▀▀┴┴╚╧╧╝╧╧╝┴┴███
　　██████████████████████
`;

function ChatPanel({
  messages, phase, statusDetail, plan, contextRefs, diffPreview, thinkingTrace,
  inputValue, onInputChange, attachments, onAddImage, onRemoveImage,
  selectedModel, availableModels, onModelChange,
  chatMode, onChatModeChange, onSendMessage, onStopMessage,
  onOpenHistory, onOpenSettings, onNewChat, onApplyDraft, onRejectDraft, onOpenDiff, diffAvailable, layoutMode,
}: ChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<number | null>(null);

  const shouldShowThinkingBubble = isBusyPhase(phase) && messages.length > 0 && messages[messages.length - 1].role === 'user';
  const displayMessages = [...messages];
  const latestAssistantId = getLatestAssistantMessage(messages)?.id;
  const busy = isBusyPhase(phase);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const handleResize = () => setViewportHeight(scroller.clientHeight);
    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(scroller);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) return;
    window.requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: isBusyPhase(phase) ? 'auto' : 'smooth' });
    });
  }, [displayMessages, diffPreview, phase]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    stickToBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ background: 'var(--nami-bg)' }}>
      {/* Header */}
      <header className="shrink-0 border-b" style={{ borderColor: 'var(--nami-border)', background: 'var(--nami-surface)' }}>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-widest" style={{ color: 'var(--nami-primary)' }}>NAMI</span>
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'nami-pulse' : ''}`} style={{ background: busy ? 'var(--nami-primary)' : 'var(--nami-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--nami-muted)' }}>{busy ? (statusDetail || 'Working...') : 'Ready'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="New chat" onClick={onNewChat} className="nami-icon-button h-8 w-8"><NewChatIcon /></button>
            <button type="button" aria-label="History" onClick={onOpenHistory} className="nami-icon-button h-8 w-8"><HistoryIcon /></button>
            <button type="button" aria-label="Settings" onClick={onOpenSettings} className="nami-icon-button h-8 w-8"><SettingsIcon /></button>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div ref={scrollerRef} onScroll={handleScroll} className="nami-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4">
          {messages.length === 0 && !shouldShowThinkingBubble ? (
            <div className="flex h-full flex-col items-center justify-center py-16">
              <pre className="mb-8 text-center font-mono font-bold tracking-widest" style={{ 
                color: 'var(--nami-primary)', fontSize: 'clamp(9px, 1.8vw, 14px)', lineHeight: 1.2, textShadow: '0 0 40px rgba(232, 121, 249, 0.6)',
              }}>{NAMI_ASCII}</pre>
              
              <p className="mb-12 max-w-lg text-center text-base leading-relaxed" style={{ color: 'var(--nami-muted)' }}>
                Your AI coding agent. Read your codebase, write features, run commands, and build anything.
              </p>

              <div className="mb-12 grid w-full max-w-2xl grid-cols-2 gap-4">
                {quickActions.map((action, idx) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => { onInputChange(action.prompt); onSendMessage(); }}
                    onMouseEnter={() => setHoveredAction(idx)}
                    onMouseLeave={() => setHoveredAction(null)}
                    className="group flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-300"
                    style={{
                      background: hoveredAction === idx ? 'var(--nami-surface-2)' : 'var(--nami-surface)',
                      borderColor: hoveredAction === idx ? 'var(--nami-primary)' : 'var(--nami-border)',
                      transform: hoveredAction === idx ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-300" style={{ background: hoveredAction === idx ? 'var(--nami-gradient)' : 'rgba(232, 121, 249, 0.15)' }}>
                      {action.icon}
                    </div>
                    <div>
                      <span className="block font-semibold text-base" style={{ color: 'var(--nami-fg)' }}>{action.label}</span>
                      <span className="block text-sm" style={{ color: 'var(--nami-muted)' }}>{action.description}</span>
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-xs" style={{ color: 'var(--nami-muted)', opacity: 0.6 }}>Press Enter to send • Shift+Enter for new line</p>
            </div>
          ) : (
            <div className="flex flex-col py-4 space-y-4">
              {displayMessages.map((message) => (
                message.id === SYNTHETIC_THINKING_ID ? (
                  <ThinkingTrace key={message.id} currentDetail={statusDetail} entries={thinkingTrace} expanded={thinkingExpanded} layoutMode={layoutMode} onToggle={() => setThinkingExpanded(c => !c)} />
                ) : (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    layoutMode={layoutMode}
                    streaming={message.id === latestAssistantId && busy}
                    animateOnAppear={message.id === latestAssistantId}
                    draftActions={diffAvailable && message.id === latestAssistantId ? { onApply: onApplyDraft, onOpenDiff } : undefined}
                  />
                )
              ))}
            </div>
          )}

          {diffPreview.length > 0 ? (
            <div id="nami-diff-preview" className="mt-4 pb-4">
              <div className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--nami-border)', background: 'var(--nami-surface)' }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(232, 121, 249, 0.15)' }}><FileIcon /></div>
                  <div>
                    <div className="font-medium" style={{ color: 'var(--nami-fg)' }}>{diffPreview.length} file{diffPreview.length === 1 ? '' : 's'} changed</div>
                    <div className="text-sm" style={{ color: 'var(--nami-muted)' }}>{plan?.summary || 'Review changes'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setChangesExpanded(!changesExpanded)} className="nami-button-secondary text-sm px-4 py-2">{changesExpanded ? 'Hide' : 'View'}</button>
                  <button type="button" onClick={onRejectDraft} className="nami-button-secondary text-sm px-4 py-2" style={{ borderColor: 'var(--nami-danger)' }}>Undo</button>
                  <button type="button" onClick={onApplyDraft} className="nami-button text-sm px-4 py-2">Apply</button>
                </div>
              </div>
              {changesExpanded && <div className="mt-3"><DiffViewer changes={diffPreview} onApply={onApplyDraft} onReject={onRejectDraft} compact={layoutMode !== 'regular'} /></div>}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <InputBox
          inputValue={inputValue} onInputChange={onInputChange}
          attachments={attachments} onAddImage={onAddImage} onRemoveImage={onRemoveImage}
          selectedModel={selectedModel} availableModels={availableModels} onModelChange={onModelChange}
          chatMode={chatMode} onChatModeChange={onChatModeChange}
          onSendMessage={onSendMessage} onStopMessage={onStopMessage}
          busy={busy} phase={phase} statusDetail={statusDetail} layoutMode={layoutMode}
        />
      </div>
    </section>
  );
}

const quickActions = [
  { label: 'Fix a bug', description: 'Find and fix issues', prompt: 'Find and fix the bug in the current file', icon: <BugIcon /> },
  { label: 'Build feature', description: 'Add new functionality', prompt: 'Create a new feature based on the current context', icon: <BoltIcon /> },
  { label: 'Explain code', description: 'Understand logic', prompt: 'Explain what this code does', icon: <ExplainIcon /> },
  { label: 'Run commands', description: 'Git, npm, build', prompt: 'Run npm install and start the dev server', icon: <TerminalIcon /> },
];

function NewChatIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3" strokeLinecap="round"/></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round"/></svg>; }
function BugIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 7.5a3 3 0 1 1 3 3v-3a3 3 0 1 1-6 0v-3a3 3 0 1 1 3-3z"/><path d="M7.5 10.5h9M7.5 14h9M6 8.8l2 1.2M18 8.8l-2 1.2M6 15.7l2-1.2M18 15.7l-2-1.2" strokeLinecap="round"/></svg>; }
function BoltIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13.2 3.5L6.5 12h4.7L10.8 20.5 17.5 12h-4.7l.4-8.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ExplainIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h6M9 17h4" strokeLinecap="round"/></svg>; }
function TerminalIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8l4 4-4 4M13 16h4" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function FileIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

export default memo(ChatPanel);
