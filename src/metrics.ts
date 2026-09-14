// Shared measurement helpers for the payload benchmark.

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Rough bytes-to-tokens conversion, for reporting only. Exact counts come from
 * the API usage field on an agent run; a raw HTTP response carries none.
 */
export const estimateTokens = (bytes: number): number => Math.round(bytes / 4);

export const ratio = (before: number, after: number): string =>
  after > 0 ? `${(before / after).toFixed(1)}x` : "-";

/** Reads `--flag <n>` from argv, falling back on anything that is not a count. */
export function readIntFlag(args: string[], flag: string, fallback: number): number {
  const at = args.indexOf(flag);
  if (at === -1) return fallback;
  const value = Number(args[at + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Column headings for a comparison, defaulting to the original platform pair. */
export function parseLabels(args: string[]): [string, string] {
  const at = args.indexOf("--labels");
  if (at === -1) return ["Codebahn", "GitHub"];
  const parts = (args[at + 1] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : ["Codebahn", "GitHub"];
}

interface JsonRpcResponse {
  error?: { code?: number; message?: string };
  result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
}

/** Pull the text a tool returned out of an MCP reply, JSON or SSE-framed. */
export function extractToolText(body: string): string {
  const message = parseJsonRpc(body);

  if (message.error) {
    throw new Error(
      `MCP error ${message.error.code ?? ""}: ${message.error.message ?? "unknown"}`.trim(),
    );
  }

  const text = (message.result?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  if (message.result?.isError) {
    throw new Error(`MCP tool error: ${text}`);
  }
  return text;
}

function parseJsonRpc(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }
  // Streamable HTTP may frame the reply as server-sent events.
  for (const line of trimmed.split("\n")) {
    if (line.startsWith("data:")) {
      return JSON.parse(line.slice(5).trim()) as JsonRpcResponse;
    }
  }
  throw new Error(`unrecognised MCP response body: ${trimmed.slice(0, 120)}`);
}
