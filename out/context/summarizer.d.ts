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
export declare class Summarizer {
    /**
     * Generate a file-level summary from code
     */
    summarizeFile(content: string, filePath: string): FileSummary;
    /**
     * Generate a folder-level summary from file summaries
     */
    summarizeFolder(folderPath: string, fileSummaries: FileSummary[], subfolders?: FolderSummary[]): FolderSummary;
    /**
     * Generate a project-level summary
     */
    summarizeProject(projectRoot: string, name: string, directorySummary: FolderSummary, packageJsonContent?: string): ProjectSummary;
    private extractExports;
    private extractDependencies;
    private extractKeyDefinitions;
    private assessComplexity;
    private assessFolderComplexity;
    private inferPurpose;
    private findCommonTheme;
    private inferArchitecture;
    private flattenFolderSummaries;
    private deduplicateStrings;
}
