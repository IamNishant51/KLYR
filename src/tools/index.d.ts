export { ReadTool, readFileByVscode, type ReadToolInput, type ReadToolResult } from './read';
export { WriteTool, EditTool, type WriteToolInput, type WriteToolResult, type EditInput, type EditResult } from './write';
export { BashTool, BashSessionManager, type BashToolInput, type BashToolResult, type BashSession } from './bash';
export { GrepTool, type GrepToolInput, type GrepToolResult, type GrepMatch } from './grep';
export { ListTool, type ListToolInput, type ListToolResult, type FileInfo } from './ls';
export { NamiToolExecutor } from './executor';
export interface ToolCall {
    name: string;
    arguments: Record<string, unknown>;
    callId: string;
}
export interface ToolResult {
    callId: string;
    success: boolean;
    output: string;
    error?: string;
    durationMs: number;
}
export interface ToolSchema {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
    };
    category: 'file' | 'search' | 'bash' | 'edit';
}
export declare const NAMI_TOOLS: ToolSchema[];
export declare function formatToolsForPrompt(): string;
export declare function formatToolsAsJson(): string;
