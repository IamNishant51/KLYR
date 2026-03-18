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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreviewOnlyExecutor = exports.FileSystemExecutor = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class FileSystemExecutor {
    backupDirName = '.klyr-trash';
    async preview(draft, workspaceRoot) {
        const changes = [];
        for (const change of draft.changes) {
            const resolvedPath = this.resolveWorkspacePath(workspaceRoot, change.path);
            const originalContent = await this.readExistingContent(resolvedPath);
            const proposedContent = change.proposedContent ?? '';
            const operation = change.operation ?? (originalContent ? 'update' : 'create');
            const tempChange = {
                ...change,
                operation,
                originalContent,
                proposedContent,
            };
            const preservationError = this.validateContentPreservation(tempChange);
            if (preservationError) {
                console.error(`[KLYR] Content preservation warning: ${preservationError.message}`);
            }
            changes.push({
                ...change,
                operation,
                originalContent,
                proposedContent,
                diff: buildDiff(change.path, originalContent, proposedContent),
            });
        }
        return {
            summary: draft.summary,
            rationale: draft.rationale,
            changes,
        };
    }
    async apply(preview, decision, workspaceRoot) {
        const result = {
            applied: 0,
            rejected: 0,
            changedPaths: [],
            errors: [],
        };
        if (decision === 'reject') {
            result.rejected = preview.changes.length;
            return result;
        }
        for (const change of preview.changes) {
            try {
                const filePath = this.resolveWorkspacePath(workspaceRoot, change.path);
                if (!this.isWithinWorkspace(filePath, workspaceRoot)) {
                    result.errors.push({
                        path: change.path,
                        message: 'Path escapes workspace root.',
                    });
                    continue;
                }
                const operation = this.resolveOperation(change);
                if (operation !== 'delete' && !change.proposedContent) {
                    result.errors.push({
                        path: change.path,
                        message: 'Missing proposed content.',
                    });
                    continue;
                }
                if (operation === 'delete') {
                    const existsOnDisk = await this.pathExists(filePath);
                    if (!existsOnDisk) {
                        result.errors.push({
                            path: change.path,
                            message: 'Cannot delete because the file does not exist.',
                        });
                        continue;
                    }
                    const backupPath = await this.backupBeforeDelete(workspaceRoot, filePath, change.path);
                    await fs.unlink(filePath);
                    result.applied += 1;
                    result.changedPaths.push(`${change.path} (backup: ${backupPath})`);
                    continue;
                }
                const existingContent = await this.readExistingContent(filePath);
                if (existingContent === (change.proposedContent ?? '')) {
                    continue;
                }
                const dir = path.dirname(filePath);
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(filePath, change.proposedContent ?? '', 'utf-8');
                result.applied += 1;
                result.changedPaths.push(change.path);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error.';
                result.errors.push({
                    path: change.path,
                    message,
                });
            }
        }
        return result;
    }
    resolveWorkspacePath(workspaceRoot, relativePath) {
        return path.resolve(workspaceRoot, relativePath);
    }
    isWithinWorkspace(candidatePath, workspaceRoot) {
        const normalizedRoot = path.resolve(workspaceRoot);
        const normalizedCandidate = path.resolve(candidatePath);
        return (normalizedCandidate === normalizedRoot ||
            normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`));
    }
    async readExistingContent(candidatePath) {
        try {
            return await fs.readFile(candidatePath, 'utf-8');
        }
        catch {
            return '';
        }
    }
    resolveOperation(change) {
        if (change.operation) {
            return change.operation;
        }
        return change.originalContent ? 'update' : 'create';
    }
    async pathExists(candidatePath) {
        try {
            const stat = await fs.stat(candidatePath);
            return stat.isFile();
        }
        catch {
            return false;
        }
    }
    async backupBeforeDelete(workspaceRoot, absolutePath, relativePath) {
        const safeRelative = relativePath.replace(/[\\/:*?"<>|]/g, '_');
        const backupFileName = `${Date.now()}-${safeRelative}.bak`;
        const backupRoot = path.join(workspaceRoot, this.backupDirName);
        const backupPath = path.join(backupRoot, backupFileName);
        await fs.mkdir(backupRoot, { recursive: true });
        const original = await fs.readFile(absolutePath, 'utf-8');
        await fs.writeFile(backupPath, original, 'utf-8');
        return path.relative(workspaceRoot, backupPath).replace(/\\/g, '/');
    }
    validateContentPreservation(change) {
        if (change.operation === 'update' && change.originalContent) {
            const originalLength = change.originalContent.length;
            const proposedLength = change.proposedContent.length;
            if (proposedLength < originalLength) {
                const lostChars = originalLength - proposedLength;
                const lostPercent = ((lostChars / originalLength) * 100).toFixed(1);
                return {
                    code: 'CONTENT_LOSS_DETECTED',
                    message: `PROPOSED CONTENT LOSS: ${lostChars} characters (${lostPercent}%) of original file content would be deleted. This is likely an error. Original: ${originalLength} chars, Proposed: ${proposedLength} chars.`,
                    file: change.path,
                };
            }
            if (!change.proposedContent.includes(change.originalContent)) {
                return {
                    code: 'CONTENT_NOT_PRESERVED',
                    message: `Original content not found in proposed changes for ${change.path}. The entire original file content must be preserved in the proposed update.`,
                    file: change.path,
                };
            }
        }
        if (change.operation === 'delete') {
            return null;
        }
        return null;
    }
}
exports.FileSystemExecutor = FileSystemExecutor;
class PreviewOnlyExecutor {
    async preview(draft) {
        return {
            summary: draft.summary,
            rationale: draft.rationale,
            changes: draft.changes.map((change) => ({
                ...change,
                operation: change.operation ?? 'update',
                originalContent: change.originalContent ?? '',
                proposedContent: change.proposedContent ?? '',
            })),
        };
    }
    async apply(_, decision) {
        return {
            applied: 0,
            rejected: decision === 'reject' ? 1 : 0,
            changedPaths: [],
            errors: [],
        };
    }
}
exports.PreviewOnlyExecutor = PreviewOnlyExecutor;
function buildDiff(pathLabel, originalContent, proposedContent) {
    const originalLines = splitLines(originalContent);
    const proposedLines = splitLines(proposedContent);
    let prefix = 0;
    while (prefix < originalLines.length &&
        prefix < proposedLines.length &&
        originalLines[prefix] === proposedLines[prefix]) {
        prefix += 1;
    }
    let suffix = 0;
    while (suffix + prefix < originalLines.length &&
        suffix + prefix < proposedLines.length &&
        originalLines[originalLines.length - 1 - suffix] === proposedLines[proposedLines.length - 1 - suffix]) {
        suffix += 1;
    }
    const removed = originalLines.slice(prefix, Math.max(prefix, originalLines.length - suffix));
    const added = proposedLines.slice(prefix, Math.max(prefix, proposedLines.length - suffix));
    const contextBefore = originalLines.slice(Math.max(0, prefix - 2), prefix);
    const contextAfter = originalLines.slice(Math.max(prefix, originalLines.length - suffix), Math.min(originalLines.length, originalLines.length - suffix + 2));
    const lines = [`--- a/${pathLabel}`, `+++ b/${pathLabel}`];
    if (removed.length === 0 && added.length === 0) {
        lines.push('@@ -1,0 +1,0 @@');
        lines.push('  No textual changes.');
        return lines.join('\n');
    }
    lines.push(`@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`);
    for (const line of contextBefore) {
        lines.push(` ${line}`);
    }
    for (const line of removed) {
        lines.push(`-${line}`);
    }
    for (const line of added) {
        lines.push(`+${line}`);
    }
    for (const line of contextAfter) {
        lines.push(` ${line}`);
    }
    return lines.join('\n');
}
function splitLines(value) {
    if (!value) {
        return [];
    }
    return value.replace(/\r\n/g, '\n').split('\n');
}
//# sourceMappingURL=executor.js.map