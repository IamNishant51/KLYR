import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  method?: string;
  params?: unknown;
}

export interface McpClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpToolCallResult {
  content: string;
  raw: unknown;
}

export class McpClient {
  private readonly options: McpClientOptions;
  private process?: ChildProcessWithoutNullStreams;
  private requestId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
  private rawBuffer = Buffer.alloc(0);
  private started = false;

  constructor(options: McpClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.started) {
      return;
    }

    const proc = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...(this.options.env ?? {}),
      },
      shell: false,
      stdio: 'pipe',
    });

    this.process = proc;
    this.started = true;

    proc.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    proc.stderr.on('data', () => {
      // Ignore stderr noise from MCP servers.
    });
    proc.on('exit', () => {
      this.rejectAllPending(new Error('MCP server process exited.'));
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'klyr',
        version: '0.0.1',
      },
    });

    this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request('tools/list', {});
    if (!result || typeof result !== 'object') {
      return [];
    }

    const tools = (result as { tools?: unknown }).tools;
    if (!Array.isArray(tools)) {
      return [];
    }

    return tools
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        name: String(entry.name ?? '').trim(),
        description: typeof entry.description === 'string' ? entry.description : undefined,
        inputSchema: entry.inputSchema,
      }))
      .filter((tool) => tool.name.length > 0);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const result = await this.request('tools/call', {
      name,
      arguments: args,
    });

    const content = this.extractText(result);
    return {
      content,
      raw: result,
    };
  }

  dispose(): void {
    this.rejectAllPending(new Error('MCP client disposed.'));
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = undefined;
    this.started = false;
    this.rawBuffer = Buffer.alloc(0);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || !this.started) {
      return Promise.reject(new Error('MCP client is not connected.'));
    }

    const id = this.requestId++;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const timeoutMs = this.options.timeoutMs ?? 10000;

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out for method ${method}.`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.writeMessage(payload);
    });
  }

  private notify(method: string, params?: unknown): void {
    if (!this.process || !this.started) {
      return;
    }

    this.writeMessage({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  private writeMessage(payload: unknown): void {
    if (!this.process) {
      return;
    }

    const raw = JSON.stringify(payload);
    const message = `Content-Length: ${Buffer.byteLength(raw, 'utf8')}\r\n\r\n${raw}`;
    this.process.stdin.write(message, 'utf8');
  }

  private handleStdout(chunk: Buffer): void {
    this.rawBuffer = Buffer.concat([this.rawBuffer, chunk]);

    while (true) {
      const headerEnd = this.rawBuffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }

      const headerRaw = this.rawBuffer.subarray(0, headerEnd).toString('utf8');
      const match = headerRaw.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.rawBuffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number(match[1]);
      const totalLength = headerEnd + 4 + contentLength;
      if (this.rawBuffer.length < totalLength) {
        return;
      }

      const jsonRaw = this.rawBuffer.subarray(headerEnd + 4, totalLength).toString('utf8');
      this.rawBuffer = this.rawBuffer.subarray(totalLength);

      try {
        const parsed = JSON.parse(jsonRaw) as JsonRpcResponse;
        this.handleRpcMessage(parsed);
      } catch {
        // Ignore malformed messages.
      }
    }
  }

  private handleRpcMessage(message: JsonRpcResponse): void {
    if (typeof message.id !== 'number') {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private extractText(result: unknown): string {
    if (!result || typeof result !== 'object') {
      return '';
    }

    const content = (result as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return '';
    }

    const parts = content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return '';
        }
        const text = String((entry as Record<string, unknown>).text ?? '').trim();
        return text;
      })
      .filter((item) => item.length > 0);

    return parts.join('\n');
  }
}
