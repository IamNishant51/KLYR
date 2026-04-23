import { type ToolCall, type ToolResult } from './index';
export declare class NamiToolExecutor {
    private readTool;
    private writeTool;
    private editTool;
    private bashTool;
    private grepTool;
    private lsTool;
    constructor(workspaceRoot: string);
    execute(call: ToolCall, workspaceRoot: string): Promise<ToolResult>;
    private formatResult;
    private isSuccess;
}
