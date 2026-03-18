"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicValidator = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const module_1 = require("module");
const typescript_1 = __importDefault(require("typescript"));
class BasicValidator {
    async validate(input) {
        if (input.draft.changes.length === 0) {
            return { ok: true, errors: [] };
        }
        const dependencyAllowlist = await this.loadDependencyAllowlist(input.workspaceRoot);
        const allowedPaths = new Set((input.allowedRelativePaths ?? []).map((value) => this.normalizeRelativePath(value)));
        const errors = [];
        for (const change of input.draft.changes) {
            errors.push(...(await this.validateChange(change, input.workspaceRoot, dependencyAllowlist, allowedPaths, input.allowNewFiles ?? true)));
        }
        return {
            ok: errors.length === 0,
            errors,
        };
    }
    async validateChange(change, workspaceRoot, dependencyAllowlist, allowedPaths, allowNewFiles) {
        const errors = [];
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
        if (existsOnDisk && allowedPaths.size > 0 && !allowedPaths.has(normalizedRelativePath)) {
            errors.push({
                code: 'UNVERIFIED_TARGET',
                message: `Existing file was not part of the verified context set: ${relativePath}`,
                file: change.path,
            });
        }
        if (change.operation === 'delete') {
            // Deletions are allowed. The executor performs workspace safety checks and backup creation.
            return errors;
        }
        if (!existsOnDisk && !allowNewFiles) {
            // New files are allowed by default. Keep this guard for opt-out scenarios only.
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
            }
            catch {
                originalContent = '';
            }
        }
        const scriptKind = this.scriptKindForPath(absolutePath);
        if (scriptKind !== undefined) {
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
                const importError = await this.validateImport(moduleName, absolutePath, workspaceRoot, dependencyAllowlist);
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
    validateContentIntegrity(change, originalContent) {
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
    findMissingContent(original, proposed) {
        let commonLength = 0;
        const maxCheck = Math.min(original.length, 500);
        for (let i = 0; i < maxCheck; i += 1) {
            if (original[i] === proposed[i]) {
                commonLength += 1;
            }
            else {
                break;
            }
        }
        return Math.max(0, original.length - commonLength);
    }
    parseDiagnostics(filePath, content, scriptKind) {
        const diagnostics = [];
        const transpileResult = typescript_1.default.transpileModule(content, {
            fileName: filePath,
            reportDiagnostics: true,
            compilerOptions: {
                target: typescript_1.default.ScriptTarget.ES2022,
                module: typescript_1.default.ModuleKind.ESNext,
                jsx: scriptKind === typescript_1.default.ScriptKind.TSX ? typescript_1.default.JsxEmit.ReactJSX : typescript_1.default.JsxEmit.Preserve,
            },
        });
        for (const diagnostic of transpileResult.diagnostics ?? []) {
            diagnostics.push(typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
        return diagnostics;
    }
    collectImports(filePath, content, scriptKind) {
        const sourceFile = typescript_1.default.createSourceFile(filePath, content, typescript_1.default.ScriptTarget.ES2022, true, scriptKind);
        const modules = [];
        const visit = (node) => {
            if (typescript_1.default.isImportDeclaration(node) && typescript_1.default.isStringLiteral(node.moduleSpecifier)) {
                modules.push(node.moduleSpecifier.text);
            }
            if (typescript_1.default.isCallExpression(node)) {
                const expression = node.expression;
                if (typescript_1.default.isIdentifier(expression) &&
                    expression.text === 'require' &&
                    node.arguments.length >= 1 &&
                    typescript_1.default.isStringLiteral(node.arguments[0])) {
                    modules.push(node.arguments[0].text);
                }
            }
            typescript_1.default.forEachChild(node, visit);
        };
        typescript_1.default.forEachChild(sourceFile, visit);
        return modules;
    }
    async validateImport(moduleName, sourceFilePath, workspaceRoot, dependencyAllowlist) {
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
    async resolveLocalModule(moduleName, sourceFilePath, workspaceRoot) {
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
            }
            catch {
                // Ignore missing path.
            }
        }
        return false;
    }
    async loadDependencyAllowlist(workspaceRoot) {
        const allowlist = new Set();
        allowlist.add('vscode');
        for (const builtin of module_1.builtinModules) {
            allowlist.add(builtin);
        }
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        try {
            const raw = await fs.readFile(packageJsonPath, 'utf-8');
            const parsed = JSON.parse(raw);
            for (const deps of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]) {
                if (!deps) {
                    continue;
                }
                for (const dep of Object.keys(deps)) {
                    allowlist.add(dep);
                }
            }
        }
        catch {
            // Ignore missing or invalid package.json.
        }
        return allowlist;
    }
    detectUnsafePatterns(content, filePath) {
        const patterns = [
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
        return patterns
            .filter((entry) => entry.pattern.test(content))
            .map((entry) => ({
            code: entry.code,
            message: entry.message,
            file: filePath,
        }));
    }
    scriptKindForPath(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.ts') {
            return typescript_1.default.ScriptKind.TS;
        }
        if (ext === '.tsx') {
            return typescript_1.default.ScriptKind.TSX;
        }
        if (ext === '.js') {
            return typescript_1.default.ScriptKind.JS;
        }
        if (ext === '.jsx') {
            return typescript_1.default.ScriptKind.JSX;
        }
        return undefined;
    }
    relativePath(filePath, workspaceRoot) {
        return path.relative(workspaceRoot, filePath) || filePath;
    }
    normalizeRelativePath(value) {
        return value.replace(/\\/g, '/');
    }
    isWithinWorkspace(candidatePath, workspaceRoot) {
        const normalizedRoot = path.resolve(workspaceRoot);
        const normalizedCandidate = path.resolve(candidatePath);
        return (normalizedCandidate === normalizedRoot ||
            normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`));
    }
    async pathExists(candidatePath) {
        try {
            await fs.stat(candidatePath);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.BasicValidator = BasicValidator;
//# sourceMappingURL=validator.js.map