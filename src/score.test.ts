import { describe, expect, it } from "vitest";
import { DEFECTS } from "./defects.js";
import { extractFindingsText, scoreReview } from "./score.js";

const review = (text: string) => [
  { type: "assistant", message: { content: [{ type: "text", text }] } },
];

describe("extractFindingsText", () => {
  it("prefers the fenced json block the task asks for", () => {
    const text = 'Here is my review.\n```json\n{"findings":[{"file":"a.ts","issue":"bad"}]}\n```\n';
    expect(extractFindingsText(review(text))).toContain('"issue":"bad"');
    expect(extractFindingsText(review(text))).not.toContain("Here is my review");
  });

  it("falls back to the whole message when the agent skipped the block", () => {
    expect(extractFindingsText(review("I found a null deref in client.ts"))).toContain(
      "null deref",
    );
  });

  it("uses the last assistant turn, not the first", () => {
    const events = [
      ...review("let me look around"),
      { type: "user", message: { content: [] } },
      ...review("final answer: hardcoded api key"),
    ];
    expect(extractFindingsText(events)).toContain("final answer");
    expect(extractFindingsText(events)).not.toContain("look around");
  });

  it("is empty when the agent never spoke", () => {
    expect(extractFindingsText([{ type: "system" }])).toBe("");
  });
});

describe("scoreReview", () => {
  it("credits a defect only when every signal is present", () => {
    // The secret defect needs both the secret and the history qualifier: a
    // review that just says "uses an API key" has not found it.
    const weak = scoreReview("the client uses an api key from config", DEFECTS);
    expect(weak.found.map((d) => d.id)).not.toContain("secret-in-history");

    const strong = scoreReview(
      "a hardcoded api key was added in an earlier commit and must be rotated",
      DEFECTS,
    );
    expect(strong.found.map((d) => d.id)).toContain("secret-in-history");
  });

  it("reports recall over the whole defect list", () => {
    const result = scoreReview("", DEFECTS);
    expect(result.found).toHaveLength(0);
    expect(result.missed).toHaveLength(DEFECTS.length);
    expect(result.recall).toBe(0);
  });

  it("splits recall by where the defect is visible", () => {
    const text = DEFECTS.filter((d) => d.visibility === "squashed")
      .map((d) => d.reviewExample)
      .join("\n");
    const result = scoreReview(text, DEFECTS);

    expect(result.byVisibility.squashed.recall).toBe(1);
    expect(result.byVisibility.history.recall).toBe(0);
  });

  it("credits every defect when the review names them all", () => {
    const text = DEFECTS.map((d) => d.reviewExample).join("\n");
    expect(scoreReview(text, DEFECTS).recall).toBe(1);
  });
});

describe("DEFECTS", () => {
  it("covers both arms of the experiment", () => {
    const squashed = DEFECTS.filter((d) => d.visibility === "squashed");
    const history = DEFECTS.filter((d) => d.visibility === "history");
    expect(squashed.length).toBeGreaterThan(0);
    expect(history.length).toBeGreaterThan(0);
  });

  it("gives every defect an example a scorer can be checked against", () => {
    for (const defect of DEFECTS) {
      expect(scoreReview(defect.reviewExample, [defect]).recall).toBe(1);
    }
  });
});
