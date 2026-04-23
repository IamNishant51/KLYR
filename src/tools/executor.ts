import { ReadTool, WriteTool, EditTool, BashTool, GrepTool, ListTool, type ToolCall, type ToolResult } from './index';

type EditOpType = 'replace' | 'insert' | 'delete';

export class NamiToolExecutor {
  private readTool: ReadTool;
  private writeTool: WriteTool;
  private editTool: EditTool;
  private bashTool: BashTool;
  private grepTool: GrepTool;
  private lsTool: ListTool;

  constructor(workspaceRoot: string) {
    this.readTool = new ReadTool(workspaceRoot);
    this.writeTool = new WriteTool(workspaceRoot);
    this.editTool = new EditTool(workspaceRoot);
    this.bashTool = new BashTool(workspaceRoot);
    this.grepTool = new GrepTool(workspaceRoot);
    this.lsTool = new ListTool(workspaceRoot);
  }

  async execute(call: ToolCall, workspaceRoot: string): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      let result: unknown;

      switch (call.name.toLowerCase()) {
        case 'read':
          result = await this.readTool.execute({
            path: String(call.arguments.path ?? ''),
            offset: call.arguments.offset as number | undefined,
            limit: call.arguments.limit as number | undefined,
          });
          break;

        case 'write':
          result = await this.writeTool.execute({
            path: String(call.arguments.path ?? ''),
            content: String(call.arguments.content ?? ''),
            createDirectories: Boolean(call.arguments.createDirectories),
          });
          break;

        case 'edit': {
          const ops = call.arguments.operations;
          const operations = Array.isArray(ops) ? ops : [];
          const validOps: EditOpType[] = ['replace', 'insert', 'delete'];
          result = await this.editTool.execute({
            path: String(call.arguments.path ?? ''),
            operations: operations.map((op: any) => {
              const opType = validOps.includes(op.type as EditOpType) ? op.type : 'insert';
              return {
                type: opType as EditOpType,
                startLine: Number(op.startLine ?? op.start_line ?? 0),
                endLine: op.endLine != null ? Number(op.endLine ?? op.end_line) : undefined,
                content: op.content != null ? String(op.content) : undefined,
              };
            }),
          });
          break;
        }

        case 'bash': {
          const timeoutMs = call.arguments.timeoutMs ?? call.arguments.timeout;
          result = await this.bashTool.execute({
            command: String(call.arguments.command ?? ''),
            cwd: call.arguments.cwd != null ? String(call.arguments.cwd) : undefined,
            timeoutMs: timeoutMs != null ? Number(timeoutMs) : undefined,
            env: call.arguments.env as Record<string, string> | undefined,
          });
          break;
        }

        case 'grep': {
          const maxResults = call.arguments.maxResults ?? call.arguments.max_results;
          result = await this.grepTool.execute({
            query: String(call.arguments.query ?? ''),
            path: call.arguments.path as string | undefined,
            filePattern: (call.arguments.filePattern ?? call.arguments.file_pattern) as string | undefined,
            caseSensitive: Boolean(call.arguments.caseSensitive ?? call.arguments.case_sensitive),
            regex: Boolean(call.arguments.regex),
            context: call.arguments.context as number | undefined,
            maxResults: maxResults != null ? Number(maxResults) : undefined,
          });
          break;
        }

        case 'ls': {
          const sortBy = call.arguments.sortBy ?? call.arguments.sort_by;
          const validSort = ['name', 'size', 'modified'];
          result = await this.lsTool.execute({
            path: call.arguments.path as string | undefined,
            showHidden: Boolean(call.arguments.showHidden ?? call.arguments.show_hidden),
            showDetails: Boolean(call.arguments.showDetails ?? call.arguments.show_details),
            sortBy: sortBy != null && validSort.includes(String(sortBy)) ? String(sortBy) as 'name' | 'size' | 'modified' : undefined,
          });
          break;
        }

        default:
          return {
            callId: call.callId,
            success: false,
            output: '',
            error: `Unknown tool: ${call.name}`,
            durationMs: Date.now() - startTime,
          };
      }

      const output = this.formatResult(result);
      const success = this.isSuccess(result);
      
      return {
        callId: call.callId,
        success,
        output,
        durationMs: Date.now() - startTime,
      };
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

  private formatResult(result: unknown): string {
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      
      if ('success' in r && typeof r.success === 'boolean') {
        if (!r.success) {
          return `Error: ${r.error ?? 'Unknown error'}\n\n${JSON.stringify(result, null, 2)}`;
        }
        
        if ('stdout' in r) {
          const parts: string[] = [];
          if (r.stdout) parts.push(String(r.stdout));
          if (r.stderr) parts.push(`STDERR:\n${r.stderr}`);
          parts.push(`Exit code: ${r.exitCode ?? 0}`);
          return parts.filter(Boolean).join('\n');
        }
        
        if ('matches' in r && Array.isArray(r.matches)) {
          if (r.matches.length === 0) return 'No matches found.';
          return r.matches.map((m: any) => `${m.file}:${m.line}: ${m.content}`).join('\n');
        }
        
        if ('items' in r && Array.isArray(r.items)) {
          return r.items.map((i: any) => `${i.type === 'directory' ? 'd' : 'f'} ${i.name}`).join('\n');
        }
        
        if ('content' in r) return String(r.content);
        if ('path' in r) return `Success: ${r.path ?? 'Operation completed'}`;
      }
      
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  }

  private isSuccess(result: unknown): boolean {
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      if ('success' in r) return Boolean(r.success);
      if ('exitCode' in r) return r.exitCode === 0;
      if ('path' in r && 'bytesWritten' in r) return true;
    }
    return true;
  }
}
