# Codebahn Bench

Measure how fast your coding agent works on [Codebahn](https://codebahn.net) vs GitHub.

Give Claude Code the same task on both platforms. Parse the transcripts. Compare platform wait time.

## 1. Push the seed repo

The `seed/` directory is a small TypeScript project with two known bugs. Push it to both platforms:

```bash
cd seed
git init && git add -A && git commit -m "init"

# Create repos on both platforms first (via web UI), then push:
git remote add codebahn https://codebahn.net/<owner>/data-utils.git
git remote add github https://github.com/<owner>/data-utils.git
git push codebahn main
git push github main
```

## 2. Create the issues

Configure MCP access for each platform:

```bash
cd agent
cp mcp-codebahn.example.json mcp-codebahn.json   # Codebahn: hosted MCP, no config needed
cp mcp-github.example.json mcp-github.json        # GitHub: add your PAT
```

Then create the seeded issues via MCP:

```bash
./setup.sh codebahn <owner> data-utils
./setup.sh github <owner> data-utils
```

This creates two bugs and one enhancement request on each platform.

## 3. Run the benchmark

```bash
./run.sh codebahn <owner> data-utils
./run.sh github <owner> data-utils
```

Each run launches Claude Code with the MCP tools for one platform. The agent lists issues, finds the email validation bug, reads the code, fixes it, writes tests, and opens a PR.

## 4. Compare

```bash
cd ..
pnpm install
pnpm parse agent/results/codebahn-*/stream.jsonl
pnpm parse agent/results/github-*/stream.jsonl
pnpm compare agent/results/codebahn-*/*-parsed.json \
             agent/results/github-*/*-parsed.json
```

The parser separates platform wait time (MCP call duration) from model thinking time. The comparison reports per-tool latency and total platform wait.

## What the agent sees

The prompt:

> List the open issues. Find the bug about email validation. Browse the code, fix the bug, add tests, and open a pull request.

It discovers the MCP tools, reads the issues, understands the code, and ships a fix. The PR is left open for review.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- Node.js 20+ (for the parser)
- Accounts on both platforms

### Tokens

**Codebahn**: the agent benchmark authenticates through the hosted MCP server. For pushing the seed repo, use a standard git credential.

**GitHub**: a classic PAT with `repo` scope, or a fine-grained PAT with Contents (R/W), Issues (R/W), Pull requests (R/W), and Actions (Read).
