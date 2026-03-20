import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import ChatPanel from './components/ChatPanel';
import { buildGhostSuggestion, deriveUiPhase, isBusyPhase } from './lib/chat';
import type {
  ChatImageAttachment,
  ChatMessage,
  ContextReference,
  DiffChange,
  ExtensionStatus,
  Plan,
  ThinkingTraceEntry,
} from './types';

export type PanelLayoutMode = 'narrow' | 'compact' | 'regular';

declare global {
  interface Window {
    acquireVsCodeApi?: () => any;
    vscode?: any;
  }
}

function getVsCodeApi() {
  if (window.vscode) {
    return window.vscode;
  }

  if (typeof window.acquireVsCodeApi === 'function') {
    window.vscode = window.acquireVsCodeApi();
  }

  return window.vscode;
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMode, setChatMode] = useState<'agent' | 'plan'>('agent');
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [contextRefs, setContextRefs] = useState<ContextReference[]>([]);
  const [diffPreview, setDiffPreview] = useState<DiffChange[]>([]);
  const [thinkingTrace, setThinkingTrace] = useState<ThinkingTraceEntry[]>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const vscodeRef = useRef(getVsCodeApi());
  const lastThinkingKeyRef = useRef('');
  const deferredMessages = useDeferredValue(messages);
  const phase = deriveUiPhase(extensionStatus, statusDetail);
  const busy = isBusyPhase(phase);
  const ghostSuggestion = buildGhostSuggestion(diffPreview, messages);
  const layoutMode: PanelLayoutMode =
    viewportWidth > 0 && viewportWidth < 520
      ? 'narrow'
      : viewportWidth > 0 && viewportWidth < 860
      ? 'compact'
      : 'regular';

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const updateWidth = () => {
      setViewportWidth(root.getBoundingClientRect().width);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(root);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const vscode = vscodeRef.current;
    if (!vscode) {
      return;
    }

    vscode.postMessage({ type: 'models:fetch' });

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'models:list') {
        const models = Array.isArray(message.payload) ? message.payload : [];
        startTransition(() => {
          setAvailableModels(models);
          setSelectedModel((currentModel) =>
            models.length > 0 && !models.includes(currentModel) ? models[0] : currentModel
          );
        });
        return;
      }

      if (message.type === 'state:update') {
        const state = message.payload ?? {};
        const nextStatus = (state.status ?? 'idle') as ExtensionStatus;
        const nextStatusDetail = String(state.statusDetail ?? '');

        if (
          nextStatus !== 'idle' &&
          nextStatus !== 'review' &&
          nextStatusDetail.trim()
        ) {
          const traceKey = `${nextStatus}:${nextStatusDetail}`;
          if (lastThinkingKeyRef.current !== traceKey) {
            lastThinkingKeyRef.current = traceKey;
            setThinkingTrace((previousTrace) => [
              ...previousTrace.slice(-7),
              {
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                status: nextStatus,
                detail: nextStatusDetail,
                createdAt: Date.now(),
              },
            ]);
          }
        }

        startTransition(() => {
          if (Array.isArray(state.messages)) {
            setMessages(state.messages);
          }
          setExtensionStatus(nextStatus);
          setStatusDetail(nextStatusDetail);
          setPlan(state.plan ?? null);
          setContextRefs(Array.isArray(state.contextRefs) ? state.contextRefs : []);
          setDiffPreview(Array.isArray(state.diffPreview) ? state.diffPreview : []);
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSendMessage = () => {
    const prompt = inputValue.trim();
    if ((!prompt && attachments.length === 0) || busy) {
      return;
    }

    const attachmentHint =
      attachments.length > 0
        ? `\n\n[attached image${attachments.length === 1 ? '' : 's'}: ${attachments.length}]`
        : '';

    const optimisticMessage: ChatMessage = {
      id: `${Date.now()}`,
      role: 'user',
      content: `${prompt}${attachmentHint}`.trim(),
      createdAt: Date.now(),
    };

    startTransition(() => {
      setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
      setExtensionStatus('thinking');
      setStatusDetail('Handing your request to Klyr.');
      setThinkingTrace([]);
    });
    lastThinkingKeyRef.current = '';
    setInputValue('');
    setAttachments([]);

    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({
        type: 'chat:submit',
        payload: {
          prompt,
          modeHint: chatMode === 'agent' ? 'edit' : 'chat',
          images: attachments,
        },
        config: { selectedModel },
      });
    }
  };

  const handleAddImage = (attachment: ChatImageAttachment) => {
    setAttachments((current) => [...current, attachment].slice(-3));
  };

  const handleRemoveImage = (id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  };

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({
        type: 'config:update',
        payload: { selectedModel: newModel },
      });
    }
  };

  const handleStopMessage = () => {
    if (!busy) {
      return;
    }

    startTransition(() => {
      setExtensionStatus('idle');
      setStatusDetail('Stopped.');
    });

    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'chat:stop' });
    }
  };

  const handleOpenSettings = () => {
    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'settings:open' });
    }
  };

  const handleOpenHistory = () => {
    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'chat:history' });
    }
  };

  const handleNewChat = () => {
    startTransition(() => {
      setMessages([]);
      setExtensionStatus('idle');
      setStatusDetail('');
      setPlan(null);
      setContextRefs([]);
      setDiffPreview([]);
      setThinkingTrace([]);
    });
    lastThinkingKeyRef.current = '';

    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'chat:clear' });
    }
  };

  const handleApplyDraft = () => {
    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'diff:decision', payload: 'accept' });
    }
  };

  const handleRejectDraft = () => {
    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'diff:decision', payload: 'reject' });
    }
  };

  const handleOpenDiff = () => {
    const diffSection = document.getElementById('klyr-diff-preview');
    diffSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div ref={rootRef} className="klyr-shell h-screen w-full">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatPanel
          messages={deferredMessages}
          phase={phase}
          statusDetail={statusDetail}
          plan={plan}
          contextRefs={contextRefs}
          diffPreview={diffPreview}
          ghostSuggestion={ghostSuggestion}
          thinkingTrace={thinkingTrace}
          inputValue={inputValue}
          onInputChange={setInputValue}
          attachments={attachments}
          onAddImage={handleAddImage}
          onRemoveImage={handleRemoveImage}
          selectedModel={selectedModel}
          availableModels={availableModels}
          onModelChange={handleModelChange}
          chatMode={chatMode}
          onChatModeChange={setChatMode}
          onSendMessage={handleSendMessage}
          onStopMessage={handleStopMessage}
          onOpenHistory={handleOpenHistory}
          onOpenSettings={handleOpenSettings}
          onNewChat={handleNewChat}
          onApplyDraft={handleApplyDraft}
          onRejectDraft={handleRejectDraft}
          onOpenDiff={handleOpenDiff}
          diffAvailable={diffPreview.length > 0}
          layoutMode={layoutMode}
        />
      </div>
    </div>
  );
}

export default App;
