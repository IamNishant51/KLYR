"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopToolExecutor = exports.AVAILABLE_TOOLS = void 0;
exports.AVAILABLE_TOOLS = [
    {
        id: 'read_file',
        name: 'Read File',
        description: 'Read the full content of a file from the workspace.',
        usage: '{"toolId": "read_file", "input": {"path": "src/file.ts"}}',
    },
    {
        id: 'list_files',
        name: 'List Files',
        description: 'List files in a directory.',
        usage: '{"toolId": "list_files", "input": {"directory": "src"}}',
    },
    {
        id: 'search_files',
        name: 'Search Files',
        description: 'Search for files matching a pattern.',
        usage: '{"toolId": "search_files", "input": {"pattern": "*.ts", "maxResults": 10}}',
    },
    {
        id: 'check_syntax',
        name: 'Check Syntax',
        description: 'Check if proposed code has syntax errors.',
        usage: '{"toolId": "check_syntax", "input": {"code": "const x = 1;", "language": "typescript"}}',
    },
    {
        id: 'check_imports',
        name: 'Check Imports',
        description: 'Check if imports in code are available.',
        usage: '{"toolId": "check_imports", "input": {"code": "import lodash from lodash;", "language": "typescript"}}',
    },
];
class NoopToolExecutor {
    async execute(_) {
        return {
            success: false,
            error: 'Tool execution not implemented.',
        };
    }
}
exports.NoopToolExecutor = NoopToolExecutor;
//# sourceMappingURL=tools.js.map