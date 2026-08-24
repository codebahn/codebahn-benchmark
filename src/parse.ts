import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx src/parse.ts <stream.jsonl>");
  process.exit(1);
}

interface ToolCall {
  id: string;
  name: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
}

interface Event {
  type: string;
  timestamp?: string;
  message?: {
    content?: Array<{
      type: string;
      id?: string;
      name?: string;
      tool_use_id?: string;
      input?: unknown;
    }>;
  };
}

const raw = readFileSync(resolve(file), "utf-8");
const events: Event[] = raw
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const pending = new Map<string, ToolCall>();
const calls: ToolCall[] = [];
let sessionStart = 0;
let sessionEnd = 0;

for (const ev of events) {
  const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : 0;
  if (ts && !sessionStart) sessionStart = ts;
  if (ts) sessionEnd = ts;

  if (ev.type === "assistant" && ev.message?.content) {
    for (const block of ev.message.content) {
      if (block.type === "tool_use" && block.id && block.name) {
        const call: ToolCall = {
          id: block.id,
          name: block.name,
          startMs: ts,
          endMs: null,
          durationMs: null,
        };
        pending.set(block.id, call);
        calls.push(call);
      }
    }
  }

  if (ev.type === "user" && ev.message?.content) {
    for (const block of ev.message.content) {
      if (block.type === "tool_result" && block.tool_use_id) {
        const call = pending.get(block.tool_use_id);
        if (call) {
          call.endMs = ts;
          call.durationMs = ts - call.startMs;
          pending.delete(block.tool_use_id);
        }
      }
    }
  }
}

const mcpCalls = calls.filter((c) => c.name.startsWith("mcp__"));
const otherCalls = calls.filter((c) => !c.name.startsWith("mcp__"));

const totalMcpMs = mcpCalls.reduce((s, c) => s + (c.durationMs ?? 0), 0);
const totalOtherMs = otherCalls.reduce((s, c) => s + (c.durationMs ?? 0), 0);
const totalSessionMs = sessionEnd - sessionStart;
const thinkingMs = totalSessionMs - totalMcpMs - totalOtherMs;

console.log("Agent Benchmark: Transcript Analysis");
console.log("─".repeat(60));
console.log(`  Session duration:    ${(totalSessionMs / 1000).toFixed(1)}s`);
console.log(`  MCP calls:           ${mcpCalls.length} (${(totalMcpMs / 1000).toFixed(1)}s waiting)`);
console.log(`  Other tool calls:    ${otherCalls.length} (${(totalOtherMs / 1000).toFixed(1)}s)`);
console.log(
  `  Model thinking:      ${(thinkingMs / 1000).toFixed(1)}s`,
);
console.log("");

if (mcpCalls.length > 0) {
  console.log(
    `  ${"MCP Tool Call".padEnd(42)} ${"Duration".padStart(8)}`,
  );
  console.log(`  ${"─".repeat(42)} ${"─".repeat(8)}`);

  for (const c of mcpCalls) {
    const shortName = c.name.substring(c.name.lastIndexOf("__") + 2);
    const dur =
      c.durationMs !== null ? `${c.durationMs}ms` : "pending";
    console.log(`  ${shortName.padEnd(42)} ${dur.padStart(8)}`);
  }

  console.log(`  ${"─".repeat(42)} ${"─".repeat(8)}`);
  console.log(
    `  ${"Total platform wait".padEnd(42)} ${`${totalMcpMs}ms`.padStart(8)}`,
  );
}

// Group by tool for summary
const byTool = new Map<string, number[]>();
for (const c of mcpCalls) {
  const short = c.name.substring(c.name.lastIndexOf("__") + 2);
  if (!byTool.has(short)) byTool.set(short, []);
  if (c.durationMs !== null) byTool.get(short)!.push(c.durationMs);
}

if (byTool.size > 0) {
  console.log("");
  console.log(
    `  ${"Tool".padEnd(30)} ${"Calls".padStart(5)} ${"Avg".padStart(7)} ${"Total".padStart(8)}`,
  );
  console.log(
    `  ${"─".repeat(30)} ${"─".repeat(5)} ${"─".repeat(7)} ${"─".repeat(8)}`,
  );
  for (const [name, durations] of byTool) {
    const avg = Math.round(
      durations.reduce((a, b) => a + b, 0) / durations.length,
    );
    const total = durations.reduce((a, b) => a + b, 0);
    console.log(
      `  ${name.padEnd(30)} ${String(durations.length).padStart(5)} ${`${avg}ms`.padStart(7)} ${`${total}ms`.padStart(8)}`,
    );
  }
}

// Write machine-readable output
const outPath = file.replace(/\.jsonl$/, "-parsed.json");
const output = {
  sessionMs: totalSessionMs,
  mcpCalls: mcpCalls.length,
  mcpWaitMs: totalMcpMs,
  thinkingMs,
  calls: mcpCalls.map((c) => ({
    tool: c.name.substring(c.name.lastIndexOf("__") + 2),
    fullName: c.name,
    ms: c.durationMs,
  })),
  byTool: Object.fromEntries(
    [...byTool].map(([name, durations]) => [
      name,
      {
        count: durations.length,
        avgMs: Math.round(
          durations.reduce((a, b) => a + b, 0) / durations.length,
        ),
        totalMs: durations.reduce((a, b) => a + b, 0),
      },
    ]),
  ),
};
writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log(`\n  Parsed: ${outPath}`);
