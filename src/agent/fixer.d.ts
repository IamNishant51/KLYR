import { CodeDraft } from './coder';
import type { Coder, CoderInput } from './coder';
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
export declare function runFixerLoop(input: FixerInput): Promise<FixerResult>;
