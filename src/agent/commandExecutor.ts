import { spawn } from 'child_process';
import * as path from 'path';
import type { CommandStep } from './coder';

export interface CommandResult {
  command: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  error?: string;
}

export interface CommandExecutorOptions {
  onOutput?: (command: string, line: string) => void;
  onComplete?: (result: CommandResult) => void;
}

export class CommandExecutor {
  private readonly options: CommandExecutorOptions;

  constructor(options: CommandExecutorOptions = {}) {
    this.options = options;
  }

  async execute(command: CommandStep, cwd: string): Promise<CommandResult> {
    const startTime = Date.now();
    const result: CommandResult = {
      command: command.command,
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      duration: 0,
    };

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const shellArgs = isWindows ? ['/c', command.command] : ['-c', command.command];

      const timeout = (command.timeout ?? 120) * 1000;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        result.error = `Command timed out after ${command.timeout ?? 120} seconds`;
        result.duration = Date.now() - startTime;
        proc.kill('SIGTERM');
      }, timeout);

      const proc = spawn(shell, shellArgs, {
        cwd: command.cwd || cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout?.on('data', (data: Buffer) => {
        const line = data.toString();
        result.stdout += line;
        this.options.onOutput?.(command.command, line);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString();
        result.stderr += line;
        this.options.onOutput?.(command.command, line);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        result.exitCode = code ?? 0;
        result.success = !timedOut && (code ?? 0) === 0;
        result.duration = Date.now() - startTime;

        if (timedOut) {
          result.success = false;
        }

        if (command.allowFailure && !result.success) {
          console.warn(`[KLYR] Command "${command.command}" failed but allowing failure:`, result.stderr);
        }

        this.options.onComplete?.(result);
        resolve(result);
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        result.error = error.message;
        result.duration = Date.now() - startTime;
        this.options.onComplete?.(result);
        resolve(result);
      });
    });
  }

  async executeAll(
    commands: CommandStep[],
    cwd: string
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const cmd of commands) {
      console.log(`[KLYR] Executing: ${cmd.command}`);
      const result = await this.execute(cmd, cwd);
      results.push(result);

      if (!result.success && !cmd.allowFailure) {
        console.error(`[KLYR] Command failed (exit ${result.exitCode}): ${cmd.command}`);
        if (result.stderr) {
          console.error(`[KLYR] Stderr: ${result.stderr}`);
        }
        break;
      }
    }

    return results;
  }
}

export function parseInlineCommands(text: string): CommandStep[] {
  const commands: CommandStep[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comment lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check for common command patterns
    const commandPatterns = [
      /^((?:npm|pnpm|yarn|npx)\s+(?:install|run|dev|build|test|lint|start|add|remove|uninstall)(?:\s+.*)?$)/,
      /^(git\s+(?:init|add|commit|push|pull|clone|checkout|branch|merge|status|log)(?:\s+.*)?$)/,
      /^(mkdir|rm|cp|mv|rmdir|ls|cd)\s+.+$/,
    ];

    for (const pattern of commandPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        commands.push({
          command: match[1],
          description: `Inline command: ${match[1]}`,
          allowFailure: false,
        });
        break;
      }
    }
  }

  return commands;
}
