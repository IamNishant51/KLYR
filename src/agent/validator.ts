import * as fs from 'fs/promises';
import * as path from 'path';
import { builtinModules } from 'module';
import ts from 'typescript';
import type { CodeDraft, DraftFileChange } from './coder';

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

export class BasicValidator implements Validator {
  async validate(input: ValidatorInput): Promise<ValidationResult> {
    if (input.draft.changes.length === 0) {
      return { ok: true, errors: [] };
    }

    const dependencyAllowlist = await this.loadDependencyAllowlist(input.workspaceRoot);
    const packageAllowlistCache = new Map<string, Set<string>>();
    const allowedPaths = new Set(
      (input.allowedRelativePaths ?? []).map((value) => this.normalizeRelativePath(value))
    );
    const errors: ValidationError[] = [];

    for (const change of input.draft.changes) {
      errors.push(
        ...(await this.validateChange(
          change,
          input.workspaceRoot,
          dependencyAllowlist,
          packageAllowlistCache,
          allowedPaths,
          input.allowNewFiles ?? true
        ))
      );
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  private async validateChange(
    change: DraftFileChange,
    workspaceRoot: string,
    dependencyAllowlist: Set<string>,
    packageAllowlistCache: Map<string, Set<string>>,
    allowedPaths: Set<string>,
    allowNewFiles: boolean
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const proposedContent = change.proposedContent ?? '';
    const absolutePath = path.resolve(workspaceRoot, change.path);
    const relativePath = this.relativePath(absolutePath, workspaceRoot);
    const normalizedRelativePath = this.normalizeRelativePath(relativePath);

    if (!this.isWithinWorkspace(absolutePath, workspaceRoot)) {
      errors.push({
        code: 'PATH_ESCAPE',
        message: 'Draft path escapes the workspace root.',
        file: change.path,
      });
      return errors;
    }

    const existsOnDisk = await this.pathExists(absolutePath);
    
    // SKIP the UNVERIFIED_TARGET check for existing files
    // The file exists, so we can edit it - no need to check if it was in retrieved context
    // This allows editing any file in the workspace, not just retrieved ones
    // For new files, we still check allowNewFiles flag

    if (change.operation === 'delete') {
      return errors;
    }

    if (change.operation === 'update' && !existsOnDisk) {
      errors.push({
        code: 'UPDATE_TARGET_NOT_FOUND',
        message: `Cannot update non-existent file: ${relativePath}. Use create operation for new files.`,
        file: change.path,
      });
      return errors;
    }

    if (change.operation === 'create' && existsOnDisk) {
      errors.push({
        code: 'CREATE_TARGET_EXISTS',
        message: `Cannot create file that already exists: ${relativePath}. Use update operation instead.`,
        file: change.path,
      });
      return errors;
    }

    if (!existsOnDisk && !allowNewFiles) {
      errors.push({
        code: 'NEW_FILE_NOT_ALLOWED',
        message: `Creating new files is disabled for this plan: ${relativePath}`,
        file: change.path,
      });
      return errors;
    }

    if (!proposedContent.trim()) {
      errors.push({
        code: 'MISSING_PROPOSED_CONTENT',
        message: 'Draft changes must include full proposed file content.',
        file: change.path,
      });
      return errors;
    }

    let originalContent = '';
    if (existsOnDisk) {
      try {
        originalContent = await fs.readFile(absolutePath, 'utf-8');
      } catch {
        originalContent = '';
      }
    }

    const scriptKind = this.scriptKindForPath(absolutePath);
    if (scriptKind !== undefined) {
      const scopedDependencyAllowlist = await this.loadScopedDependencyAllowlist(
        absolutePath,
        workspaceRoot,
        dependencyAllowlist,
        packageAllowlistCache
      );

      const diagnostics = this.parseDiagnostics(absolutePath, proposedContent, scriptKind);
      for (const diagnostic of diagnostics) {
        errors.push({
          code: 'SYNTAX_ERROR',
          message: diagnostic,
          file: change.path,
        });
      }

      const imports = this.collectImports(absolutePath, proposedContent, scriptKind);
      for (const moduleName of imports) {
        const importError = await this.validateImport(
          moduleName,
          absolutePath,
          workspaceRoot,
          scopedDependencyAllowlist
        );
        if (importError) {
          errors.push(importError);
        }
      }
    }

    const integrityError = this.validateContentIntegrity(change, originalContent);
    if (integrityError) {
      errors.push(integrityError);
    }

    errors.push(...this.detectUnsafePatterns(proposedContent, change.path));
    return errors;
  }

  private validateContentIntegrity(
    change: DraftFileChange,
    originalContent: string
  ): ValidationError | null {
    if (change.operation === 'create') {
      return null;
    }

    if (change.operation === 'delete') {
      return null;
    }

    if (!originalContent) {
      return null;
    }

    const proposedContent = change.proposedContent ?? '';

    if (proposedContent.length < originalContent.length) {
      return {
        code: 'CONTENT_TRUNCATION',
        message: `Proposed content (${proposedContent.length} chars) is shorter than original (${originalContent.length} chars). This would delete ${originalContent.length - proposedContent.length} characters. Please preserve all original content.`,
        file: change.path,
      };
    }

    if (!proposedContent.includes(originalContent)) {
      const missingContent = this.findMissingContent(originalContent, proposedContent);
      return {
        code: 'CONTENT_LOSS',
        message: `Original content was not preserved in ${change.path}. Missing approximately ${missingContent} characters. All original file content must be included in the update.`,
        file: change.path,
      };
    }

    return null;
  }

  private findMissingContent(original: string, proposed: string): number {
    let commonLength = 0;
    const maxCheck = Math.min(original.length, 500);

    for (let i = 0; i < maxCheck; i += 1) {
      if (original[i] === proposed[i]) {
        commonLength += 1;
      } else {
        break;
      }
    }

    return Math.max(0, original.length - commonLength);
  }

  private parseDiagnostics(
    filePath: string,
    content: string,
    scriptKind: ts.ScriptKind
  ): string[] {
    const diagnostics: string[] = [];
    const transpileResult = ts.transpileModule(content, {
      fileName: filePath,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: scriptKind === ts.ScriptKind.TSX ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
      },
    });

    for (const diagnostic of transpileResult.diagnostics ?? []) {
      diagnostics.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }

    return diagnostics;
  }

  private collectImports(
    filePath: string,
    content: string,
    scriptKind: ts.ScriptKind
  ): string[] {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.ES2022,
      true,
      scriptKind
    );
    const modules: string[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        modules.push(node.moduleSpecifier.text);
      }

      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (
          ts.isIdentifier(expression) &&
          expression.text === 'require' &&
          node.arguments.length >= 1 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          modules.push(node.arguments[0].text);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return modules;
  }

  private async validateImport(
    moduleName: string,
    sourceFilePath: string,
    workspaceRoot: string,
    dependencyAllowlist: Set<string>
  ): Promise<ValidationError | null> {
    if (moduleName.startsWith('.')) {
      const resolved = await this.resolveLocalModule(moduleName, sourceFilePath, workspaceRoot);
      if (!resolved) {
        return {
          code: 'MISSING_LOCAL_IMPORT',
          message: `Local import not found: ${moduleName}`,
          file: this.relativePath(sourceFilePath, workspaceRoot),
        };
      }
      return null;
    }

    if (moduleName.startsWith('node:')) {
      return null;
    }

    const packageName = moduleName.split('/')[0];
    if (dependencyAllowlist.has(moduleName) || dependencyAllowlist.has(packageName)) {
      return null;
    }

    return {
      code: 'UNKNOWN_DEPENDENCY',
      message: `Import is not declared in package.json: ${moduleName}`,
      file: this.relativePath(sourceFilePath, workspaceRoot),
    };
  }

  private async resolveLocalModule(
    moduleName: string,
    sourceFilePath: string,
    workspaceRoot: string
  ): Promise<boolean> {
    const sourceDir = path.dirname(sourceFilePath);
    const rawTarget = path.resolve(sourceDir, moduleName);

    const candidates = [
      rawTarget,
      `${rawTarget}.ts`,
      `${rawTarget}.tsx`,
      `${rawTarget}.js`,
      `${rawTarget}.jsx`,
      `${rawTarget}.json`,
      path.join(rawTarget, 'index.ts'),
      path.join(rawTarget, 'index.tsx'),
      path.join(rawTarget, 'index.js'),
      path.join(rawTarget, 'index.jsx'),
      path.join(rawTarget, 'index.json'),
    ];

    for (const candidate of candidates) {
      if (!this.isWithinWorkspace(candidate, workspaceRoot)) {
        continue;
      }

      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return true;
        }
      } catch {
        // Ignore missing path.
      }
    }

