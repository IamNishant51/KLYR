import { CoderResponse, CodeDraft } from './coder';
import type { Coder, CoderInput } from './coder';
import type { Validator, ValidationError, ValidatorInput } from './validator';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FixerInput {
  coder: Coder;
  validator: Validator;
  initialInput: CoderInput;
  workspaceRoot: string;
  maxAttempts: number;
  validationContext?: Omit<ValidatorInput, 'draft' | 'workspaceRoot'>;
}

export interface FixerResult {
  ok: boolean;
  draft?: CodeDraft;
  errors: ValidationError[];
  attempts: number;
}

export async function runFixerLoop(input: FixerInput): Promise<FixerResult> {
  let attempt = 0;
  let lastErrors: ValidationError[] = [];
  let lastDraft: CodeDraft | undefined;

  while (attempt < input.maxAttempts) {
    attempt += 1;

    const draft = await input.coder.generate({
      ...input.initialInput,
      validationErrors: lastErrors,
    });

    if (draft.type === 'tool_use') {
      return {
        ok: false,
        draft: undefined,
        errors: [{ code: 'TOOL_USE_INTERRUPT', message: 'Agent requested tool use during fix loop', file: '' }],
        attempts: attempt,
      };
    }

    if (draft.type !== 'draft') {
      return {
        ok: false,
        draft: undefined,
        errors: [{ code: 'UNEXPECTED_CODER_RESPONSE', message: 'Agent returned non-draft response during fix loop', file: '' }],
        attempts: attempt,
      };
    }

    const actualDraft = draft.draft;
    // Auto-fix content loss BEFORE validation by reading from disk
    const fixedDraft = await fixContentLossFromDisk(actualDraft, input.workspaceRoot, input.initialInput.prompt);

    const validation = await input.validator.validate({
      draft: fixedDraft,
      workspaceRoot: input.workspaceRoot,
      ...input.validationContext,
    });

    // Content loss check - but DON'T fail, just note it
    const contentLossErrors = checkDraftForContentLoss(fixedDraft);
    
    // Combine all errors but don't fail on content loss - executor will handle it
    const allErrors = [...validation.errors, ...contentLossErrors];

    lastDraft = fixedDraft;
    lastErrors = allErrors;

    if (validation.ok && contentLossErrors.length === 0) {
      return { ok: true, draft: fixedDraft, errors: [], attempts: attempt };
    }
    
    // If validation passed but there's content loss, executor will fix it
    // Continue to executor even if there are warnings
    if (validation.ok) {
      return { ok: true, draft: fixedDraft, errors: contentLossErrors, attempts: attempt };
    }
  }

  return {
    ok: false,
    draft: lastDraft,
    errors: lastErrors,
    attempts: attempt,
  };
}

async function fixContentLossFromDisk(draft: CodeDraft, workspaceRoot: string, userPrompt?: string): Promise<CodeDraft> {
  const fixedChanges = await Promise.all(
    draft.changes.map(async (change) => {
      if (change.operation !== 'update') {
        return change;
      }

      const resolvedPath = path.resolve(workspaceRoot, change.path);
      
      try {
        const diskContent = await fs.readFile(resolvedPath, 'utf-8');
        const proposedContent = (change.proposedContent ?? '').trim();
        
        // Check if proposedContent is just user prompt text or garbage
        const isUserPrompt = userPrompt && proposedContent.toLowerCase().includes(userPrompt.toLowerCase().slice(0, 50));
        const isPromptLike = /^(add|create|update|delete|remove|fix|change|modify|replace)\s+(my|this|the|your)/i.test(proposedContent);
        
        if (isUserPrompt || isPromptLike) {
          // LLM output the user's prompt - this is garbage, use original only
          console.warn('[KLYR] LLM output appears to be user prompt, using original content');
          return {
            ...change,
            originalContent: diskContent,
            proposedContent: diskContent,
          };
        }
        
        // If proposedContent doesn't include disk's original content, we need to fix it
        if (!proposedContent.includes(diskContent)) {
          console.warn(`[KLYR] Auto-fixing content loss for ${change.path}`);
          
          // If proposedContent is additions (short), prepend to original
          // If it's longer/mixed, just prepend original to be safe
          if (proposedContent.length < 1000) {
            // Short content - assume it's additions, prepend to original
            return {
              ...change,
              originalContent: diskContent,
              proposedContent: proposedContent + '\n' + diskContent,
            };
          } else {
            // Longer content - might be partial file, prepend original
            return {
              ...change,
              originalContent: diskContent,
              proposedContent: proposedContent + '\n' + diskContent,
            };
          }
        }
        
        return {
          ...change,
          originalContent: diskContent,
        };
      } catch {
        // File doesn't exist or can't be read - keep original
        return change;
      }
    })
  );

  return {
    ...draft,
    changes: fixedChanges,
  };
}

function checkDraftForContentLoss(draft: CodeDraft): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const change of draft.changes) {
    if (change.operation === 'update' && change.originalContent && change.proposedContent) {
      if (change.proposedContent.length < change.originalContent.length) {
        errors.push({
          code: 'CONTENT_LOSS_WARNING',
          message: `Proposed content (${change.proposedContent.length} chars) is shorter than original (${change.originalContent.length} chars). This will be auto-fixed by prepending content to original.`,
          file: change.path,
        });
      }
    }
  }

  return errors;
}
