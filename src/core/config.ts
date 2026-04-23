export interface NamiConfig {
  ollama: {
    baseUrl: string;
    model: string;
    fastModel: string;
    visionModel: string;
    temperature: number;
    timeoutMs: number;
    maxRetries: number;
    retryBackoffMs: number;
    maxTokens: number;
    stream: boolean;
  };
  context: {
    maxFiles: number;
    maxFileSize: number;
    maxTotalSize: number;
    retrievalMaxResults: number;
    retrievalMinScore: number;
    useSummary: boolean;
    maxContextChunks: number;
    chunkOverlap: number;
    chunkSize: number;
  };
  execution: {
    maxAttempts: number;
    noOp: boolean;
  };
  inline: {
    enabled: boolean;
    maxPrefixChars: number;
    maxSuffixChars: number;
  };
  mcp: {
    enabled: boolean;
    servers: McpServerConfig[];
  };
  rag: {
    strictCitations: boolean;
    trustedDomains: string[];
    trustedGitHubOrgs: string[];
  };
  optimization: {
    enableCaching: boolean;
    compressContext: boolean;
    fastMode: boolean;
  };
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  enabled: boolean;
  timeoutMs: number;
}

export function defaultConfig(): NamiConfig {
  return {
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5-coder',
      fastModel: 'qwen2.5-coder:2b',
      visionModel: 'llava:latest',
      temperature: 0,
      timeoutMs: 60000,
      maxRetries: 2,
      retryBackoffMs: 800,
      maxTokens: 4096,
      stream: true,
    },
    context: {
      maxFiles: 50,
      maxFileSize: 102400,
      maxTotalSize: 204800,
      retrievalMaxResults: 5,
      retrievalMinScore: 0.3,
      useSummary: true,
      maxContextChunks: 10,
      chunkOverlap: 50,
      chunkSize: 500,
    },
    execution: {
      maxAttempts: 2,
      noOp: false,
    },
    inline: {
      enabled: true,
      maxPrefixChars: 1500,
      maxSuffixChars: 800,
    },
    mcp: {
      enabled: false,
      servers: [],
    },
    rag: {
      strictCitations: false,
      trustedDomains: [
        'github.com',
        'raw.githubusercontent.com',
        'developer.mozilla.org',
      ],
      trustedGitHubOrgs: [],
    },
    optimization: {
      enableCaching: true,
      compressContext: true,
      fastMode: false,
    },
  };
}

export class Logger {
  constructor(private level: 'debug' | 'info' | 'warn' | 'error' = 'info') {}

  debug(message: string): void {
    if (this.level === 'debug') console.debug(`[Nami] ${message}`);
  }

  info(message: string): void {
    if (['debug', 'info'].includes(this.level)) console.info(`[Nami] ${message}`);
  }

  warn(message: string): void {
    if (['debug', 'info', 'warn'].includes(this.level)) console.warn(`[Nami] ${message}`);
  }

  error(message: string): void {
    console.error(`[Nami] ${message}`);
  }
}

export type { NamiConfig as KlyrConfig };
