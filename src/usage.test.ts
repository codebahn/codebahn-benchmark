import { describe, expect, it } from "vitest";
import { sumUsage } from "./usage.js";

const assistant = (usage: Record<string, number>) => ({
  type: "assistant",
  message: { usage },
});

describe("sumUsage", () => {
  it("adds up every token bucket across assistant turns", () => {
    const totals = sumUsage([
      assistant({
        input_tokens: 10,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 5,
        output_tokens: 20,
      }),
      assistant({
        input_tokens: 3,
        cache_read_input_tokens: 400,
        cache_creation_input_tokens: 0,
        output_tokens: 7,
      }),
    ]);

    expect(totals.inputTokens).toBe(13);
    expect(totals.cacheReadTokens).toBe(500);
    expect(totals.cacheCreationTokens).toBe(5);
    expect(totals.outputTokens).toBe(27);
  });

  it("reports peak context, the number a fat tool result inflates", () => {
    const totals = sumUsage([
      assistant({ input_tokens: 10, cache_read_input_tokens: 90 }),
      assistant({ input_tokens: 10, cache_read_input_tokens: 8_000 }),
      assistant({ input_tokens: 10, cache_read_input_tokens: 500 }),
    ]);

    // Peak, not final: context can shrink again after a compaction.
    expect(totals.peakContextTokens).toBe(8_010);
  });

  it("treats absent buckets as zero rather than NaN", () => {
    const totals = sumUsage([assistant({ output_tokens: 4 })]);

    expect(totals.inputTokens).toBe(0);
    expect(totals.cacheReadTokens).toBe(0);
    expect(totals.cacheCreationTokens).toBe(0);
    expect(totals.outputTokens).toBe(4);
    expect(totals.peakContextTokens).toBe(0);
  });

  it("ignores events that carry no usage", () => {
    const totals = sumUsage([
      { type: "system" },
      { type: "user", message: { content: [] } },
      assistant({ output_tokens: 2 }),
    ]);

    expect(totals.outputTokens).toBe(2);
  });

  it("picks up the run cost from the result event", () => {
    const totals = sumUsage([
      assistant({ output_tokens: 1 }),
      { type: "result", total_cost_usd: 0.1234 },
    ]);

    expect(totals.totalCostUsd).toBeCloseTo(0.1234);
  });

  it("leaves cost null when the run never reported one", () => {
    expect(sumUsage([assistant({ output_tokens: 1 })]).totalCostUsd).toBeNull();
  });
});
