import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import ChatPanel from './components/ChatPanel';
import { deriveUiPhase, isBusyPhase } from './lib/chat';
import type {
  ChatMessage,
  ExtensionStatus,
} from './types';

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
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [viewportWidth, setViewportWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const vscodeRef = useRef(getVsCodeApi());
  const deferredMessages = useDeferredValue(messages);
  const phase = deriveUiPhase(extensionStatus, statusDetail);
  const busy = isBusyPhase(phase);
  const compact = viewportWidth > 0 && viewportWidth < 980;

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
        startTransition(() => {
          if (Array.isArray(state.messages)) {
            setMessages(state.messages);
          }
          setExtensionStatus(state.status ?? 'idle');
          setStatusDetail(state.statusDetail ?? '');
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSendMessage = () => {
    const prompt = inputValue.trim();
    if (!prompt || busy) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    };

    startTransition(() => {
      setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
      setExtensionStatus('thinking');
      setStatusDetail('Handing your request to Klyr.');
    });
    setInputValue('');

    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({
        type: 'chat:submit',
        payload: prompt,
        config: { selectedModel },
      });
    }
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

  const handleNewChat = () => {
    startTransition(() => {
      setMessages([]);
      setExtensionStatus('idle');
      setStatusDetail('');
    });

    const vscode = vscodeRef.current;
    if (vscode) {
      vscode.postMessage({ type: 'chat:clear' });
    }
  };

  return (
    <div ref={rootRef} className="klyr-shell h-screen w-full">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatPanel
          messages={deferredMessages}
          phase={phase}
          statusDetail={statusDetail}
          inputValue={inputValue}
          onInpu