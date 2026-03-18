export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface KlyrConfig {
  logLevel: LogLevel;
  ollama: OllamaConfig;
  context: ContextConfig;
  execution: ExecutionConfig;
  inline: InlineCompletionConfig;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
}

export interface ContextConfig {
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
  retrievalMaxResults: number;
  retrievalMinScore: number;
}

export interface ExecutionConfig {
  maxAttempts: number;
  noOp: boolean;
}

export interface InlineCompletionConfig {
  enabled: boolean;
  maxPrefixChars: number;
  maxSuffixChars: number;
}

export function defaultConfig(): KlyrConfig {
  return {
    logLevel: 'info',
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5-coder',
      temperature: 0,
      timeoutMs: 180000,
      maxRetries: 2,
      retryBackoffMs: 800,
    },
    context: {
      maxFiles: 120,
      maxFileSize: 200 * 1024,
      maxTotalSize: 500 * 1024,
      retrievalMaxResults: 8,
      retrievalMinScore: 0,
    },
    execution: {
      maxAttempts: 2,
      noOp: false,
    },
    inline: {
      enabled: true,
      maxPrefixChars: 2500,
      maxSuffixChars: 1200,
    },
  };
}

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.level);
    const logIndex = levels.indexOf(level);
    return logIndex >= currentIndex;
  }
}
