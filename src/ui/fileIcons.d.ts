export interface FileIconInfo {
    codicon: string;
    color: string;
    label: string;
}
export declare function getFileIcon(filePath: string): FileIconInfo;
export declare function getFileIconHtml(filePath: string): string;
export declare function getAllSupportedExtensions(): string[];
