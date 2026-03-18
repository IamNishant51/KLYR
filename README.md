# Klyr: AI-Powered Code Assistant for VS Code

A production-grade AI coding assistant for VS Code powered by **local LLMs via Ollama**. Deterministic code generation with strong context awareness, no external API dependencies, and safety-first file operations.

## 🚀 Features

- **Local LLM Integration**: Works with models like `qwen2.5-coder`, `deepseek-coder`, etc. via Ollama
- **Deterministic Code Generation**: Zero hallucinations via AST-based validation + import auditing
- **Smart Context Engine**: Reads your entire workspace (with size limits) and retrieves relevant files on demand
- **Agent Pipeline**: Planner → Context → Coder → Validator → Executor with automatic fix loops
- **Diff Preview UI**: Review changes before applying to disk
- **Memory System**: Learns from prior requests for faster resolution
- **Type-Safe**: Full TypeScript with strict mode enabled

## 📋 Requirements

- VS Code 1.110.0 or newer
- **Ollama** running locally (https://ollama.ai)
- Node.js 16+ and npm

## 🔧 Setup

### 1. Install Ollama

Download and install [Ollama](https://ollama.ai). Start the Ollama service:

```bash
ollama serve
```

### 2. Pull a Model

```bash
ollama pull qwen2.5-coder  # Recommended for code
# or
ollama pull deepseek-coder
```

### 3. Build the Extension

From the `klyr` directory:

```bash
npm install
npm run compile
```

### 4. Load the Extension in VS Code

- Open VS Code
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
- Run `Developer: Install Extension from Location`
- Select the `klyr` folder

Or, use the VS Code Extension host via the run task:

```bash
npm run watch
```

Then press `F5` to launch the extension in debug mode.

## 🎯 Usage

1. **Open a workspace folder** in VS Code
2. Press `Ctrl+Shift+P` and run **Klyr: Open Chat**
3. Type a request:
   - "refactor this file for readability"
   - "fix the bug in the login handler"
   - "add unit tests for UserService"
   - "create a validation helper"
4. Review the proposed diff
5. Click **Apply** or **Reject**

## ⚙️ Configuration

Klyr can be configured via VS Code settings under `klyr`:

```jsonc
{
  "klyr.ollama.baseUrl": "http://localhost:11434",    // Ollama server URL
  "klyr.ollama.model": "qwen2.5-coder",               // Model name
  "klyr.ollama.temperature": 0,                       // 0 = deterministic, 1 = creative
  "klyr.ollama.timeoutMs": 60000,                     // Request timeout
  "klyr.ollama.maxRetries": 2,                        // Retry attempts
  "klyr.ollama.retryBackoffMs": 800                   // Backoff between retries
}
```

## 💻 User Interface

The Klyr chat panel features a modern, GitHub Copilot-inspired interface with the following components:

### Header Controls
- **Mode Selector**: Switch between **Agent** (chat-based conversation) and **Plan** (structured execution planning) modes
- **Model Selector**: View and switch between all your downloaded Ollama models
  - Automatically fetches available models from your Ollama instance on startup
  - Shows all models in a dropdown for easy switching
  - Falls back to configured default model if fetch fails

### Chat Panel (Left Side)
- Clean, conversation-based message interface
- Displays user queries and AI responses in distinct message bubbles
- Input textarea with smart keyboard support (Ctrl/Cmd+Enter to send)
- Real-time response updates

### Review Sidebar (Right Side)
- **Plan**: Shows extracted intent, goal, execution steps, and guardrails
- **Context**: Lists retrieved files relevant to your request
- **Diff Preview**: Shows exact changes to be applied with operation type (create/update/delete)
- **Action Buttons**: Apply or Reject the proposed changes

## ⚙️ Configuration

Klyr can be configured via VS Code settings under `klyr`:

```
src/
  extension.ts              # VS Code integration + command registration
  /agent/
    planner.ts             # Intent extraction + step planning
    coder.ts               # Code generation interface
    ollamaCoder.ts         # Ollama-backed coder
    validator.ts           # AST-based validation + import checks
    executor.ts            # File writing with safety checks
    fixer.ts               # Retry loop for failed validations
    tools.ts               # Tool definitions (future: tool use in agent)
  /context/
    contextEngine.ts       # Embedding-based retrieval
    embeddings.ts          # Naive embedding provider
    workspaceIndex.ts      # Workspace file indexing
    retriever.ts           # Context retrieval helpers
    memory.ts              # Memory store for prior requests
  /llm/
    ollamaClient.ts        # Ollama HTTP client (streaming + retry)
  /ui/
    webview.ts             # Chat panel + diff preview UI
    components/
      chatPanel.ts         # Chat message rendering
      diffPreview.ts       # Diff preview rendering
  /core/
    config.ts              # Configuration + logging
    pipeline.ts            # End-to-end orchestrator
  /test/
    extension.test.ts      # Unit & integration tests
```

## 🔒 Safety & Determinism

- **No Hallucinated APIs**: Validator rejects imports not in `package.json` or Node builtins
- **Syntax Validation**: Uses TypeScript compiler API to parse and validate code
- **File Escaping**: Executor blocks paths that escape the workspace root
- **Deterministic Mode**: Temperature set to 0 by default for reproducible outputs
- **Proposed Content Required**: Code must include full file content before validation
- **Size Limits**: Workspace indexing is bounded to prevent memory bloat

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run watch-tests
```

Tests cover:
- Validator: syntax errors, import validation, local file resolution
- Executor: file writing, path safety
- Context: retrieval and ranking
- Pipeline: end-to-end flow

## 🛠️ Development

- **Compile TS to JS**: `npm run compile`
- **Watch mode (auto-compile)**: `npm run watch`
- **Package extension**: `npm run package`
- **Lint**: `npm run lint`

## 📝 Notes

- Ollama must be running before using the extension
- Initially, the coder is a noop (no-op). Wire it to `OllamaCoder` for real generations
- The planner uses keyword matching; enhance with the Ollama client for NLP-based planning
- Consider adding a vector DB (Chroma) for better context retrieval at scale

## 📄 License

MIT

---

**Built for precision. Built for local. Built for independence.**

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
