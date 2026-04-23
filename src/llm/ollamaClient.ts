export interface OllamaClientOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs?: number;
  numParallel?: number;
  numCtx?: number;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  temperature: number;
  stream: boolean;
  options?: {
    num_parallel?: number;
    num_ctx?: number;
  };
}

export interface OllamaChatResponse {
  content: string;
  done: boolean;
  thinking?: string;
}

export interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export type OllamaStreamHandler = (chunk: OllamaChatResponse) => void;

export interface OllamaClient {
  chat(request: OllamaChatRequest): Promise<OllamaChatResponse>;
  chatStream(request: OllamaChatRequest, onChunk: OllamaStreamHandler): Promise<void>;
  listModels(): Promise<OllamaModelsResponse>;
}

export class HttpOllamaClient implements OllamaClient {
  private readonly options: OllamaClientOptions;

  constructor(options: OllamaClientOptions) {
    this.options = options;
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const enrichedRequest = this.enrichRequest(request);
    const response = await this.requestWithRetry(enrichedRequest, false);
    return response;
  }

  async chatStream(
    request: OllamaChatRequest,
    onChunk: OllamaStreamHandler
  ): Promise<void> {
    const enrichedRequest = this.enrichRequest(request);
    await this.requestWithRetry(enrichedRequest, true, onChunk);
  }

  async listModels(): Promise<OllamaModelsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to list Ollama models: ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (typeof payload === 'object' && payload !== null && 'models' in payload) {
        return payload as OllamaModelsResponse;
      }

      return { models: [] };
    } finally {
      clearTimeout(timeout);
    }
  }

  private enrichRequest(request: OllamaChatRequest): OllamaChatRequest {
    return {
      ...request,
      options: {
        ...request.options,
        num_parallel: this.options.numParallel ?? request.options?.num_parallel,
        num_ctx: this.options.numCtx ?? request.options?.num_ctx,
      },
    };
  }

  private async requestWithRetry(
    request: OllamaChatRequest,
    stream: boolean,
    onChunk?: OllamaStreamHandler
  ): Promise<OllamaChatResponse> {
    let attempt = 0;
    let lastError: unknown;
    let lastTimeoutMs = this.options.timeoutMs;

    while (attempt <= this.options.maxRetries) {
      try {
        const timeoutMultiplier = 1 + attempt;
        const effectiveTimeoutMs = Math.min(this.options.timeoutMs * timeoutMultiplier, 12 * 60 * 1000);
        lastTimeoutMs = effectiveTimeoutMs;
        return await this.executeRequest(request, stream, onChunk, effectiveTimeoutMs);
      } catch (error) {
        lastError = error;

        attempt += 1;

        if (attempt > this.options.maxRetries) {
          break;
        }

        await this.delay(this.options.retryBackoffMs ?? 800);
      }
    }

    if (this.isAbortOrTimeoutError(lastError)) {
      const seconds = Math.max(1, Math.round(lastTimeoutMs / 1000));
      throw new Error(
        `Model response timed out after ${seconds}s across retries. Increase nami.ollama.timeoutMs or use a smaller/faster model.`
      );
    }

    throw lastError ?? new Error('Ollama request failed. Make sure Ollama is running with "ollama serve".');
  }

  private async executeRequest(
    request: OllamaChatRequest,
    stream: boolean,
    onChunk?: OllamaStreamHandler,
    timeoutMs?: number
  ): Promise<OllamaChatResponse> {
    const controller = new AbortController();
    const effectiveTimeoutMs = timeoutMs ?? this.options.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
      const requestBody: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        stream,
      };
      
      if (request.options) {
        requestBody.options = request.options;
      }

      const response = await fetch(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Ollama server not running. Run "ollama serve" in terminal, then "ollama run codellama".');
        }
        throw new Error(`Ollama request failed with ${response.status}. Check if Ollama is running.`);
      }

      if (!stream) {
        const payload: unknown = await response.json();
        let content = '';
        let thinking = undefined;
        
        if (typeof payload === 'object' && payload !== null && 'message' in payload) {
          const msg = (payload as Record<string, unknown>).message;
          if (typeof msg === 'object' && msg !== null) {
            content = String((msg as Record<string, unknown>).content ?? '');
            if ('thinking' in msg) {
              thinking = String((msg as Record<string, unknown>).thinking ?? '');
            }
          }
        }
        return { content, done: true, thinking };
      }

      if (!response.body) {
        throw new Error('Ollama streaming response has no body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let lastContent = '';
      let lastThinking = '';
      let chunkBuffer = '';
      let thinkingBuffer = '';
      let lastFlush = Date.now();
      let hasCompleted = false;
      let inThinking = false;
      const CHUNK_BUFFER_SIZE = 5;
      const FLUSH_INTERVAL_MS = 10;

      const flushBuffer = ( done = false) => {
        if (done && hasCompleted) {
          return;
        }
        
        const hasContent = chunkBuffer.length > 0;
        const hasThinking = thinkingBuffer.length > 0;
        
        if (hasContent || hasThinking || done) {
          onChunk?.({ content: chunkBuffer, done, thinking: inThinking ? thinkingBuffer : undefined });
          
          if (done) {
            hasCompleted = true;
          }
          
          chunkBuffer = '';
          thinkingBuffer = '';
          lastFlush = Date.now();
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const chunk = JSON.parse(trimmed);
            const content = chunk.message?.content ?? '';
            const thinking = chunk.message?.thinking ?? '';
            
            if (thinking) {
              if (!inThinking) {
                inThinking = true;
                thinkingBuffer = '';
              }
              thinkingBuffer += thinking;
            } else if (inThinking && content) {
              inThinking = false;
              flushBuffer(false);
              lastContent += content;
              chunkBuffer += content;
            } else {
              lastContent += content;
              chunkBuffer += content;
            }

            if (
              chunk.done === true ||
              chunkBuffer.length >= CHUNK_BUFFER_SIZE ||
              Date.now() - lastFlush >= FLUSH_INTERVAL_MS
            ) {
              flushBuffer(chunk.done === true);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      flushBuffer(true);
      return { content: lastContent, done: true, thinking: inThinking ? lastThinking : undefined };
    } catch (error) {
      if (this.isAbortOrTimeoutError(error)) {
        const seconds = Math.max(1, Math.round(effectiveTimeoutMs / 1000));
        throw new Error(
          `Model response timed out after ${seconds}s. Increase klyr.ollama.timeoutMs or use a smaller/faster model.`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isAbortOrTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { name?: unknown; message?: unknown };
    const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : '';
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';

    return (
      name.includes('abort') ||
      message.includes('aborted') ||
      message.includes('timeout') ||
      message.includes('timed out')
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}