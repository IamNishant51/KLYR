import type {
  Coder,
  CoderAnswer,
  CoderInput,
  CodeDraft,
  DraftFileChange,
  InlineCompletionInput,
} from './coder';
import type { OllamaClient } from '../llm/ollamaClient';
import {
  CHAT_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
  INLINE_COMPLETION_PROMPT,
} from './systemPrompts';

export interface OllamaCoderOptions {
  client: OllamaClient;
  model: string;
  temperature: number;
}

interface OllamaDraftPayload {
  summary: string;
  rationale: string;
  followUpQuestions?: string[];
  changes: Array<{
    path: string;
    summary: string;
    diff: string;
    proposedContent?: string;
    newContent?: string;
    additions?: string;
    location?: string;
    originalContent?: string;
    operation?: 'create' | 'update' | 'delete';
  }>;
}

export class OllamaCoder implements Coder {
  private readonly client: OllamaClient;
  private readonly model: string;
  private readonly temperature: number;
  private lastContextFile: string = 'unknown';

  constructor(options: OllamaCoderOptions) {
    this.client = options.client;
    this.model = options.model;
    this.temperature = options.temperature;
  }

  async generate(input: CoderInput): Promise<CodeDraft> {
    // Store the first file path for potential fallback
    if (input.context.files.length > 0) {
      this.lastContextFile = input.context.files[0].path;
    }
    
    const response = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: this.buildEditSystemPrompt() },
        { role: 'user', content: this.buildUserPrompt(input) },
      ],
      temperature: input.deterministic ? 0 : this.temperature,
      stream: false,
    });

    const parsed = this.parseResponse(response.content);
    if (!this.shouldAttemptRepair(parsed, response.content)) {
      return parsed;
    }

    try {
      const repaired = await this.repairDraftPayload(input, response.content);
      if (repaired.changes.length > 0) {
        return repaired;
      }
    } catch {
      // Keep original parsed response if repair fails.
    }

    return parsed;
  }

  async answer(input: CoderInput, onChunk?: (chunk: string) => void): Promise<CoderAnswer> {
    const messages = [
      {
        role: 'system' as const,
          content: CHAT_SYSTEM_PROMPT,
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          prompt: input.prompt,
          plan: input.plan,
          contextFiles: input.context.files.map((file) => ({
            path: file.path,
            reason: file.reason,
            content: this.trimText(file.content, 4000),
          })),
          workspace: input.context.workspace,
          memory: input.context.memory,
          notes: input.context.notes ?? '',
        }),
      },
    ];

    if (onChunk) {
      let content = '';
      await this.client.chatStream(
        {
          model: this.model,
          messages,
          temperature: input.deterministic ? 0 : this.temperature,
          stream: true,
        },
        (chunk) => {
          if (!chunk.content) {
            return;
          }
          content += chunk.content;
          onChunk(chunk.content);
        }
      );

      return {
        content: content.trim(),
        citations: input.context.files.slice(0, 4).map((file) => file.path),
      };
    }

    const response = await this.client.chat({
      model: this.model,
      messages,
      temperature: input.deterministic ? 0 : this.temperature,
      stream: false,
    });

    return {
      content: response.content.trim(),
      citations: input.context.files.slice(0, 4).map((file) => file.path),
    };
  }

  async completeInline(input: InlineCompletionInput): Promise<string> {
    const response = await this.client.chat({
      model: this.model,
      messages: [
        {
          role: 'system',
            content: INLINE_COMPLETION_PROMPT,
        },
        {
          role: 'user',
          content: JSON.stringify({
            filePath: input.filePath,
            languageId: input.languageId,
            prefix: this.trimText(input.prefix, 2500),
            suffix: this.trimText(input.suffix, 1200),
            workspace: input.context.workspace,
            contextFiles: input.context.files.map((file) => ({
              path: file.path,
              reason: file.reason,
              content: this.trimText(file.content, 1800),
            })),
            memory: input.context.memory,
          }),
        },
      ],
      temperature: input.deterministic ? 0 : this.temperature,
      stream: false,
    });

    return this.stripCodeFences(response.content).trim();
  }

  private buildEditSystemPrompt(): string {
    return EDIT_SYSTEM_PROMPT;
  }

  private buildUserPrompt(input: CoderInput): string {
    const instruction = `CRITICAL: You MUST output ONLY valid JSON. No code. No markdown. No explanation.

Example output:
{"summary": "Added NISHANT", "changes": [{"path": "README.md", "operation": "update", "proposedContent": "FULL FILE CONTENT HERE"}]}

If optimizing, make sure proposedContent includes ALL original code plus your improvements.`;

    return JSON.stringify({
      instruction,
      prompt: input.prompt,
      plan: input.plan,
      deterministic: input.deterministic,
      validationErrors: input.validationErrors ?? [],
      contextFiles: input.context.files.map((file) => ({
        path: file.path,
        reason: file.reason,
        content: this.trimText(file.content, 15000),
      })),
      workspace: input.context.workspace,
      memory: input.context.memory,
      notes: input.context.notes ?? '',
    });
  }

  private parseResponse(raw: string): CodeDraft {
    try {
      return this.parseJsonDirect(raw);
    } catch {
      // Try next strategy.
    }

    try {
      return this.parseJsonFromMarkdown(raw);
    } catch {
      // Try next strategy.
    }

    try {
      return this.parseJsonGreedy(raw);
    } catch {
      // Final fallback.
    }

    return this.parseFallback(raw);
  }

  private parseJsonDirect(raw: string): CodeDraft {
    return this.toDraft(JSON.parse(raw.trim()) as OllamaDraftPayload);
  }

  private parseJsonFromMarkdown(raw: string): CodeDraft {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonString = (match ? match[1] : raw).trim();
    return this.parseJsonDirect(jsonString);
  }

  private parseJsonGreedy(raw: string): CodeDraft {
    const stripped = this.stripCodeFences(raw).trim();
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error('No JSON object braces found in response');
    }
    const jsonString = stripped.slice(firstBrace, lastBrace + 1);
    return this.parseJsonDirect(jsonString);
  }

  private parseFallback(raw: string): CodeDraft {
    const trimmed = raw.trim();
    
    // If response looks like code (starts with import, def, class, etc.)
    const looksLikeCode = /^import |^export |^def |^class |^function |^const |^let |^var |^#!/.test(trimmed);
    
    if (looksLikeCode) {
      const firstFile = this.lastContextFile || 'unknown';
      
      return {
        changes: [{
          path: firstFile,
          summary: 'Code output',
          diff: '',
          proposedContent: trimmed,
          originalContent: '',
          operation: 'update' as const,
        }],
        summary: 'Code generated',
        rationale: 'LLM output code instead of JSON',
        followUpQuestions: [],
      };
    }
    
    // Check if response is suggestions/explanation (not actual changes)
    const isSuggestion = /\b(suggestion|improvement|to optimize|here are|here's|you could|recommend|should|might|consider|try)/i.test(trimmed.slice(0, 500));
    
    if (isSuggestion && this.lastContextFile) {
      // LLM gave suggestions but no actual changes - ask for clarification
      return {
        changes: [],
        summary: 'Suggestions provided',
        rationale: 'The model provided suggestions but no code changes. ' + trimmed.slice(0, 200) + '...',
        followUpQuestions: ['Please rephrase your request to include specific changes you want made.'],
      };
    }
    
    // Try to find JSON in the response
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.changes && Array.isArray(parsed.changes)) {
          return {
            changes: parsed.changes.map((c: any) => ({
              path: c.path || 'unknown',
              summary: c.summary || '',
              diff: c.diff || '',
              proposedContent: c.proposedContent || c.content || '',
              originalContent: c.originalContent || '',
              operation: c.operation || 'update',
            })),
            summary: parsed.summary || 'Parsed from response',
            rationale: parsed.rationale || '',
            followUpQuestions: parsed.followUpQuestions || [],
          };
        }
      } catch {
        // JSON parse failed
      }
    }
    
    return {
      changes: [],
      summary: 'Non-JSON response',
      rationale: `Model returned text instead of JSON changes: "${trimmed.slice(0, 100)}..."`,
      followUpQuestions: [],
    };
  }

  private toDraft(parsed: OllamaDraftPayload): CodeDraft {
    const changes: DraftFileChange[] = Array.isArray(parsed.changes)
      ? parsed.changes
          .filter((change) => typeof change.path === 'string' && change.path.trim().length > 0)
          .map((change) => {
            const operation = change.operation ?? 'update';
            const additions = (change.additions ?? '').trim();
            
            // If LLM provides "additions" field, store it separately
            // The fixer/executor will merge with disk content later
            if (additions && operation === 'update') {
              return {
                path: change.path,
                summary: change.summary,
                diff: change.diff,
                proposedContent: additions, // Will be merged with original by fixer
                originalContent: '', // Will be read from disk by fixer
                operation,
              };
            }
            
            // Legacy handling for full content
            const originalContent = change.originalContent ?? '';
            const llmNewContent = (change.newContent ?? change.proposedContent ?? '').trim();
            let proposedContent = '';

            // For updates, we'll rely on fixer to read from disk
            if (operation === 'update') {
              proposedContent = llmNewContent || originalContent;
            } else if (operation === 'create') {
              proposedContent = llmNewContent || originalContent;
            }

            return {
              path: change.path,
              summary: change.summary,
              diff: change.diff,
              proposedContent,
              originalContent,
              operation,
            };
          })
      : [];

    return {
      changes,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary
          : 'No summary provided.',
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'No rationale provided.',
      followUpQuestions: Array.isArray(parsed.followUpQuestions)
        ? parsed.followUpQuestions.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }

  private stripCodeFences(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced ? fenced[1] : raw;
  }

  private trimText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }

    return `${value.slice(0, maxChars)}\n...<truncated>`;
  }

  private shouldAttemptRepair(parsed: CodeDraft, raw: string): boolean {
    if (!raw.trim()) {
      return false;
    }

    // Always try to repair if there are no changes
    if (parsed.changes.length === 0) {
      return true;
    }

    // Also try repair if the response looks like code, not JSON
    const looksLikeCode = /^import |^export |^def |^class |^function |^const |^let |^var |^#!/.test(raw.trim());
    if (looksLikeCode) {
      return true;
    }

    return false;
  }

  private async repairDraftPayload(input: CoderInput, raw: string): Promise<CodeDraft> {
    // Ask LLM to convert the response to JSON
    const repairPrompt = `Convert this response to JSON for a code editor:

Response:
${raw.slice(0, 3000)}

Instructions:
1. If the response suggests code changes, extract them into JSON
2. Use this exact format:
{"summary": "what was done", "changes": [{"path": "file.py", "operation": "update", "proposedContent": "full file content with changes"}]}
3. For proposedContent, include ALL original code PLUS any improvements
4. Output ONLY JSON, no explanations

If no changes should be made:
{"summary": "No changes", "changes": []}`;

    try {
      const repairResponse = await this.client.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON converter. Output ONLY valid JSON matching this schema: {"summary": string, "changes": [{"path": string, "operation": string, "proposedContent": string}]}.',
          },
          {
            role: 'user',
            content: repairPrompt,
          },
        ],
        temperature: 0,
        stream: false,
      });

      const parsed = this.parseResponse(repairResponse.content);
      if (parsed.changes.length > 0) {
        return parsed;
      }
    } catch {
      // Repair failed
    }
    
    // Final fallback: show the response as explanation
    return {
      changes: [],
      summary: 'Could not generate changes',
      rationale: 'The model did not provide code changes in JSON format. Try being more specific about what changes you want.',
      followUpQuestions: ['Please specify exactly what you want changed in the code.'],
    };
  }
}
