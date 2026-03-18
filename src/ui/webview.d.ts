export type UiStatus = 'idle' | 'planning' | 'retrieving' | 'thinking' | 'validating' | 'review' | 'executing';
export interface UiChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: number;
}
export interface UiPlan {
    intent: string;
    goal: string;
    summary: string;
    steps: string[];
    requiresWrite: boolean;
    guardrails: string[];
}
export interface UiContextReference {
    path: string;
    source: string;
}
export interface UiDiffChange {
    path: string;
    diff: string;
    diffHtml?: string;
    summary: string;
    operation: 'create' | 'update' | 'delete';
    additions: number;
    deletions: number;
}
export interface WebviewState {
    messages: UiChatMessage[];
    status: UiStatus;
    statusDetail?: string;
    plan?: UiPlan;
    contextRefs: UiContextReference[];
    diffPreview?: UiDiffChange[];
    totalAdditions?: number;
    totalDeletions?: number;
}
export declare function buildWebviewHtml(nonce: string, state?: WebviewState): string;
