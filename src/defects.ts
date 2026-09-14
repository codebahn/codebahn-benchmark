// The planted defects in the benchmark's review fixture.
//
// Two are visible in the squashed diff, which any arm can reach. Two exist only
// in the commit history, which is what list_pr_commits and get_commit_diff
// claim to surface: a reviewer working from the squashed diff alone cannot see
// them at all. That split is the experiment.
//
// This list is the single source of truth: agent/fixture.ts plants them and
// src/score.ts scores against them.

export type Visibility = "squashed" | "history";

export interface Defect {
  id: string;
  label: string;
  file: string;
  visibility: Visibility;
  /** Every signal must appear in the review for the defect to count as found. */
  signals: RegExp[];
  /** A minimal review that should score as found, which keeps the signals honest. */
  reviewExample: string;
}

export const DEFECTS: Defect[] = [
  {
    id: "unbounded-redact",
    label: "redact() slices with a negative index when keep exceeds the input length",
    file: "src/client.ts",
    visibility: "squashed",
    signals: [/redact/i, /negative|out of bounds|bounds|slice|guard|keep\b/i],
    reviewExample: "redact() slices with a negative index when keep is larger than the string",
  },
  {
    id: "swallowed-error",
    label: "empty catch turns a failed request into a successful-looking result",
    file: "src/client.ts",
    visibility: "squashed",
    signals: [/catch|error/i, /swallow|ignor|silent|empty catch|discard|hidden/i],
    reviewExample: "the empty catch swallows the network error and returns a fake success",
  },
  {
    id: "secret-in-history",
    label: "hardcoded API key added in an early commit and removed later, still in history",
    file: "src/client.ts",
    visibility: "history",
    signals: [
      /api[ _-]?key|secret|credential|hardcoded token/i,
      /histor|earlier commit|previous commit|first commit|rotate|revoke|still in the/i,
    ],
    reviewExample: "a hardcoded api key was added in an earlier commit and must be rotated",
  },
  {
    id: "broken-bisect",
    label: "an intermediate commit does not compile, so the branch is not bisectable",
    file: "src/client.ts",
    visibility: "history",
    signals: [/commit/i, /compile|build|bisect|type error|does not build|broken intermediate/i],
    reviewExample: "one commit does not compile on its own, which breaks bisect",
  },
];
