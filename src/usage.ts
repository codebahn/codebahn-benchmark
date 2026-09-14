// Token accounting for a Claude Code stream-json transcript.
//
// Latency tells you how long a workflow waited; tokens tell you what it cost to
// carry the results, which is the number that moves when tool responses get
// slimmer. Both come out of the same transcript.

export interface UsageTotals {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  /** Largest single-turn context, the number a fat tool result inflates. */
  peakContextTokens: number;
  totalCostUsd: number | null;
}

interface UsageEvent {
  type?: string;
  total_cost_usd?: number;
  // Real transcript events carry content and more alongside usage.
  message?: { usage?: Record<string, unknown>; [key: string]: unknown };
}

const num = (value: unknown): number => (typeof value === "number" ? value : 0);

export function sumUsage(events: UsageEvent[]): UsageTotals {
  const totals: UsageTotals = {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    peakContextTokens: 0,
    totalCostUsd: null,
  };

  for (const event of events) {
    if (event.type === "result" && typeof event.total_cost_usd === "number") {
      totals.totalCostUsd = event.total_cost_usd;
    }

    const usage = event.type === "assistant" ? event.message?.usage : undefined;
    if (!usage) continue;

    const input = num(usage.input_tokens);
    const cacheRead = num(usage.cache_read_input_tokens);
    const cacheCreation = num(usage.cache_creation_input_tokens);

    totals.inputTokens += input;
    totals.cacheReadTokens += cacheRead;
    totals.cacheCreationTokens += cacheCreation;
    totals.outputTokens += num(usage.output_tokens);
    totals.peakContextTokens = Math.max(
      totals.peakContextTokens,
      input + cacheRead + cacheCreation,
    );
  }

  return totals;
}
