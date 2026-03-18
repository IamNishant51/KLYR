import type { CodeDraft } from './coder';
export interface ValidationError {
    code: string;
    message: string;
    file?: string;
}
export interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
}
export interface ValidatorInput {
    draft: CodeDraft;
    workspaceRoot: string;
    allowedRelativePaths?: string[];
    allowNewFiles?: boolean;
}
export interface Validator {
    validate(input: ValidatorInput): Promise<ValidationResult>;
}
export declare class BasicValidator implements Validator {
    validate(input: ValidatorInput): Promise<ValidationResult>;
    private validateChange;
    private parseDiagnostics;
    private collectImports;
    private validateImport;
    private resolveLocalModule;
    private loadDependencyAllowlist;
    private detectUnsafePatterns;
    private scriptKindForPath;
    private relativePath;
    private normalizeRelativePath;
    private isWithinWorkspace;
    private pathExists;
}