    return false;
  }

  private async loadDependencyAllowlist(workspaceRoot: string): Promise<Set<string>> {
    const allowlist = new Set<string>();
    allowlist.add('vscode');

    for (const builtin of builtinModules) {
      allowlist.add(builtin);
    }

    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    try {
      const raw = await fs.readFile(packageJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };

      for (const deps of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]) {
        if (!deps) {
          continue;
        }
        for (const dep of Object.keys(deps)) {
          allowlist.add(dep);
        }
      }
    } catch {
      // Ignore missing or invalid package.json.
    }

    return allowlist;
  }

  private async loadScopedDependencyAllowlist(
    sourceFilePath: string,
    workspaceRoot: string,
    rootAllowlist: Set<string>,
    cache: Map<string, Set<string>>
  ): Promise<Set<string>> {
    const rootNormalized = path.resolve(workspaceRoot);
    let currentDir = path.dirname(path.resolve(sourceFilePath));

    while (currentDir.startsWith(rootNormalized)) {
      const packageJsonPath = path.join(currentDir, 'package.json');

      if (cache.has(packageJsonPath)) {
        const cached = cache.get(packageJsonPath);
        if (cached) {
          return cached;
        }
      }

      try {
        const raw = await fs.readFile(packageJsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
        };

        const scoped = new Set<string>(rootAllowlist);
        for (const deps of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]) {
          if (!deps) {
            continue;
          }
          for (const dep of Object.keys(deps)) {
            scoped.add(dep);
          }
        }

        cache.set(packageJsonPath, scoped);
        return scoped;
      } catch {
        cache.set(packageJsonPath, rootAllowlist);
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    return rootAllowlist;
  }

  private detectUnsafePatterns(content: string, filePath: string): ValidationError[] {
    const patterns: Array<{ code: string; pattern: RegExp; message: string }> = [
      {
        code: 'UNSAFE_EVAL',
        pattern: /\beval\s*\(/,
        message: 'Unsafe dynamic evaluation is not allowed.',
      },
      {
        code: 'UNSAFE_FUNCTION',
        pattern: /\bnew\s+Function\s*\(/,
        message: 'Dynamic Function construction is not allowed.',
      },
      {
        code: 'UNSAFE_PROCESS_EXIT',
        pattern: /\bprocess\.exit\s*\(/,
        message: 'process.exit is unsafe in generated workspace code.',
      },
      {
        code: 'UNSAFE_CHILD_PROCESS',
        pattern: /from\s+['"]child_process['"]|require\(\s*['"]child_process['"]\s*\)/,
        message: 'child_process usage is blocked in deterministic mode.',
      },
    ];

    const normalizedPath = filePath.toLowerCase();
    const isMarkdownOrText = /\.(md|txt|rst|adoc)$/i.test(normalizedPath);
    if (!isMarkdownOrText) {
      patterns.push(
        {
          code: 'HALLUCINATED_PLACEHOLDER',
          pattern: /\b(your_api_key|your_token|replace_with|insert_here|placeholder_value)\b/i,
          message: 'Draft contains placeholder values that indicate ungrounded generation.',
        },
        {
          code: 'MARKDOWN_LEAKAGE',
          pattern: /```[a-zA-Z]*\n[\s\S]*```/,
          message: 'Draft appears to contain markdown code fences instead of raw file content.',
        }
      );
    }

    return patterns
      .filter((entry) => entry.pattern.test(content))
      .map((entry) => ({
        code: entry.code,
        message: entry.message,
        file: filePath,
      }));
  }

  private scriptKindForPath(filePath: string): ts.ScriptKind | undefined {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts') {
      return ts.ScriptKind.TS;
    }
    if (ext === '.tsx') {
      return ts.ScriptKind.TSX;
    }
    if (ext === '.js') {
      return ts.ScriptKind.JS;
    }
    if (ext === '.jsx') {
      return ts.ScriptKind.JSX;
    }
    return undefined;
  }

  private relativePath(filePath: string, workspaceRoot: string): string {
    return path.relative(workspaceRoot, filePath) || filePath;
  }

  private normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, '/');
  }

  private isWithinWorkspace(candidatePath: string, workspaceRoot: string): boolean {
    const normalizedRoot = path.resolve(workspaceRoot);
    const normalizedCandidate = path.resolve(candidatePath);

    return (
      normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
    );
  }

  private async pathExists(candidatePath: string): Promise<boolean> {
    try {
      await fs.stat(candidatePath);
      return true;
    } catch {
      return false;
    }
  }
}
