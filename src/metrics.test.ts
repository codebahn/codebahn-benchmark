import { describe, expect, it } from "vitest";
import { estimateTokens, extractToolText, median, ratio, readIntFlag } from "./metrics.js";

describe("median", () => {
  it("takes the middle of an odd sample", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("averages the middle pair of an even sample", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("is zero for no samples", () => {
    expect(median([])).toBe(0);
  });
});

describe("estimateTokens", () => {
  it("uses the four-bytes-per-token rule of thumb", () => {
    expect(estimateTokens(4000)).toBe(1000);
    expect(estimateTokens(10)).toBe(3);
  });
});

describe("ratio", () => {
  it("says how many times bigger the before side is", () => {
    expect(ratio(5000, 1000)).toBe("5.0x");
  });

  it("has no answer when the after side is zero", () => {
    expect(ratio(5000, 0)).toBe("-");
  });
});

describe("extractToolText", () => {
  const ok = {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: '{"total_commits":2}' }] },
  };

  it("reads a plain JSON-RPC body", () => {
    expect(extractToolText(JSON.stringify(ok))).toBe('{"total_commits":2}');
  });

  it("reads a body framed as server-sent events", () => {
    const body = `event: message\ndata: ${JSON.stringify(ok)}\n\n`;
    expect(extractToolText(body)).toBe('{"total_commits":2}');
  });

  it("joins multiple text blocks", () => {
    const multi = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      },
    };
    expect(extractToolText(JSON.stringify(multi))).toBe("ab");
  });

  it("surfaces a JSON-RPC error instead of returning empty text", () => {
    const err = { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "unknown tool" } };
    expect(() => extractToolText(JSON.stringify(err))).toThrow(/unknown tool/);
  });

  it("surfaces a tool-level error too", () => {
    const err = {
      jsonrpc: "2.0",
      id: 1,
      result: { isError: true, content: [{ type: "text", text: "owner is required" }] },
    };
    expect(() => extractToolText(JSON.stringify(err))).toThrow(/owner is required/);
  });

  it("refuses a body it cannot parse rather than reporting zero bytes", () => {
    expect(() => extractToolText("<html>502</html>")).toThrow();
  });
});

describe("readIntFlag", () => {
  it("reads the value after the flag", () => {
    expect(readIntFlag(["--iterations", "9"], "--iterations", 5)).toBe(9);
  });

  it("falls back when the flag is absent", () => {
    expect(readIntFlag(["--dry-run"], "--iterations", 5)).toBe(5);
  });

  it("falls back when the flag ends the argument list", () => {
    expect(readIntFlag(["--iterations"], "--iterations", 5)).toBe(5);
  });

  it("falls back when the next argument is another flag", () => {
    // The bug this guards: Number("--dry-run") is NaN, which reads as a count.
    expect(readIntFlag(["--iterations", "--dry-run"], "--iterations", 5)).toBe(5);
  });

  it("falls back on a count that would measure nothing", () => {
    expect(readIntFlag(["--iterations", "0"], "--iterations", 5)).toBe(5);
  });
});
