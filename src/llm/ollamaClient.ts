export interface OllamaClientOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs?: number;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  temperature: number;
  stream: boolean;
}

export interface OllamaChatResponse {
  content: string;
  done: boolean;
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
    const response = await this.requestWithRetry(request, false);
    return response;
  }

  async chatStream(
    request: OllamaChatRequest,
    onChunk: OllamaStreamHandler
  ): Promise<void> {
    await this.requestWithRetry(request, true, onChunk);
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

  private async requestWithRetry(
    request: OllamaChatRequest,
    stream: boolean,
    onChunk?: OllamaStreamHandler
  ): Promise<OllamaChatResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.maxRetries) {
      try {
        return await this.executeRequest(request, stream, onChunk);
      } catch (error) {
        lastError = error;
        attempt += 1;

        if (attempt > this.options.maxRetries) {
          break;
        }

        await this.delay(this.options.retryBackoffMs ?? 800);
      }
    }

    throw lastError ?? new Error('Ollama request failed.');
  }

  private async executeRequest(
    request: OllamaChatRequest,
    stream: boolean,
    onChunk?: OllamaStreamHandler
  ): Promise<OllamaChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          stream,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with ${response.status}.`);
      }

      if (!stream) {
        const payload: unknown = await response.json();
        let content = '';
        if (typeof payload === 'object' && payload !== null && 'message' in payload) {
          const msg = (payload as Record<string, unknown>).message;
          if (typeof msg === 'object' && msg !== null && 'content' in msg) {
            content = String((msg as Record<string, unknown>).content);
          }
        }
        return {
          content,
          done: true,
        };
      }

      if (!response.body) {
        throw new Error('Ollama streaming response has no body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let lastContent = '';

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

          const chunk = JSON.parse(trimmed);
          const content = chunk.message?.content ?? '';
          lastContent += content;
          onChunk?.({ content, done: chunk.done === true });
        }
      }

      onChunk?.({ content: '', done: true });
      return { content: lastContent, done: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
