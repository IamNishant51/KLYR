export interface FileSummary {
  filePath: string;
  fileId: string;
  purpose: string;
  mainExports: string[];
  dependencies: string[];
  keyFunctions: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  lineCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FolderSummary {
  folderPath: string;
  purpose: string;
  fileSummaries: FileSummary[];
  subfolders: FolderSummary[];
  complexity: 'simple' | 'moderate' | 'complex';
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  projectRoot: string;
  name: string;
  description: string;
  mainPurpose: string;
  keyFeatures: string[];
  architecture: string;
  dependencies: string[];
  directorySummary: FolderSummary;
  createdAt: number;
  updatedAt: number;
}

export class Summarizer {
  /**
   * Generate a file-level summary from code
   */
  summarizeFile(content: string, filePath: string): FileSummary {
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Extract main exports
    const mainExports = this.extractExports(content, filePath);

    // Extract dependencies
    const dependencies = this.extractDependencies(content, filePath);

    // Extract key functions/classes
    const keyFunctions = this.extractKeyDefinitions(content, filePath);

    // Determine complexity
    const complexity = this.assessComplexity(lines, keyFunctions.length, dependencies.length);

    // Generate purpose
    const purpose = this.inferPurpose(filePath, content, mainExports);

    return {
      filePath,
      fileId: filePath,
      purpose,
      mainExports,
      dependencies,
      keyFunctions,
      complexity,
      lineCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Generate a folder-level summary from file summaries
   */
  summarizeFolder(
    folderPath: string,
    fileSummaries: FileSummary[],
    subfolders: FolderSummary[] = []
  ): FolderSummary {
    // Find common purpose
    const purposes = fileSummaries.map((f) => f.purpose).filter(Boolean);
    const purpose = this.findCommonTheme(purposes) || `Contains ${fileSummaries.length} files`;

    // Assess complexity
    const complexities = fileSummaries.map((f) => f.complexity);
    const complexity = this.assessFolderComplexity(complexities);

    return {
      folderPath,
      purpose,
      fileSummaries,
      subfolders,
      complexity,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Generate a project-level summary
   */
  summarizeProject(
    projectRoot: string,
    name: string,
    directorySummary: FolderSummary,
    packageJsonContent?: string
  ): ProjectSummary {
    const allSummaries = this.flattenFolderSummaries(directorySummary);

    // Extract metadata from package.json if available
    let dependencies: string[] = [];
    if (packageJsonContent) {
      try {
        const pkg = JSON.parse(packageJsonContent);
        dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 20);
      } catch {
        // Ignore parsing errors
      }
    }

    // Determine main purpose
    const purposes = allSummaries.map((s) => s.purpose).filter(Boolean);
    const mainPurpose = this.findCommonTheme(purposes) || 'Multi-purpose project';

    // Extract key features
    const keyFunctions = this.deduplicateStrings(allSummaries.flatMap((s) => s.keyFunctions)).slice(
      0,
      15
    );

    return {
      projectRoot,
      name,
      description: mainPurpose,
      mainPurpose,
      keyFeatures: keyFunctions,
      architecture: this.inferArchitecture(directorySummary),
      dependencies,
      directorySummary,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private extractExports(content: string, filePath: string): string[] {
    const exports: string[] = [];

    // JavaScript/TypeScript exports
    if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      const exportMatches = content.match(
        /export\s+(default\s+)?(class|function|const|interface|type|enum)\s+(\w+)/g
      );
      if (exportMatches) {
        exportMatches.forEach((match) => {
          const name = match.split(/\s+/).pop();
          if (name && !exports.includes(name)) {
            exports.push(name);
          }
        });
      }
    }

    // Python exports
    if (filePath.match(/\.py$/)) {
      const classMatches = content.match(/^class\s+(\w+)/gm);
      const funcMatches = content.match(/^def\s+(\w+)/gm);
      if (classMatches) {
        classMatches.forEach((match) => {
          const name = match.replace(/^class\s+/, '');
          if (!exports.includes(name)) {
            exports.push(name);
          }
        });
      }
      if (funcMatches) {
        funcMatches.forEach((match) => {
          const name = match.replace(/^def\s+/, '');
          if (!exports.includes(name)) {
            exports.push(name);
          }
        });
      }
    }

    return exports.slice(0, 10);
  }

  private extractDependencies(content: string, filePath: string): string[] {
    const deps: string[] = [];

    // JavaScript/TypeScript imports
    if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      const importMatches = content.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
      if (importMatches) {
        importMatches.forEach((match) => {
          const dep = match.match(/from\s+['"]([^'"]+)['"]/)?.[1];
          if (dep && !deps.includes(dep)) {
            deps.push(dep);
          }
        });
      }
    }

    // Python imports
    if (filePath.match(/\.py$/)) {
      const importMatches = content.match(/^(import|from)\s+([^\n]+)/gm);
      if (importMatches) {
        importMatches.forEach((match) => {
          const parts = match.split(/[\s,]+/);
          const module = parts[1];
          if (module && !deps.includes(module)) {
            deps.push(module);
          }
        });
      }
    }

    return deps.slice(0, 15);
  }

  private extractKeyDefinitions(content: string, filePath: string): string[] {
    const defs: string[] = [];

    // JavaScript/TypeScript
    if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      const funcMatches = content.match(/^(async\s+)?(function|const|let|var)\s+(\w+)\s*[\(=]/gm);
      const classMatches = content.match(/^class\s+(\w+)/gm);

      if (funcMatches) {
        funcMatches.slice(0, 8).forEach((match) => {
          const name = match.match(/\b(\w+)\s*[\(=]/)?.[1];
          if (name && !defs.includes(name)) {
            defs.push(name);
          }
        });
      }
      if (classMatches) {
        classMatches.slice(0, 5).forEach((match) => {
          const name = match.replace(/^class\s+/, '');
          if (!defs.includes(name)) {
            defs.push(name);
          }
        });
      }
    }

    // Python
    if (filePath.match(/\.py$/)) {
      const defMatches = content.match(/^def\s+(\w+)/gm);
      const classMatches = content.match(/^class\s+(\w+)/gm);

      if (defMatches) {
        defMatches.slice(0, 8).forEach((match) => {
          const name = match.replace(/^def\s+/, '');
          if (!defs.includes(name)) {
            defs.push(name);
          }
        });
      }
      if (classMatches) {
        classMatches.slice(0, 5).forEach((match) => {
          const name = match.replace(/^class\s+/, '');
          if (!defs.includes(name)) {
            defs.push(name);
          }
        });
      }
    }

    return defs;
  }

  private assessComplexity(
    lines: string[],
    functionCount: number,
    dependencyCount: number
  ): 'simple' | 'moderate' | 'complex' {
    const score = lines.length / 100 + functionCount / 2 + dependencyCount / 3;
    if (score < 5) return 'simple';
    if (score < 15) return 'moderate';
    return 'complex';
  }

  private assessFolderComplexity(complexities: Array<'simple' | 'moderate' | 'complex'>): 'simple' | 'moderate' | 'complex' {
    const complexCount = complexities.filter((c) => c === 'complex').length;
    const moderateCount = complexities.filter((c) => c === 'moderate').length;

    if (complexCount > complexities.length * 0.5) return 'complex';
    if (moderateCount > complexities.length * 0.5 || complexCount > 0) return 'moderate';
    return 'simple';
  }

  private inferPurpose(filePath: string, content: string, exports: string[]): string {
    // Infer from filename
    const fileName = filePath.split('/').pop() || '';

    if (fileName.includes('test') || fileName.includes('spec')) {
      return `Test suite for ${exports[0] || 'module'}`;
    }
    if (fileName.includes('config') || fileName.includes('settings')) {
      return 'Configuration file';
    }
    if (fileName.includes('util') || fileName.includes('helper')) {
      return `Utility functions: ${exports.slice(0, 3).join(', ')}`;
    }
    if (fileName.includes('type') || fileName.includes('interface')) {
      return `Type definitions: ${exports.slice(0, 3).join(', ')}`;
    }

    // Infer from content
    if (content.includes('export class') || content.includes('class ')) {
      return `${exports[0] || 'Module'} class and utilities`;
    }
    if (content.includes('function') || content.includes('const')) {
      return `Utility module: ${exports.slice(0, 2).join(', ')}`;
    }

    return `Module: ${exports.slice(0, 2).join(', ')} and related`;
  }

  private findCommonTheme(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];

    // Find common words
    const words = items.flatMap((item) => item.split(/\s+/));
    const wordCounts = new Map<string, number>();

    words.forEach((word) => {
      if (word.length > 3) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    });

    const sorted = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0]);

    return sorted.join(' ') || 'Multi-purpose';
  }

  private inferArchitecture(dir: FolderSummary): string {
    const folders = dir.subfolders.map((f) => f.folderPath.split('/').pop()).filter(Boolean);

    if (folders.includes('components') && folders.includes('services')) {
      return 'Component-service architecture';
    }
    if (folders.includes('models') && folders.includes('views') && folders.includes('controllers')) {
      return 'MVC architecture';
    }
    if (folders.includes('pages') || folders.includes('api')) {
      return 'Page/API architecture';
    }

    return 'Modular architecture';
  }

  private flattenFolderSummaries(folder: FolderSummary): FileSummary[] {
    return [
      ...folder.fileSummaries,
      ...folder.subfolders.flatMap((f) => this.flattenFolderSummaries(f)),
    ];
  }

  private deduplicateStrings(items: string[]): string[] {
    return Array.from(new Set(items));
  }
}
