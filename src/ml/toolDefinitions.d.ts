/**
 * Tool definitions for LangChain integration.
 * Defines all available tools with JSON schemas for LLM-based tool selection.
 */
export interface ToolSchema {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
    };
    category: 'file' | 'search' | 'analysis' | 'refactor';
}
export declare const KLYR_TOOLS: ToolSchema[];
/**
 * Get tools suitable for a specific intent
 */
export declare function getToolsForIntent(intent: string): ToolSchema[];
/**
 * Format tools for LLM context
 */
export declare function formatToolsForContext(tools: ToolSchema[]): string;
