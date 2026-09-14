// Payload benchmark: how many bytes a review operation costs an agent, before
// and after the MCP response work, measured against one live instance.
//
// The "before" side is still reachable: the raw REST API returns the full
// objects the MCP layer now slims, and the compare endpoint still takes the
// query parameters the tools used to leave at their defaults. So both sides of
// the comparison come from the same binary, with no second deployment.
//
// Usage:
//   CODEBAHN_TOKEN=... pnpm payload [--iterations 5] [--dry-run]

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { estimateTokens, extractToolText, median, ratio, readIntFlag } from "./metrics.js";

const HOST = process.env.CB_HOST ?? "https://codebahn.net";
const OWNER = process.env.CB_OWNER ?? "codebahn";
const REPO = process.env.CB_REPO ?? "codebahn-forgejo";
const PR = Number(process.env.CB_PR ?? 240);
// Pinned so runs stay comparable: 64 commits, 427 files.
const BASE = process.env.CB_BASE ?? "b1094d7542";
const HEAD = process.env.CB_HEAD ?? "62ecc584c4";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const iterations = readIntFlag(args, "--iterations", Number(process.env.CB_ITERATIONS) || 5);

const token = process.env.CODEBAHN_TOKEN ?? "";
if (!token && !dryRun) {
  console.error(
    "Set CODEBAHN_TOKEN to a Codebahn API token (env, not argv, so it stays out of ps).",
  );
  process.exit(1);
}

type Request =
  | { kind: "rest"; path: string }
  | { kind: "mcp"; tool: string; toolArgs: Record<string, unknown> };

const rest = (path: string): Request => ({ kind: "rest", path });
const mcp = (tool: string, toolArgs: Record<string, unknown>): Request => ({
  kind: "mcp",
  tool,
  toolArgs,
});

interface Probe {
  label: string;
  note: string;
  before: Request;
  after: Request;
}

const repoPath = `/repos/${OWNER}/${REPO}`;
const compareRange = `${repoPath}/compare/${BASE}...${HEAD}`;

const probes: Probe[] = [
  {
    label: "compare: per-commit files",
    note: "commit_files=true vs false, the git call per commit",
    before: rest(`${compareRange}?stat=false&verification=false&commit_files=true`),
    after: rest(`${compareRange}?stat=false&verification=false&commit_files=false`),
  },
  {
    label: "compare: top-level file list",
    note: "files=true vs false, the extra base...head diff",
    before: rest(`${compareRange}?stat=false&verification=false&commit_files=false&files=true`),
    after: rest(`${compareRange}?stat=false&verification=false&commit_files=false&files=false`),
  },
  {
    label: "list commits: server work",
    note: "defaults vs stat/verification/files off",
    before: rest(`${repoPath}/commits?limit=50`),
    after: rest(`${repoPath}/commits?limit=50&stat=false&verification=false&files=false`),
  },
  {
    label: "list commits: end to end",
    note: "raw REST vs the slim tool an agent actually sees",
    before: rest(`${repoPath}/commits?limit=50`),
    after: mcp("list_repo_commits", { owner: OWNER, repo: REPO, page: 1, limit: 50 }),
  },
  {
    label: "PR files: end to end",
    note: "raw REST vs the tool, which drops the three URL fields",
    before: rest(`${repoPath}/pulls/${PR}/files?limit=50`),
    after: mcp("list_pull_request_files", { owner: OWNER, repo: REPO, index: PR, limit: 50 }),
  },
  {
    label: "PR commits: end to end",
    note: "raw REST vs the tool",
    before: rest(`${repoPath}/pulls/${PR}/commits?limit=50`),
    after: mcp("list_pr_commits", { owner: OWNER, repo: REPO, index: PR, limit: 50 }),
  },
  {
    label: "compare: end to end",
    note: "raw REST vs compare_refs",
    before: rest(compareRange),
    after: mcp("compare_refs", { owner: OWNER, repo: REPO, base: BASE, head: HEAD }),
  },
];

function describe(request: Request): string {
  return request.kind === "rest"
    ? `GET /api/v1${request.path}`
    : `MCP ${request.tool} ${JSON.stringify(request.toolArgs)}`;
}

