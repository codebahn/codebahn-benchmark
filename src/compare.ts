import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , cbFile, ghFile] = process.argv;
if (!cbFile || !ghFile) {
  console.error("Usage: tsx src/compare.ts <codebahn-parsed.json> <github-parsed.json>");
  process.exit(1);
}

interface Parsed {
  sessionMs: number;
  mcpCalls: number;
  mcpWaitMs: number;
  thinkingMs: number;
  calls: Array<{ tool: string; fullName: string; ms: number | null }>;
  byTool: Record<string, { count: number; avgMs: number; totalMs: number }>;
}

const cb: Parsed = JSON.parse(readFileSync(resolve(cbFile), "utf-8"));
const gh: Parsed = JSON.parse(readFileSync(resolve(ghFile), "utf-8"));

console.log("Codebahn vs GitHub: Agent Experience Comparison");
console.log("═".repeat(60));

console.log("\n  Overview");
console.log("  " + "─".repeat(58));
console.log(
  `  ${"".padEnd(30)} ${"Codebahn".padStart(10)} ${"GitHub".padStart(10)} ${"Ratio".padStart(8)}`,
);
console.log(
  `  ${"".padEnd(30)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(8)}`,
);

function statRow(label: string, cbVal: number, ghVal: number, unit: string) {
  const ratio = cbVal > 0 ? (ghVal / cbVal).toFixed(1) + "x" : "-";
  console.log(
    `  ${label.padEnd(30)} ${(cbVal + unit).padStart(10)} ${(ghVal + unit).padStart(10)} ${ratio.padStart(8)}`,
  );
}

statRow("MCP calls", cb.mcpCalls, gh.mcpCalls, "");
statRow("Platform wait", cb.mcpWaitMs, gh.mcpWaitMs, "ms");
statRow("Avg call latency", Math.round(cb.mcpWaitMs / (cb.mcpCalls || 1)), Math.round(gh.mcpWaitMs / (gh.mcpCalls || 1)), "ms");
statRow("Session total", cb.sessionMs, gh.sessionMs, "ms");

// Per-tool comparison (match by tool name)
const allTools = new Set([...Object.keys(cb.byTool), ...Object.keys(gh.byTool)]);

if (allTools.size > 0) {
  console.log("\n  Per-tool average latency");
  console.log("  " + "─".repeat(58));
  console.log(
    `  ${"Tool".padEnd(30)} ${"CB avg".padStart(10)} ${"GH avg".padStart(10)} ${"Ratio".padStart(8)}`,
  );
  console.log(
    `  ${"".padEnd(30)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(8)}`,
  );

  for (const tool of [...allTools].sort()) {
    const cbT = cb.byTool[tool];
    const ghT = gh.byTool[tool];
    const cbAvg = cbT?.avgMs ?? 0;
    const ghAvg = ghT?.avgMs ?? 0;
    const ratio = cbAvg > 0 && ghAvg > 0 ? (ghAvg / cbAvg).toFixed(1) + "x" : "-";
    console.log(
      `  ${tool.padEnd(30)} ${cbAvg ? (cbAvg + "ms").padStart(10) : "-".padStart(10)} ${ghAvg ? (ghAvg + "ms").padStart(10) : "-".padStart(10)} ${ratio.padStart(8)}`,
    );
  }
}

// Headline
const ratio = cb.mcpWaitMs > 0 ? (gh.mcpWaitMs / cb.mcpWaitMs).toFixed(1) : "?";
const savedSec = ((gh.mcpWaitMs - cb.mcpWaitMs) / 1000).toFixed(1);

console.log("\n" + "═".repeat(60));
console.log(
  `  Codebahn: ${ratio}x faster. ${savedSec}s less platform wait per workflow.`,
);
console.log("═".repeat(60));

// Write comparison JSON (feeds the visualization)
const outPath = resolve(
  cbFile,
  "..",
  "comparison.json",
);
const output = {
  timestamp: new Date().toISOString(),
  ratio: parseFloat(ratio),
  savedMs: gh.mcpWaitMs - cb.mcpWaitMs,
  codebahn: {
    calls: cb.mcpCalls,
    waitMs: cb.mcpWaitMs,
    sessionMs: cb.sessionMs,
  },
  github: {
    calls: gh.mcpCalls,
    waitMs: gh.mcpWaitMs,
    sessionMs: gh.sessionMs,
  },
  results: [...allTools].sort().map((tool) => ({
    label: tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c),
    cb: cb.byTool[tool]?.avgMs ?? 0,
    gh: gh.byTool[tool]?.avgMs ?? 0,
  })),
};
writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log(`\n  Comparison: ${outPath}`);
