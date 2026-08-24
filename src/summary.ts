import { readdirSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const resultsDir = resolve(
  import.meta.dirname ?? ".",
  "..",
  "agent",
  "results",
);

interface Parsed {
  sessionMs: number;
  mcpCalls: number;
  mcpWaitMs: number;
  thinkingMs: number;
  calls: Array<{ tool: string; ms: number | null }>;
}

interface Run {
  task: string;
  platform: string;
  timestamp: string;
  data: Parsed;
}

const runs: Run[] = [];

for (const dir of readdirSync(resultsDir)) {
  const parsed = resolve(resultsDir, dir, "stream-parsed.json");
  try {
    const data: Parsed = JSON.parse(readFileSync(parsed, "utf-8"));
    const parts = dir.match(/^(.+)-(codebahn|github)-(\d{8}-\d{6})$/);
    if (!parts) continue;
    runs.push({ task: parts[1], platform: parts[2], timestamp: parts[3], data });
  } catch {
    continue;
  }
}

if (runs.length === 0) {
  console.log("No parsed results found in agent/results/");
  console.log("Run benchmarks first, then parse each with: pnpm parse <stream.jsonl>");
  process.exit(0);
}

const tasks = [...new Set(runs.map((r) => r.task))].sort();

console.log("Codebahn Bench: Summary");
console.log("═".repeat(64));

let totalCb = 0;
let totalGh = 0;
let taskCount = 0;

for (const task of tasks) {
  const cb = runs.filter((r) => r.task === task && r.platform === "codebahn");
  const gh = runs.filter((r) => r.task === task && r.platform === "github");

  if (cb.length === 0 || gh.length === 0) {
    console.log(`\n  ${task}: only ${cb.length > 0 ? "codebahn" : "github"} run found, skipping`);
    continue;
  }

  const cbAvgWait = Math.round(cb.reduce((s, r) => s + r.data.mcpWaitMs, 0) / cb.length);
  const ghAvgWait = Math.round(gh.reduce((s, r) => s + r.data.mcpWaitMs, 0) / gh.length);
  const cbAvgCalls = Math.round(cb.reduce((s, r) => s + r.data.mcpCalls, 0) / cb.length);
  const ghAvgCalls = Math.round(gh.reduce((s, r) => s + r.data.mcpCalls, 0) / gh.length);
  const ratio = cbAvgWait > 0 ? (ghAvgWait / cbAvgWait).toFixed(1) : "-";

  totalCb += cbAvgWait;
  totalGh += ghAvgWait;
  taskCount++;

  console.log(
    `\n  ${task} (${cb.length} CB run${cb.length > 1 ? "s" : ""}, ${gh.length} GH run${gh.length > 1 ? "s" : ""})`,
  );
  console.log(`  ${"─".repeat(60)}`);
  console.log(
    `  ${"".padEnd(20)} ${"Codebahn".padStart(10)} ${"GitHub".padStart(10)} ${"Ratio".padStart(8)}`,
  );
  console.log(
    `  ${"MCP calls".padEnd(20)} ${String(cbAvgCalls).padStart(10)} ${String(ghAvgCalls).padStart(10)} ${(ghAvgCalls > cbAvgCalls ? (ghAvgCalls / cbAvgCalls).toFixed(1) + "x" : cbAvgCalls > ghAvgCalls ? "0." + Math.round((ghAvgCalls / cbAvgCalls) * 10) + "x" : "1.0x").padStart(8)}`,
  );
  console.log(
    `  ${"Platform wait".padEnd(20)} ${(cbAvgWait + "ms").padStart(10)} ${(ghAvgWait + "ms").padStart(10)} ${(ratio + "x").padStart(8)}`,
  );
  console.log(
    `  ${"Avg per call".padEnd(20)} ${(Math.round(cbAvgWait / (cbAvgCalls || 1)) + "ms").padStart(10)} ${(Math.round(ghAvgWait / (ghAvgCalls || 1)) + "ms").padStart(10)}`,
  );

  console.log("");
  console.log(`  ${"  Codebahn calls".padEnd(38)} ${"  GitHub calls".padEnd(38)}`);
  console.log(`  ${"  " + "─".repeat(36)} ${"  " + "─".repeat(36)}`);
  const cbCalls = cb[0].data.calls;
  const ghCalls = gh[0].data.calls;
  const maxLen = Math.max(cbCalls.length, ghCalls.length);
  for (let i = 0; i < maxLen; i++) {
    const cl = cbCalls[i];
    const gl = ghCalls[i];
    const cStr = cl ? `  ${cl.tool.padEnd(26)} ${(cl.ms + "ms").padStart(7)}` : " ".repeat(38);
    const gStr = gl ? `  ${gl.tool.padEnd(26)} ${(gl.ms + "ms").padStart(7)}` : "";
    console.log(`  ${cStr} ${gStr}`);
  }
}

if (taskCount > 1) {
  const overallRatio = totalCb > 0 ? (totalGh / totalCb).toFixed(1) : "-";
  console.log(`\n${"═".repeat(64)}`);
  console.log(
    `  Overall (${taskCount} tasks): Codebahn ${overallRatio}x faster`,
  );
  console.log(
    `  Total platform wait: ${(totalCb / 1000).toFixed(1)}s (CB) vs ${(totalGh / 1000).toFixed(1)}s (GH), ${((totalGh - totalCb) / 1000).toFixed(1)}s saved`,
  );
  console.log("═".repeat(64));
}

// Output JSON for the visualization
const output = {
  tasks: tasks
    .filter((t) => {
      const cb = runs.filter((r) => r.task === t && r.platform === "codebahn");
      const gh = runs.filter((r) => r.task === t && r.platform === "github");
      return cb.length > 0 && gh.length > 0;
    })
    .map((t) => {
      const cb = runs.filter((r) => r.task === t && r.platform === "codebahn");
      const gh = runs.filter((r) => r.task === t && r.platform === "github");
      return {
        task: t,
        codebahn: {
          calls: Math.round(cb.reduce((s, r) => s + r.data.mcpCalls, 0) / cb.length),
          waitMs: Math.round(cb.reduce((s, r) => s + r.data.mcpWaitMs, 0) / cb.length),
          callLog: cb[0].data.calls,
        },
        github: {
          calls: Math.round(gh.reduce((s, r) => s + r.data.mcpCalls, 0) / gh.length),
          waitMs: Math.round(gh.reduce((s, r) => s + r.data.mcpWaitMs, 0) / gh.length),
          callLog: gh[0].data.calls,
        },
      };
    }),
  overall: {
    cbMs: totalCb,
    ghMs: totalGh,
    ratio: totalCb > 0 ? parseFloat((totalGh / totalCb).toFixed(1)) : 0,
    savedMs: totalGh - totalCb,
    taskCount,
  },
};

const outPath = resolve(resultsDir, "summary.json");
const { writeFileSync } = await import("node:fs");
writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log(`\n  Summary: ${outPath}`);
