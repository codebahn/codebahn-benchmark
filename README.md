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

The parser separates platform wait time (MCP call duration) from model thinking time, and counts tokens: peak context, input (split by cache), output, and the run cost. The comparison reports per-tool latency, total platform wait, and context cost.

Latency tells you how long a workflow waited. Tokens tell you what it cost to carry the results, which is the number that moves when tool responses get slimmer.

## Payload benchmark

`pnpm payload` measures how many bytes a review operation costs an agent, before and after the MCP response work, against one live instance. No agent, no LLM, no second deployment.

The "before" side is still reachable on the current binary: the raw REST API returns the full objects the MCP layer now slims, and the compare endpoint still takes the query parameters the tools used to leave at their defaults.

```bash
pnpm payload --dry-run              # print the requests without sending them
CODEBAHN_TOKEN=... pnpm payload     # median of 5 iterations per side
CODEBAHN_TOKEN=... pnpm payload --iterations 20
```

The token is read from the environment rather than argv so it stays out of `ps`. Targets default to a pinned range on `codebahn/codebahn-forgejo` (64 commits, 427 files) so runs stay comparable; override with `CB_HOST`, `CB_OWNER`, `CB_REPO`, `CB_PR`, `CB_BASE` and `CB_HEAD`.

Byte counts are exact. Token figures in the output are bytes/4 estimates: exact counts only exist for an agent run, where they come from the API's usage field.

## Development

```bash
pnpm test     # vitest, src/ only
pnpm lint     # biome
pnpm format   # biome, writing fixes
```

`seed/` is the benchmark fixture and carries deliberately failing tests, so neither the test run nor the linter covers it. `visualization.html` is not linted yet.

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
