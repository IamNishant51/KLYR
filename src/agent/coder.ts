import type { PlanResult } from './planner';
import type { ValidationError } from './validator';

export interface CoderContextFile {
  path: string;
  content: string;
  reason: string;
  language?: string;
  isActive?: boolean;
}

export interface WorkspaceFacts {
  root: string;
  activeFilePath?: string;
  selection?: string;
  workspaceSummary: string;
  dependencyAllowlist: string[];
  openFiles: string[];
  retrievedPaths: string[];
}

export interface CoderContext {
  files: CoderContextFile[];
  workspace: WorkspaceFacts;
  memory: string;
  notes?: string;
}

export interface CoderInput {
  prompt: string;
  plan: PlanResult;
  context: CoderContext;
  deterministic: boolean;
  validationErrors?: ValidationError[];
}

export interface DraftFileChange {
  path: string;
  diff: string;
  summary: string;
  proposedContent?: string;
  originalContent?: string;
  operation?: 'create' | 'update' | 'delete';
}

export interface CommandStep {
  command: string;
  cwd?: string;
  timeout?: number;
  allowFailure?: boolean;
  description?: string;
}

export interface CodeDraft {
  changes: DraftFileChange[];
  summary: string;
  rationale: string;
  followUpQuestions?: string[];
  commands?: CommandStep[];
}

export interface CoderAnswer {
  content: string;
  citations: string[];
}

export interface InlineCompletionInput {
  filePath: string;
  languageId: string;
  prefix: string;
  suffix: string;
  context: CoderContext;
  deterministic: boolean;
}

export interface Coder {
  generate(input: CoderInput): Promise<CodeDraft>;
  answer(input: CoderInput, onChunk?: (chunk: string) => void): Promise<CoderAnswer>;
  completeInline(input: InlineCompletionInput): Promise<string>;
}

export class NoopCoder implements Coder {
  async generate(_: CoderInput): Promise<CodeDraft> {
    return {
      changes: [],
      summary: 'No changes generated.',
      rationale: 'Code generation not implemented yet.',
      followUpQuestions: [],
    };
  }

  async answer(_: CoderInput): Promise<CoderAnswer> {
    return {
      content: 'Answer generation not implemented yet.',
      citations: [],
    };
  }

  async completeInline(_: InlineCompletionInput): Promise<string> {
    return '';
  }
}
