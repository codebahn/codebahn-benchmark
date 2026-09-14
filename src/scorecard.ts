// Scores a review transcript against the planted defects.
//
// Usage: pnpm score agent/results/<run>/stream.jsonl

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFECTS } from "./defects.js";
import { extractFindingsText, scoreReview } from "./score.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx src/scorecard.ts <stream.jsonl>");
  process.exit(1);
}

const events = readFileSync(resolve(file), "utf-8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const text = extractFindingsText(events);
const score = scoreReview(text, DEFECTS);
const pct = (value: number) => `${Math.round(value * 100)}%`;

console.log("Review Scorecard");
console.log("─".repeat(72));
if (!text) {
  console.log("  The agent produced no closing message; scoring an empty review.");
}

for (const defect of DEFECTS) {
  const hit = score.found.includes(defect);
  console.log(`  ${hit ? "found " : "missed"}  ${defect.visibility.padEnd(8)} ${defect.label}`);
}

console.log("─".repeat(72));
console.log(
  `  Recall                ${pct(score.recall)} (${score.found.length}/${DEFECTS.length})`,
);
console.log(
  `  In the squashed diff  ${pct(score.byVisibility.squashed.recall)} (${score.byVisibility.squashed.found}/${score.byVisibility.squashed.total})`,
);
console.log(
  `  Only in the history   ${pct(score.byVisibility.history.recall)} (${score.byVisibility.history.found}/${score.byVisibility.history.total})`,
);
console.log("\n  History recall is the number the review tools are supposed to move.");

const outPath = file.replace(/\.jsonl$/, "-score.json");
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      recall: score.recall,
      found: score.found.map((d) => d.id),
      missed: score.missed.map((d) => d.id),
      byVisibility: score.byVisibility,
    },
    null,
    2,
  )}\n`,
);
console.log(`\n  Scored: ${outPath}`);
