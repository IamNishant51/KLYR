import { ToolCall, ToolResult } from '../tools';
import type { ContextDocument } from '../context/contextEngine';
import type { NamiConfig } from '../core/config';
export interface AgentMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}
export interface AgentSession {
    id: string;
    messages: AgentMessage[];
    createdAt: number;
    lastActivity: number;
}
export interface AgentContext {
    workspaceRoot: string;
    activeFile?: string;
    selection?: string;
    openFiles: string[];
    documents: ContextDocument[];
    workspaceSummary: string;
    config: NamiConfig;
}
export interface AgentConfig {
    maxIterations: number;
    toolTimeoutMs: number;
    includeContext: boolean;
}
export declare class NamiRuntime {
    private session;
    private context;
    private config;
    private executor;
    private onLog;
    private onStatusChange;
    private onToolResult;
    constructor(context: AgentContext, options?: Partial<AgentConfig>, callbacks?: {
        onLog?: (message: string) => void;
        onStatusChange?: (status: string, detail?: string) => void;
        onToolResult?: (result: ToolResult) => void;
    });
    getToolsPrompt(): string;
    getSystemPrompt(): string;
    executeToolCall(call: ToolCall): Promise<ToolResult>;
    processUserMessage(userMessage: string, llmChatFn: (messages: AgentMessage[]) => Promise<string>): Promise<string>;
    private parseToolCalls;
    getSession(): AgentSession;
    clearSession(): void;
}
export declare function createAgentContext(workspaceRoot: string, config: NamiConfig, options?: {
    activeFile?: string;
    selection?: string;
    openFiles?: string[];
    documents?: ContextDocument[];
    workspaceSummary?: string;
}): AgentContext;
