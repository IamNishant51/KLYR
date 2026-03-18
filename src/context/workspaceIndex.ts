import * as fs from 'fs/promises';
import * as path from 'path';
import type { ContextDocument } from './contextEngine';

export interface FileNode {
  path: string;
  isDirectory: boolean;
  size?: number;
  lastModified?: number;
}

export interface WorkspaceIndex {
  root: string;
  files: FileNode[];
  packageJson?: Record<string, unknown>;
  tsconfig?: Record<string, unknown>;
}

export interface WorkspaceDocumentReadOptions {
  maxFiles?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  priorityPaths?: string[];
}

export async function indexWorkspace(root: string): Promise<WorkspaceIndex> {
  const files: FileNode[] = [];
  const maxFiles = 1000; // Increased from 500
  const maxDepth = 12; // Increased from 8
  const ignoreDirs = new Set([
    'node_modules',
    '.git',
    '.vscode',
    '.env',
    '__pycache__',
    '.pytest_cache',
    'venv',
    '.venv',
    'env',
    '.env.local',
    '.nyc_output',
    '.next',
    '.nuxt',
    'dist-ssr',
  ]);

  async function walk(dir: string, depth: number): Promise<void> {
    if (files.length >= maxFiles || depth > maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) {
          break;
        }

        // Skip hidden files and ignored directories
        if (entry.name.startsWith('.') && !entry.isDirectory()) {
          continue;
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
        } else {
          try {
            const stat = await fs.stat(fullPath);
            // Increase file size limit to 2MB to capture larger files like research.py
            if (stat.size > 2 * 1024 * 1024) {
              continue;
            }
            files.push({
              path: relPath,
              isDirectory: false,
              size: stat.size,
              lastModified: stat.mtime.getTime(),
            });
          } catch {
            // Ignore stat errors.
          }
        }
      }
    } catch {
      // Ignore read errors.
    }
  }

  await walk(root, 0);

  let packageJson: Record<string, unknown> | undefined;
  let tsconfig: Record<string, unknown> | undefined;

  try {
    const pkgPath = path.join(root, 'package.json');
    const pkgData = await fs.readFile(pkgPath, 'utf-8');
    packageJson = JSON.parse(pkgData) as Record<string, unknown>;
  } catch {
    // Ignore missing or invalid package.json.
  }

  try {
    const tsPath = path.join(root, 'tsconfig.json');
    const tsData = await fs.readFile(tsPath, 'utf-8');
    tsconfig = JSON.parse(tsData) as Record<string, unknown>;
  } catch {
    // Ignore missing or invalid tsconfig.json.
  }

  return {
    root,
    files,
    packageJson,
    tsconfig,
  };
}

export async function readWorkspaceDocuments(
  index: WorkspaceIndex,
  options: WorkspaceDocumentReadOptions = {}
): Promise<ContextDocument[]> {
  const maxFiles = options.maxFiles ?? 200; // Increased from 80
  const maxFileSize = options.maxFileSize ?? 1024 * 1024; // Increased from 200KB to 1MB
  const maxTotalSize = options.maxTotalSize ?? 5 * 1024 * 1024; // Increased from 500KB to 5MB
  const priorityPaths = new Set((options.priorityPaths ?? []).map((item) => normalize(item)));

  const candidates = index.files
    .filter((file) => !file.isDirectory && isTextLikeFile(file.path))
    .sort((left, right) => {
      const leftPriority = priorityPaths.has(normalize(path.join(index.root, left.path))) ? 1 : 0;
      const rightPriority = priorityPaths.has(normalize(path.join(index.root, right.path))) ? 1 : 0;
      return rightPriority - leftPriority;
    });

  const documents: ContextDocument[] = [];
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
    } catch {
      // Ignore unreadable files.
    }
  }

  return documents;
}

export function buildWorkspaceOutline(index: WorkspaceIndex, maxEntries = 80): string {
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

export function summarizeDependencies(index: WorkspaceIndex): string[] {
  const pkg = index.packageJson as
    | {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      }
    | undefined;

  const values = new Set<string>();
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

function isTextLikeFile(filePath: string): boolean {
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
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.hpp',
    '.cs',
    '.go',
    '.rs',
    '.rb',
    '.php',
    '.swift',
    '.kt',
    '.gradle',
    '.xml',
    '.sql',
    '.sh',
    '.bash',
    '.env',
    '.gitignore',
    '.txt',
  ]).has(extension);
}

function buildPathTags(filePath: string): string[] {
  return normalize(filePath)
    .split('/')
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/');
}