if (dryRun) {
  console.log(`Payload Benchmark (dry run): ${OWNER}/${REPO}, ${iterations} iterations\n`);
  for (const probe of probes) {
    console.log(`  ${probe.label}  (${probe.note})`);
    console.log(`    before  ${describe(probe.before)}`);
    console.log(`    after   ${describe(probe.after)}`);
    console.log("");
  }
  process.exit(0);
}

// --- MCP streamable HTTP ------------------------------------------------

const mcpHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${token}`,
};

let mcpSession = "";

async function openMcpSession(): Promise<void> {
  const res = await fetch(`${HOST}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "codebahn-bench", version: "0.1.0" },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`MCP initialize failed: ${res.status} ${await res.text()}`);
  }
  mcpSession = res.headers.get("mcp-session-id") ?? "";
  await res.text();

  if (mcpSession) mcpHeaders["Mcp-Session-Id"] = mcpSession;
  await fetch(`${HOST}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

let nextId = 1;

/** Returns the text the tool produced, which is what lands in the agent's context. */
async function callMcp(tool: string, toolArgs: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${HOST}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name: tool, arguments: toolArgs },
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`MCP ${tool} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return extractToolText(body);
}

async function callRest(path: string): Promise<string> {
  const res = await fetch(`${HOST}/api/v1${path}`, {
    headers: { Authorization: `token ${token}`, Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return body;
}

// --- measurement --------------------------------------------------------

interface Sample {
  bytes: number;
  ms: number;
}

async function measure(request: Request): Promise<Sample> {
  const started = performance.now();
  const body =
    request.kind === "rest"
      ? await callRest(request.path)
      : await callMcp(request.tool, request.toolArgs);
  return { bytes: Buffer.byteLength(body, "utf8"), ms: performance.now() - started };
}

async function run(request: Request): Promise<Sample> {
  const samples: Sample[] = [];
  for (let i = 0; i < iterations; i++) {
    samples.push(await measure(request));
  }
  return {
    bytes: median(samples.map((s) => s.bytes)),
    ms: Math.round(median(samples.map((s) => s.ms))),
  };
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

async function main(): Promise<void> {
  await openMcpSession();

  console.log(`Payload Benchmark: ${OWNER}/${REPO}`);
  console.log(`  PR #${PR}, compare ${BASE}...${HEAD}, median of ${iterations}`);
  console.log("─".repeat(76));
  console.log(
    `  ${"Probe".padEnd(28)} ${"Before".padStart(10)} ${"After".padStart(10)} ${"Smaller".padStart(8)} ${"Before".padStart(7)} ${"After".padStart(7)}`,
  );
  console.log(
    `  ${"─".repeat(28)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(8)} ${"─".repeat(7)} ${"─".repeat(7)}`,
  );

  const results = [];
  for (const probe of probes) {
    const before = await run(probe.before);
    const after = await run(probe.after);
    results.push({
      label: probe.label,
      note: probe.note,
      before: { ...before, tokens: estimateTokens(before.bytes) },
      after: { ...after, tokens: estimateTokens(after.bytes) },
      bytesRatio: after.bytes > 0 ? before.bytes / after.bytes : null,
    });
    console.log(
      `  ${probe.label.padEnd(28)} ${kb(before.bytes).padStart(10)} ${kb(after.bytes).padStart(10)} ${ratio(before.bytes, after.bytes).padStart(8)} ${`${before.ms}ms`.padStart(7)} ${`${after.ms}ms`.padStart(7)}`,
    );
  }

  const totalBefore = results.reduce((sum, r) => sum + r.before.bytes, 0);
  const totalAfter = results.reduce((sum, r) => sum + r.after.bytes, 0);
  console.log("─".repeat(76));
  console.log(
    `  One pass over every probe: ${kb(totalBefore)} -> ${kb(totalAfter)} (${ratio(totalBefore, totalAfter)} smaller, ` +
      `~${estimateTokens(totalBefore - totalAfter).toLocaleString()} tokens saved)`,
  );
  console.log("  Token figures are bytes/4 estimates; exact counts come from an agent run.");

  const outDir = resolve(import.meta.dirname, "..", "payload-results");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        host: HOST,
        owner: OWNER,
        repo: REPO,
        pr: PR,
        base: BASE,
        head: HEAD,
        iterations,
        results,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n  Results: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
