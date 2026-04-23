import * as fs from 'fs/promises';
import * as path from 'path';

export interface GrepToolInput {
  query: string;
  path?: string;
  filePattern?: string;
  caseSensitive?: boolean;
  regex?: boolean;
  context?: number;
  maxResults?: number;
}

export interface GrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  match: string;
}

export interface GrepToolResult {
  success: boolean;
  matches: GrepMatch[];
  totalMatches: number;
  searchedFiles: number;
  error?: string;
}

export class GrepTool {
  constructor(private workspaceRoot: string) {}

  async execute(input: GrepToolInput): Promise<GrepToolResult> {
    const matches: GrepMatch[] = [];
    let searchedFiles = 0;

    try {
      const searchPath = input.path
        ? path.isAbsolute(input.path)
          ? input.path
          : path.resolve(this.workspaceRoot, input.path)
        : this.workspaceRoot;

      const pattern = input.regex
        ? new RegExp(input.query, input.caseSensitive ? 'g' : 'gi')
        : null;

      const searchPattern = input.query;

      const files = await this.findFiles(searchPath, input.filePattern);

      for (const file of files) {
        searchedFiles++;
        if (matches.length >= (input.maxResults ?? 1000)) break;

        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let found = false;

            if (pattern) {
              const lineMatches = line.match(pattern);
              found = lineMatches !== null;
            } else {
              found = input.caseSensitive
                ? line.includes(searchPattern)
                : line.toLowerCase().includes(searchPattern.toLowerCase());
            }

            if (found) {
              const matchStart = input.caseSensitive || pattern
                ? line.indexOf(pattern ? String(line.match(pattern)?.[0]) : searchPattern)
                : line.toLowerCase().indexOf(searchPattern.toLowerCase());

              const contextLines: string[] = [];
              if (input.context && input.context > 0) {
                const startCtx = Math.max(0, i - input.context);
                const endCtx = Math.min(lines.length - 1, i + input.context);
                for (let j = startCtx; j <= endCtx; j++) {
                  contextLines.push(`${j + 1}: ${lines[j]}`);
                }
              }

              matches.push({
                file: path.relative(this.workspaceRoot, file),
                line: i + 1,
                column: matchStart >= 0 ? matchStart + 1 : 0,
                content: input.context ? contextLines.join('\n') : line,
                match: pattern ? String(line.match(pattern)?.[0]) : searchPattern,
              });
            }
          }
        } catch {
          continue;
        }
      }

      return {
        success: true,
        matches,
        totalMatches: matches.length,
        searchedFiles,
      };
    } catch (error) {
      return {
        success: false,
        matches: [],
        totalMatches: 0,
        searchedFiles,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async findFiles(dir: string, pattern?: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.findFiles(fullPath, pattern)));
      } else if (entry.isFile()) {
        if (pattern) {
          const regex = new RegExp(pattern.replace('*', '.*'));
          if (regex.test(entry.name)) {
            files.push(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    }

    return files;
  }
}
