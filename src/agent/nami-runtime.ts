import {
  NamiToolExecutor,
  formatToolsForPrompt,
  ToolCall,
  ToolResult,
} from '../tools';
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

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 20,
  toolTimeoutMs: 180000,
  includeContext: true,
};

export class NamiRuntime {
  private session: AgentSession;
  private context: AgentContext;
  private config: AgentConfig;
  private executor: NamiToolExecutor;
  private onLog: (message: string) => void;
  private onStatusChange: (status: string, detail?: string) => void;
  private onToolResult: (result: ToolResult) => void;

  constructor(
    context: AgentContext,
    options: Partial<AgentConfig> = {},
    callbacks: {
      onLog?: (message: string) => void;
      onStatusChange?: (status: string, detail?: string) => void;
      onToolResult?: (result: ToolResult) => void;
    } = {}
  ) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.session = {
      id: `nami-${Date.now()}`,
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.executor = new NamiToolExecutor(context.workspaceRoot);
    this.onLog = callbacks.onLog ?? (() => {});
    this.onStatusChange = callbacks.onStatusChange ?? (() => {});
    this.onToolResult = callbacks.onToolResult ?? (() => {});
  }

  getToolsPrompt(): string {
    return formatToolsForPrompt();
  }

  getSystemPrompt(): string {
    const tools = this.getToolsPrompt();
    return `You are Nami, a coding agent. You help developers build projects by reading files, writing code, and running shell commands.

Your capabilities:
${tools}

Guidelines:
1. Always read files before modifying them
2. Run build/tests after making changes
3. Explain what you're doing clearly
4. Use the most appropriate tool for each task
5. If a command fails, analyze the error and try to fix it
6. Keep changes focused and incremental

Current workspace: ${this.context.workspaceRoot}
${this.context.activeFile ? `Active file: ${this.context.activeFile}` : ''}
`;
  }

  async executeToolCall(call: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();
    this.onStatusChange('tool', `Running ${call.name}...`);
    
    try {
      const result = await this.executor.execute(call, this.context.workspaceRoot);
      this.onToolResult(result);
      return result;
    } catch (error) {
      return {
        callId: call.callId,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  async processUserMessage(
    userMessage: string,
    llmChatFn: (messages: AgentMessage[]) => Promise<string>
  ): Promise<string> {
    this.session.messages.push({
      role: 'user',
      content: userMessage,
    });

    let assistantResponse = '';
    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;
      this.session.lastActivity = Date.now();
      this.onStatusChange('thinking', `Processing request (${iteration}/${this.config.maxIterations})...`);

      const messages = [
        { role: 'system' as const, content: this.getSystemPrompt() },
        ...this.session.messages,
      ];

      const response = await llmChatFn(messages);
      assistantResponse += response;

      this.session.messages.push({
        role: 'assistant',
        content: response,
      });

      const toolCalls = this.parseToolCalls(response);
      if (toolCalls.length === 0) {
        break;
      }

      for (const call of toolCalls) {
        this.onStatusChange('tool', `Executing ${call.name}...`);
        const result = await this.executeToolCall(call);
        
        this.session.messages.push({
          role: 'assistant',
          content: '',
          toolResults: [result],
        });
      }
    }

    this.onStatusChange('idle');
    return assistantResponse;
  }

  private parseToolCalls(response: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const regex = /<tool_call>\s*("?name"?\s*:\s*"([^"]+)")?\s*("?arguments"?\s*:\s*(\{[^}]+\}))?\s*<\/tool_call>/gi;
    
    let match;
    while ((match = regex.exec(response)) !== null) {
      const name = match[2];
      const argsStr = match[4];
      
      if (name) {
        let args: Record<string, unknown> = {};
        try {
          if (argsStr) {
            args = JSON.parse(argsStr);
          }
        } catch {
          args = {};
        }
        
        calls.push({
          name,
          arguments: args,
          callId: `call-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });
      }
    }

    return calls;
  }

  getSession(): AgentSession {
    return this.session;
  }

  clearSession(): void {
    this.session.messages = [];
  }
}

export function createAgentContext(
  workspaceRoot: string,
  config: NamiConfig,
  options: {
    activeFile?: string;
    selection?: string;
    openFiles?: string[];
    documents?: ContextDocument[];
    workspaceSummary?: string;
  } = {}
): AgentContext {
  return {
    workspaceRoot,
    activeFile: options.activeFile,
    selection: options.selection,
    openFiles: options.openFiles ?? [],
    documents: options.documents ?? [],
    workspaceSummary: options.workspaceSummary ?? '',
    config,
  };
}
