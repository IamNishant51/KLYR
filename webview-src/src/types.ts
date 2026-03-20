export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  isStreaming?: boolean;
}

export interface ChatImageAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
  name?: string;
}

export interface Plan {
  intent: string;
  goal: string;
  summary: string;
  steps: string[];
  requiresWrite: boolean;
  guardrails: string[];
}

export interface ContextReference {
  path: string;
  source: string;
}

export interface DiffChange {
  path: string;
  diff: string;
  summary: string;
  operation: 'create' | 'update' | 'delete';
}

export interface ThinkingTraceEntry {
  id: string;
  status: ExtensionStatus;
  detail: string;
  createdAt: number;
}

export type ExtensionStatus =
  | 'idle'
  | 'planning'
  | 'retrieving'
  | 'thinking'
  | 'validating'
  | 'review'
  | 'executing';

export type UiPhase =
  | 'idle'
  | 'thinking'
  | 'generating'
  | 'validating'
  | 'ready'
  | 'executing'
  | 'error';

export type InspectorTab = 'ghost' | 'plan' | 'context' | 'diff';

export interface GhostSuggestion {
  title: string;
  preview: string;
  source: string;
  hint: string;
  canApplyDraft: boolean;
}
