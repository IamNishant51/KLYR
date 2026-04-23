import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, type ExecException } from 'child_process';

export interface Tool {
  id: string;
  name: string;
  description: string;
  usage: string;
}

export interface ToolUseRequest {
  toolId: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export const AVAILABLE_TOOLS: Tool[] = [
  {
    id: 'read_file',
    name: 'Read File',
    description: 'Read the full content of a file from the workspace.',
    usage: '{"toolId": "read_file", "input": {"path": "src/file.ts"}}',
  },
  {
    id: 'list_files',
    name: 'List Files',
    description: 'List all files in a directory recursively.',
    usage: '{"toolId": "list_files", "input": {"directory": "src"}}',
  },
  {
    id: 'search_files',
    name: 'Search Files',
    description: 'Search for files matching a pattern.',
    usage: '{"toolId": "search_files", "input": {"pattern": "*.ts", "maxResults": 10}}',
  },
  {
    id: 'grep_search',
    name: 'Grep Search',
    description: 'Search for a specific string or regex across the entire workspace.',
    usage: '{"toolId": "grep_search", "input": {"query": "function handleRequest", "caseSensitive": false}}',
  },
  {
    id: 'execute_command',
    name: 'Execute Command',
    description: 'Run a shell command in the workspace terminal and read the output.',
    usage: '{"toolId": "execute_command", "input": {"command": "npm test", "cwd": "src"}}',
  },
  {
    id: 'check_syntax',
    name: 'Check Syntax',
    description: 'Check if proposed code has syntax errors.',
    usage:
      '{"toolId": "check_syntax", "input": {"code": "const x = 1;", "language": "typescript"}}',
  },
  {
    id: 'check_imports',
    name: 'Check Imports',
    description: 'Check if imports in code are available.',
    usage:
      '{"toolId": "check_imports", "input": {"code": "import lodash from lodash;", "language": "typescript"}}',
  },
];

export class ToolExecutor {
  async execute(request: ToolUseRequest, workspaceRoot: string): Promise<ToolResult> {
    const input = request.input;
    switch (request.toolId) {
      case 'read_file':
        return this.readOpenFile(this.getString(input.path), workspaceRoot);
      case 'list_files':
        return this.listDir(this.getString(input.directory), workspaceRoot);
      case 'search_files':
        return this.search(this.getString(input.pattern), workspaceRoot);
      case 'grep_search':
        return this.grep(this.getString(input.query), workspaceRoot);
      case 'execute_command':
        return this.runCmd(
          this.getString(input.command),
          this.getOptionalString(input.cwd),
          workspaceRoot
        );
      case 'check_syntax':
        return this.checkSyntax(this.getString(input.code), this.getString(input.language));
      case 'check_imports':
        return { success: true, output: 'Import checking not yet implemented' };
      default:
        return { success: false, error: `Tool ${request.toolId} not implemented.` };
    }
  }

  private getString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  }

  private getOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    return undefined;
  }

  private getOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    return undefined;
  }

  private async readOpenFile(filePath: string, root: string): Promise<ToolResult> {
    try {
      const abs = filePath.startsWith('/') ? filePath : path.resolve(root, filePath);
      const content = await fs.readFile(abs, 'utf-8');
      return { success: true, output: content };
    } catch (e: unknown) {
      const error = e as { message?: string };
      return { success: false, error: error.message ?? String(e) };
    }
  }

  private async listDir(dir: string, root: string): Promise<ToolResult> {
    try {
      const abs = dir.startsWith('/') ? dir : path.resolve(root, dir);
      const files = await fs.readdir(abs, { recursive: true });
      return { success: true, output: files };
    } catch (e: unknown) {
      const error = e as { message?: string };
      return { success: false, error: error.message ?? String(e) };
    }
  }

  private async search(pattern: string, root: string): Promise<ToolResult> {
    try {
      const glob = require('glob');
      const files = await glob.glob(pattern, { cwd: root });
      return { success: true, output: files };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private async grep(query: string, root: string): Promise<ToolResult> {
    try {
      const promiseExec = (cmd: string) => new Promise<string>((res, rej) => {
        exec(cmd, { cwd: root }, (err: ExecException | null, stdout: string) =>
          err ? rej(err) : res(stdout)
        );
      });
      const results = await promiseExec(`grep -r "${query}" .`);
      return { success: true, output: results };
    } catch (e: unknown) {
      const error = e as { message?: string };
      return { success: false, error: error.message ?? String(e) };
    }
  }

  private async runCmd(cmd: string, cwd: string | undefined, root: string): Promise<ToolResult> {
    try {
      const promiseExec = (command: string) => new Promise<string>((res, rej) => {
        exec(command, { cwd: path.resolve(root, cwd ?? '.') }, (err: ExecException | null, stdout: string, stderr: string) => {
          if (err) rej(stderr || err.message);
          else res(stdout);
        });
      });
      const output = await promiseExec(cmd);
      return { success: true, output };
    } catch (e: unknown) {
      const error = e as { message?: string };
      return { success: false, error: error.message ?? String(e) };
    }
  }

  private checkSyntax(code: string, language: string): ToolResult {
    if (!code) {
      return { success: false, error: 'No code provided' };
    }
    
    const lang = (language || 'javascript').toLowerCase();
    
    if (lang === 'typescript' || lang === 'javascript' || lang === 'js' || lang === 'ts') {
      try {
        new Function(code);
        return { success: true, output: 'No syntax errors detected' };
      } catch (e: unknown) {
        const error = e as { message?: string };
        return { success: false, error: error.message ?? String(e) };
      }
    }
    
    if (lang === 'python' || lang === 'py') {
      try {
        import('child_process').then(({ execSync }) => {
          execSync(`python3 -m py_compile -c "${code.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
        });
        return { success: true, output: 'No syntax errors detected' };
      } catch (e: unknown) {
        const error = e as { message?: string };
        return { success: false, error: error.message ?? String(e) };
      }
    }
    
    return { success: true, output: `Syntax check not implemented for ${language}` };
  }
}

export class NoopToolExecutor extends ToolExecutor {
  override async execute(_: ToolUseRequest, _workspaceRoot: string): Promise<ToolResult> {
    return {
      success: false,
      error: 'Tool execution not implemented.',
    };
  }
}
