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
exports.ContextOrchestrator = void 0;
const chunker_1 = require("./chunker");
const summarizer_1 = require("./summarizer");
const optimizer_1 = require("./optimizer");
const ragRetriever_1 = require("./ragRetriever");
const memoryManager_1 = require("./memoryManager");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Central orchestrator for the 1M token context system
 * Coordinates: chunking → summarization → RAG → optimization → validation
 */
class ContextOrchestrator {
    chunker;
    summarizer;
    optimizer;
    retriever;
    memory;
    config;
    constructor(config = {}) {
        this.chunker = new chunker_1.CodeChunker();
        this.summarizer = new summarizer_1.Summarizer();
        this.optimizer = new optimizer_1.ContextOptimizer();
        this.retriever = new ragRetriever_1.RAGRetriever();
        this.memory = new memoryManager_1.MemoryManager();
        this.config = {
            modelTokenLimit: config.modelTokenLimit || 8000,
            responseBuffer: config.responseBuffer || 0.2,
            topKRetrieval: config.topKRetrieval || 10,
            maxChunkSize: config.maxChunkSize || 500,
            enableMemory: config.enableMemory !== false,
        };
    }
    /**
     * Main entry point: Process query and return optimized context
     */
    async orchestrate(request) {
        const startTime = Date.now();
        const warnings = [];
        try {
            // 1. Read and chunk workspace files
            const chunks = await this.chunkWorkspace(request.workspacePath);
            if (chunks.length === 0) {
                warnings.push('No code chunks found in workspace');
            }
            // 2. Summarize files and folders
            const summaries = await this.summarizeWorkspace(request.workspacePath);
            // 3. Retrieve relevant context via RAG
            const retrieved = await this.retriever.retrieve(request.query, chunks, summaries, this.config.enableMemory ? this.memory.getShortTerm(20) : [], this.config.topKRetrieval);
            // 4. Create budget
            const budget = this.optimizer.createBudget(this.config.modelTokenLimit, this.config.responseBuffer);
            // 5. Optimize context within budget
            const summaryStrings = retrieved.summaries.map((s) => 'filePath' in s ? s.purpose : 'folderPath' in s ? s.purpose : s.description);
            const optimized = this.optimizer.optimizeContext(retrieved.chunks, summaryStrings, request.conversationHistory || [], budget);
            // 6. Validate context
            const isValid = this.optimizer.validateContext(optimized, budget);
            if (!isValid) {
                warnings.push('Context validation failed - some content may be truncated or filtered');
            }
            // 7. Build final formatted context
            const formattedContext = this.optimizer.buildContextString(optimized);
            // 8. Store in memory if enabled
            if (this.config.enableMemory) {
                this.memory.add({
                    id: `query-${Date.now()}`,
                    timestamp: Date.now(),
                    content: request.query,
                    type: 'conversation',
                    importance: 'medium',
                });
                if (optimized.chunks.length > 0) {
                    this.memory.add({
                        id: `context-${Date.now()}`,
                        timestamp: Date.now(),
                        content: `Retrieved ${optimized.chunks.length} chunks and ${optimized.summaries.length} summaries`,
                        type: 'context',
                        importance: 'high',
                    });
                }
            }
            return {
                formattedContext,
                chunks: optimized.chunks,
                summaries: retrieved.summaries, // Use original summaries, optimizer optimizes the string representations
                memory: request.includeMemory ? this.memory.getShortTerm(5) : [],
                tokenCount: optimized.totalTokens,
                efficiency: optimized.efficiency,
                warnings: [...warnings, ...optimized.warnings],
                retrievalTime: retrieved.retrievalTime,
            };
        }
        catch (error) {
            warnings.push(`Orchestration error: ${error instanceof Error ? error.message : String(error)}`);
            return {
                formattedContext: `Error processing context: ${error instanceof Error ? error.message : String(error)}`,
                chunks: [],
                summaries: [],
                memory: [],
                tokenCount: 0,
                efficiency: 0,
                warnings,
                retrievalTime: Date.now() - startTime,
            };
        }
    }
    /**
     * Chunk all files in workspace
     */
    async chunkWorkspace(workspacePath) {
        const chunks = [];
        const maxFiles = 1000;
        let processed = 0;
        const processDir = async (dir, depth = 0) => {
            if (depth > 12 || processed >= maxFiles)
                return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (processed >= maxFiles)
                        break;
                    const fullPath = path.join(dir, entry.name);
                    // Skip common ignore directories
                    if (entry.isDirectory()) {
                        if ([
                            'node_modules',
                            '.git',
                            'dist',
                            '.next',
                            '__pycache__',
                            '.venv',
                            'venv',
                            '.pytest_cache',
                        ].includes(entry.name)) {
                            continue;
                        }
                        await processDir(fullPath, depth + 1);
                    }
                    else if (entry.isFile()) {
                        if (this.isTextLikeFile(fullPath)) {
                            try {
                                const content = fs.readFileSync(fullPath, 'utf-8');
                                if (content.length > 1024 * 1024)
                                    return; // Skip >1MB files
                                const language = this.detectLanguage(fullPath);
                                const fileChunks = await this.chunker.chunkCode(fullPath, fullPath, content, language);
                                chunks.push(...fileChunks);
                                processed++;
                            }
                            catch {
                                // Skip files that can't be read
                            }
                        }
                    }
                }
            }
            catch {
                // Skip directories that can't be read
            }
        };
        await processDir(workspacePath);
        return chunks;
    }
    /**
     * Summarize all files and folders in workspace
     */
    async summarizeWorkspace(workspacePath) {
        const summaries = [];
        const maxFiles = 500;
        let processed = 0;
        // First pass: collect all file summaries
        const fileSummaries = [];
        const processDir = (dir, depth = 0) => {
            if (depth > 8 || processed >= maxFiles)
                return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (processed >= maxFiles)
                        break;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if ([
                            'node_modules',
                            '.git',
                            'dist',
                            '.next',
                            '__pycache__',
                            '.venv',
                            'venv',
                            '.pytest_cache',
                        ].includes(entry.name)) {
                            continue;
                        }
                        processDir(fullPath, depth + 1);
                    }
                    else if (entry.isFile()) {
                        if (this.isTextLikeFile(fullPath)) {
                            try {
                                const content = fs.readFileSync(fullPath, 'utf-8');
                                if (content.length > 1024 * 1024)
                                    return; // Skip >1MB files
                                const fileSummary = this.summarizer.summarizeFile(content, fullPath);
                                fileSummaries.push(fileSummary);
                                summaries.push(fileSummary);
                                processed++;
                            }
                            catch {
                                // Skip file summary if error
                            }
                        }
                    }
                }
            }
            catch {
                // Skip directories that can't be read
            }
        };
        processDir(workspacePath);
        // Create folder summary from collected files
        try {
            const folderSummary = this.summarizer.summarizeFolder(workspacePath, fileSummaries, []);
            summaries.push(folderSummary);
            // Try to create project summary
            try {
                const packageJsonPath = path.join(workspacePath, 'package.json');
                let packageJsonContent;
                if (fs.existsSync(packageJsonPath)) {
                    packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
                }
                const projectName = path.basename(workspacePath);
                const projectSummary = this.summarizer.summarizeProject(workspacePath, projectName, folderSummary, packageJsonContent);
                summaries.push(projectSummary);
            }
            catch {
                // Skip project summary if error
            }
        }
        catch {
            // Skip folder summary if error
        }
        return summaries;
    }
    /**
     * Detect file language from extension
     */
    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'javascript',
            '.jsx': 'javascript',
            '.tsx': 'javascript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
        };
        return languageMap[ext] || 'unknown';
    }
    /**
     * Check if file is text-like
     */
    isTextLikeFile(filePath) {
        const extensions = [
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
        ];
        const ext = path.extname(filePath).toLowerCase();
        return extensions.includes(ext);
    }
    /**
     * Estimate tokens in text (rough: 1 token ≈ 4 characters)
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
    /**
     * Add memory entry
     */
    addMemory(entry) {
        this.memory.add(entry);
    }
    /**
     * Get memory summary
     */
    getMemorySummary() {
        return this.memory.getSummary();
    }
    /**
     * Clear memory
     */
    clearMemory() {
        this.memory = new memoryManager_1.MemoryManager();
    }
    /**
     * Get retrieval statistics
     */
    getRetrieverStats() {
        return this.retriever.getStats();
    }
}
exports.ContextOrchestrator = ContextOrchestrator;
//# sourceMappingURL=orchestrator.js.map