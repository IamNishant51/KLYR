# Local Toolsmith Agent (for Ollama Agent Extension)

Maintainer: NISHANT

An AI-ML backend service that can:

- Research web and GitHub trends
- Learn from research notes locally
- Propose new extension tools with Groq LLM
- Generate files for those tools
- Create a branch and open a PR for human review before merge
- Generate a task report README with implementation and testing guidance

This project is designed to power your VS Code extension improvement loop.

## What It Does

1. Collects research signals from GitHub and optional web URLs
2. Stores local learning snapshots in `data/knowledge.jsonl`
3. Uses Groq API to produce a structured tool proposal (JSON)
4. Saves proposals to `outputs/`
5. Optionally applies generated files into a target repo on a new branch
6. Optionally opens a PR with `gh` CLI
7. Adds `AGENT_TASK_REPORT.md` describing what was built and how to test it

All merges remain manual and human-reviewed.

## Setup

1. Create virtual environment

```bash
python -m venv .venv
source .venv/Scripts/activate  # Windows (Git Bash)
```

2. Install dependencies

```bash
pip install -r requirements.txt
pip install -e .
```

3. Configure environment

```bash
cp .env.example .env
```

Set at least:

- `GROQ_API_KEY`
- `GROQ_MODEL` (example: `llama-3.3-70b-versatile`)
- `GITHUB_TOKEN` (optional, but helps with higher API limits)
- `BRAVE_API_KEY` and/or `SERPAPI_KEY` (optional, enables broader web search)

## CLI Usage

### 1. Research only

```bash
python -m toolsmith.cli research \
  --focus "VS Code extension developer productivity" \
  --github-query "vscode extension ai coding" \
  --web-url "https://code.visualstudio.com/api"
```

### 2. Generate a proposal only

```bash
python -m toolsmith.cli propose-tool \
  --focus "Better code review comments command for extension"
```

### 3. End-to-end cycle with PR

```bash
python -m toolsmith.cli run-cycle \
  --focus "Add semantic commit assistant tool" \
  --target-repo "C:/path/to/Ollama-Agent-vs-code-extension" \
  --base-branch main \
  --open-pr
```

### 4. Broad internet + GitHub competitor cycle

```bash
python -m toolsmith.cli run-broad-cycle \
  --focus "Add feature parity for context-aware diff review" \
  --target-repo "C:/path/to/Ollama-Agent-vs-code-extension" \
  --base-branch main \
  --open-pr
```

## Notes

- This project writes only to local disk unless you set `--open-pr`.
- PR creation requires `gh` CLI authenticated (`gh auth status`).
- Generated code must still be reviewed and tested by you.
- "Whole internet" in practice means broad sampled discovery (search APIs + seeded crawling), not exhaustive indexing of all websites.

## Next Integration Step

After you pull your extension repo, point `--target-repo` to it and run `run-cycle`. The produced branch/PR becomes your controlled review gate.
