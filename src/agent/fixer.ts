import type { Coder, CoderInput, CodeDraft } from './coder';
import type { Validator, ValidationError, ValidatorInput } from './validator';

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

    const validation = await input.validator.validate({
      draft,
      workspaceRoot: input.workspaceRoot,
      ...input.validationContext,
    });

    lastDraft = draft;
    lastErrors = validation.errors;

    if (validation.ok) {
      return { ok: true, draft, errors: [], attempts: attempt };
    }
  }

  return {
    ok: false,
    draft: lastDraft,
    errors: lastErrors,
    attempts: attempt,
  };
}
