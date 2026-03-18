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
exports.indexWorkspace = indexWorkspace;
exports.readWorkspaceDocuments = readWorkspaceDocuments;
exports.buildWorkspaceOutline = buildWorkspaceOutline;
exports.summarizeDependencies = summarizeDependencies;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
async function indexWorkspace(root) {
    const files = [];
    const maxFiles = 500;
    const maxDepth = 8;
    const ignoreDirs = new Set([
        'node_modules',
        'dist',
        'build',
        'out',
        '.git',
        '.vscode',
        'coverage',
    ]);
    async function walk(dir, depth) {
        if (files.length >= maxFiles || depth > maxDepth) {
            return;
        }
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (files.length >= maxFiles) {
                    break;
                }
                if (ignoreDirs.has(entry.name)) {
                    continue;
                }
                const fullPath = path.join(dir, entry.name);
                const relPath = path.relative(root, fullPath);
                if (entry.isDirectory()) {
                    files.push({
                        path: relPath,
                        isDirectory: true,
                    });
                    await walk(fullPath, depth + 1);
                }
                else {
                    try {
                        const stat = await fs.stat(fullPath);
                        if (stat.size > 500 * 1024) {
                            continue;
                        }
                        files.push({
                            path: relPath,
                            isDirectory: false,
                            size: stat.size,
                            lastModified: stat.mtime.getTime(),
                        });
                    }
                    catch {
                        // Ignore stat errors.
                    }
                }
            }
        }
        catch {
            // Ignore read errors.
        }
    }
    await walk(root, 0);
    let packageJson;
    let tsconfig;
    try {
        const pkgPath = path.join(root, 'package.json');
        const pkgData = await fs.readFile(pkgPath, 'utf-8');
        packageJson = JSON.parse(pkgData);
    }
    catch {
        // Ignore missing or invalid package.json.
    }
    try {
        const tsPath = path.join(root, 'tsconfig.json');
        const tsData = await fs.readFile(tsPath, 'utf-8');
        tsconfig = JSON.parse(tsData);
    }
    catch {
        // Ignore missing or invalid tsconfig.json.
    }
    return {
        root,
        files,
        packageJson,
        tsconfig,
    };
}
async function readWorkspaceDocuments(index, options = {}) {
    const maxFiles = options.maxFiles ?? 80;
    const maxFileSize = options.maxFileSize ?? 200 * 1024;
    const maxTotalSize = options.maxTotalSize ?? 500 * 1024;
    const priorityPaths = new Set((options.priorityPaths ?? []).map((item) => normalize(item)));
    const candidates = index.files
        .filter((file) => !file.isDirectory && isTextLikeFile(file.path))
        .sort((left, right) => {
        const leftPriority = priorityPaths.has(normalize(path.join(index.root, left.path))) ? 1 : 0;
        const rightPriority = priorityPaths.has(normalize(path.join(index.root, right.path))) ? 1 : 0;
        return rightPriority - leftPriority;
    });
    const documents = [];
    let totalSize = 0;
    for (const file of candidates) {
        if (documents.length >= maxFiles || totalSize >= maxTotalSize) {
            break;
        }
        const absolutePath = path.join(index.root, file.path);
        try {
            const stat = await fs.stat(absolutePath);
            if (stat.size > maxFileSize) {
                continue;
            }
            const content = await fs.readFile(absolutePath, 'utf-8');
            totalSize += content.length;
            documents.push({
                id: absolutePath,
                uri: absolutePath,
                title: file.path,
                content,
                updatedAt: stat.mtime.getTime(),
                source: 'workspace',
                tags: buildPathTags(file.path),
            });
        }
        catch {
            // Ignore unreadable files.
        }
    }
    return documents;
}
function buildWorkspaceOutline(index, maxEntries = 80) {
    const lines = ['Workspace outline:'];
    const files = index.files.slice(0, maxEntries);
    for (const entry of files) {
        lines.push(`- ${entry.isDirectory ? '[dir]' : '[file]'} ${entry.path}`);
    }
    if (index.files.length > maxEntries) {
        lines.push(`- ... ${index.files.length - maxEntries} more entries`);
    }
    return lines.join('\n');
}
function summarizeDependencies(index) {
    const pkg = index.packageJson;
    const values = new Set();
    for (const record of [pkg?.dependencies, pkg?.devDependencies, pkg?.peerDependencies]) {
        if (!record) {
            continue;
        }
        for (const key of Object.keys(record)) {
            values.add(key);
        }
    }
    return [...values].sort((left, right) => left.localeCompare(right));
}
function isTextLikeFile(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return new Set([
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.json',
        '.md',
        '.css',
        '.scss',
        '.html',
        '.yml',
        '.yaml',
    ]).has(extension);
}
function buildPathTags(filePath) {
    return normalize(filePath)
        .split('/')
        .filter(Boolean);
}
function normalize(value) {
    return value.replace(/\\/g, '/');
}
//# sourceMappingURL=workspaceIndex.js.map