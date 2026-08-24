# Codebahn vs GitHub: Performance Analysis

API latency and agent workflow benchmarks for EU-based development.

August 2026. Measured from Gothenburg, Sweden.

---

**116ms** median API response (Codebahn) vs **324ms** (GitHub). **2.8x faster** across 350 calls.

---

## Contents

1. [Summary](#1-summary)
2. [Method](#2-method)
3. [API latency results](#3-api-latency-results)
4. [Agent workflow results](#4-agent-workflow-results)
5. [Analysis](#5-analysis)
6. [Limitations](#6-limitations)
7. [How to use these numbers](#7-how-to-use-these-numbers)

## 1. Summary

We measured how fast Codebahn and GitHub respond to the same API calls from the same machine in Sweden. Two benchmarks: raw HTTP latency (curl, 350 calls, no MCP or agent), and agent workflow latency (Claude Code with MCP, 4 tasks, 8 sessions).

**API latency:** Codebahn responds in 116ms at p50 across 7 endpoints. GitHub responds in 324ms. That's 2.8x faster. At p95, the gap is similar: 215ms vs 434ms.

**Agent workflows:** Across 4 real coding tasks (fix two bugs, review a PR, explore a codebase), Codebahn's agent completed 53 MCP calls in 6.8 seconds of platform wait. GitHub's agent made 69 calls in 148.7 seconds. The raw API advantage compounds through the MCP layer, the MCP server architecture, and the agent's tool discovery behavior.

## 2. Method

### 2.1 Test environment

All measurements from a single machine in Gothenburg, Sweden. Codebahn runs on Scaleway in Paris (eu-west). GitHub runs on infrastructure primarily in the US.

Both platforms hosted identical private repositories (`data-utils`) with the same files, issues, and comments. The repository contained a small TypeScript project (8 files) with two seeded bugs and one enhancement request.

### 2.2 API latency benchmark

7 matched REST endpoints, 50 iterations each, both platforms called simultaneously per iteration. DNS and TLS warmed up before timing started. Measured with `curl -w "%{time_total}"`. No MCP, no agent, no LLM.

Endpoints tested:

- `GET /repos/{owner}/{repo}/issues` (list issues)
- `GET /repos/{owner}/{repo}/issues/1` (get single issue)
- `GET /repos/{owner}/{repo}/contents/` (list directory)
- `GET /repos/{owner}/{repo}/contents/src/validate.ts` (get file)
- `GET /repos/{owner}/{repo}/commits` (list commits)
- `GET /repos/{owner}/{repo}/branches` (list branches)
- `GET /repos/{owner}/{repo}/pulls` (list pull requests)

### 2.3 Agent workflow benchmark

Claude Code (claude-opus-4-6) ran the same task on each platform via MCP. Each platform had its own MCP server:

- **Codebahn:** hosted MCP endpoint at `codebahn.net/mcp`. The server runs on the same infrastructure as the platform. No local binary required.
- **GitHub:** `github-mcp-server` v1.10.1 (official GitHub MCP server, Go binary) running locally, connecting to `api.github.com` over HTTPS.

Four tasks, each run once per platform (8 sessions total):

- **Fix email validation bug:** read issue, browse code, fix the bug, write tests, create PR.
- **Fix currency formatting bug:** same workflow, different bug.
- **Review a pull request:** read PR, read diff, check code, submit review.
- **Explore codebase:** read all files, all issues, all PRs. Pure reads.

The agent received a short open-ended prompt ("find the email validation bug, fix it, open a PR") and discovered the MCP tools on its own. The transcript was parsed to separate platform wait time (MCP call duration) from model thinking time.

## 3. API latency results

350 calls per platform (7 endpoints, 50 iterations each). Reported as p50 and p95 in milliseconds.

| Endpoint | CB p50 | CB p95 | GH p50 | GH p95 | Ratio |
|---|---|---|---|---|---|
| List pull requests | 76 | 88 | 319 | 346 | 4.2x |
| List repo contents | 85 | 219 | 262 | 305 | 3.1x |
| Get issue | 100 | 118 | 344 | 404 | 3.4x |
| Get file content | 116 | 161 | 264 | 297 | 2.3x |
| List issues | 123 | 144 | 405 | 458 | 3.3x |
| List branches | 139 | 161 | 310 | 358 | 2.2x |
| List commits | 206 | 237 | 359 | 436 | 1.7x |
| **Overall** | **116** | **215** | **324** | **434** | **2.8x** |

Codebahn's p50 ranges from 76ms to 206ms. GitHub's ranges from 262ms to 405ms. The gap is consistent across all endpoints: Codebahn is 1.7x to 4.2x faster per endpoint, 2.8x overall.

The p95 values show Codebahn's tail latency is well-controlled (215ms), while GitHub's is more variable (434ms). Codebahn's p95 is lower than GitHub's p50.

## 4. Agent workflow results

8 sessions total. Platform wait time extracted from Claude Code transcripts by pairing tool call and result timestamps.

| Task | CB wait | CB calls | GH wait | GH calls | Ratio |
|---|---|---|---|---|---|
| Fix email bug | 2.3s | 12 | 34.9s | 15 | 15.1x |
| Fix currency bug | 2.5s | 14 | 30.6s | 20 | 12.2x |
| Review PR | 0.7s | 8 | 17.4s | 12 | 25.5x |
| Explore codebase | 1.3s | 19 | 65.8s | 22 | 52.4x |
| **Total** | **6.8s** | **53** | **148.7s** | **69** | **22.0x** |

### 4.1 Per-call latency

| Metric | Codebahn | GitHub |
|---|---|---|
| Average per call | 128ms | 2,155ms |
| Fastest call | 40ms | 1,112ms |
| Slowest call | 578ms | 8,070ms |
| Read operations avg | 66ms | 2,565ms |
| Write operations avg | 459ms | 1,303ms |

### 4.2 GitHub latency escalation

In longer sessions, GitHub MCP call latency increases over time. The explore task shows this most clearly: the first call takes 1,116ms; the last takes 7,130ms. The same pattern appears in fix-email (calls 12 and 13 take 7,744ms and 8,070ms). Codebahn shows no escalation; its 19th call in the explore task (41ms) is comparable to its first (66ms).

> The escalation likely originates in the GitHub MCP server's session handling, not in GitHub's API. Each Claude Code session starts a fresh MCP server process, so the escalation resets between sessions. Within a session, the growing context window that the MCP server maintains (or growing request/response sizes) may be the cause.

### 4.3 Call count difference

The GitHub agent consistently made more MCP calls (69 vs 53 across all tasks). The extra calls fall into three categories:

- **Discovery calls:** `get_my_user_info` and `search_repos` appear in every GitHub session but never in Codebahn sessions. The GitHub MCP server appears to require these preamble calls before the agent can operate on a specific repo.
- **Retries:** `list_repo_issues` is called 2-3 times in some GitHub sessions (once in Codebahn). This suggests the first call didn't return the data the agent needed, possibly due to different response formatting.
- **Verification reads:** the GitHub agent reads files back after writing them more often than the Codebahn agent. This may reflect lower confidence in write success.

## 5. Analysis

### 5.1 Three layers of advantage

The 2.8x raw API advantage and the 12-52x agent advantage are not contradictory. They measure different things, and the agent experience compounds three factors:

**Network proximity (2.8x).** Codebahn runs in the EU; GitHub's API is served from the US. For an EU developer, every round-trip to Codebahn saves ~200ms. This is the layer measured by the curl benchmark. It's real, verifiable, and independent of MCP or agent behavior.

**MCP architecture.** Codebahn's MCP endpoint runs on the same infrastructure as the platform. A tool call goes directly from Claude Code to `codebahn.net/mcp`, which routes internally to the API. GitHub's path is longer: Claude Code starts a local Go binary, which makes HTTPS calls to `api.github.com`, serializes responses, and pipes them back through stdio. The local binary adds process overhead, and every call traverses the full HTTPS stack.

**MCP server behavior.** The GitHub MCP server adds discovery calls (`get_my_user_info`, `search_repos`) before productive work. It also suffers from latency escalation within a session. Codebahn's MCP server doesn't exhibit either behavior. The difference in call count (53 vs 69) means the GitHub agent does 30% more work, and each unit of work takes longer.

### 5.2 What compounds

A coding agent fixing a bug makes 12-20 MCP calls. At 2.8x per call (the raw API advantage), the cumulative difference across a 15-call session is roughly 3 seconds. But the MCP overhead and extra calls push the actual difference to 28-33 seconds per task. A developer running 10 agent tasks per day accumulates 4-5 minutes of platform wait on GitHub that doesn't exist on Codebahn.

The effect is larger for read-heavy workflows. Code review (8 vs 12 calls, 25.5x) and exploration (19 vs 22 calls, 52.4x) show the biggest gaps because reads dominate, and Codebahn's read latency (40-90ms) is dramatically lower than GitHub's via MCP (1,100-7,100ms).

## 6. Limitations

### 6.1 Single location

All measurements from Gothenburg, Sweden. A developer in the US would see a smaller advantage (GitHub is closer; Codebahn is farther). The API benchmark is specific to EU-to-EU vs EU-to-US. The claim is "faster from the EU," not "faster everywhere."

### 6.2 MCP server comparison is not apples-to-apples

Codebahn uses a hosted MCP endpoint. GitHub uses a local binary connecting to a remote API. The architecture difference favors Codebahn. A fairer comparison would be both platforms through local MCP binaries, or both through hosted endpoints. The current comparison reflects what a user actually gets with each platform's recommended MCP integration.

### 6.3 Single runs for agent tasks

Each agent task was run once per platform. Model behavior varies between runs. A single run can produce outliers (e.g., the 8-second file reads in fix-email). Statistical significance requires multiple runs per task. The API benchmark (50 iterations) has this; the agent benchmark does not.

### 6.4 GitHub MCP server may have issues

The latency escalation and extra discovery calls may be bugs in `github-mcp-server` v1.10.1, not fundamental to GitHub's platform. A future version might fix these. The API benchmark (which bypasses MCP) doesn't show any escalation.

### 6.5 Small repository

The test repository has 8 files. A larger repository might show different characteristics (bigger tree responses, more data per call). The API latency for a given endpoint type is unlikely to change much, but response payload size could affect total transfer time differently.

## 7. How to use these numbers

### 7.1 Defensible claims

> **"Codebahn API responds in 116ms from the EU. GitHub: 324ms."**
> Source: curl benchmark, 350 calls, p50. This survives any scrutiny.

> **"2.8x faster API for EU developers."**
> Source: curl benchmark, overall p50. Specific to EU location.

> **"Codebahn's p95 (215ms) is lower than GitHub's p50 (324ms)."**
> Source: curl benchmark. Codebahn's worst case beats GitHub's median.

### 7.2 Directional claims (use with context)

> **"Agent workflows complete 12-15x faster on Codebahn."**
> Source: fix-email (15.1x) and fix-currency (12.2x) agent benchmarks. These are the cleanest agent runs. Qualify with "measured via MCP from Sweden" and note the different MCP architectures.

> **"Your coding agent spends less time waiting."**
> True but unquantified. Use the API number (2.8x) as the foundation, note that the effect compounds across a session.

### 7.3 Claims that don't hold up

- **"22x faster"** includes the explore task (52.4x) where GitHub's MCP server degraded within the session. The overall number is skewed.
- **"52x faster"** is the explore task alone, dominated by GitHub's latency escalation bug.
- **Any claim without "from the EU" or similar qualifier.** The advantage is geography-dependent. A US developer would see a smaller gap.

### 7.4 Recommended framing for the homepage

Lead with the absolute number, not the ratio. "116ms" is specific and concrete. "2.8x" is a comparison that invites questions about methodology.

Suggested copy:

> **116ms median API response from the EU.** Every API call your agent makes, every file read, every PR creation. Measured against GitHub's 324ms from the same machine. [See the benchmark.](#)

For a detailed performance page or blog post, present both benchmarks: the API numbers as the foundation ("here is the raw speed"), and the agent workflows as the implication ("here is what it means when your agent does real work").
