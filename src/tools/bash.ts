import { spawn } from 'child_process';

export interface BashToolInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface BashToolResult {
  success: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

export class BashTool {
  constructor(private defaultCwd: string) {}

  async execute(input: BashToolInput): Promise<BashToolResult> {
    const startTime = Date.now();
    const cwd = input.cwd ?? this.defaultCwd;
    const timeout = input.timeoutMs ?? 180000;

    const env = { ...process.env, ...input.env };

    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
      const args = process.platform === 'win32'
        ? ['/d', '/s', '/c', input.command]
        : ['-lc', input.command];

      const child = spawn(shell, args, {
        cwd,
        env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
      }, timeout);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        resolve({
          success: code === 0 && !killed,
          command: input.command,
          exitCode: code ?? -1,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs,
          error: killed ? 'Command timed out' : undefined,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          command: input.command,
          exitCode: -1,
          stdout: '',
          stderr: '',
          durationMs: Date.now() - startTime,
          error: error.message,
        });
      });
    });
  }
}

export interface BashSession {
  id: string;
  cwd: string;
  history: BashToolResult[];
}

export class BashSessionManager {
  private sessions = new Map<string, BashSession>();

  create(id: string, cwd: string): BashSession {
    const session: BashSession = { id, cwd, history: [] };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): BashSession | undefined {
    return this.sessions.get(id);
  }

  addResult(id: string, result: BashToolResult): void {
    const session = this.sessions.get(id);
    if (session) {
      session.history.push(result);
    }
  }

  destroy(id: string): void {
    this.sessions.delete(id);
  }
}
