// Creates the review fixture: a branch whose four commits carry the defects in
// src/defects.ts, and a pull request for an agent to review.
//
// Two defects survive into the squashed diff. Two exist only between commits:
// a credential added in the first commit and removed in the last, and an
// intermediate commit that does not compile. A reviewer working from the
// squashed diff alone cannot see either.
//
// Usage:
//   CODEBAHN_TOKEN=... tsx agent/fixture.ts [--dry-run]

import { DEFECTS } from "../src/defects.js";

const HOST = process.env.CB_HOST ?? "https://codebahn.net";
const OWNER = process.env.CB_OWNER ?? "hackerman";
const REPO = process.env.CB_REPO ?? "data-utils";
const BRANCH = process.env.CB_FIXTURE_BRANCH ?? "bench/review-fixture";
const BASE = process.env.CB_FIXTURE_BASE ?? "main";

const dryRun = process.argv.includes("--dry-run");
const token = process.env.CODEBAHN_TOKEN ?? "";
if (!token && !dryRun) {
  console.error("Set CODEBAHN_TOKEN (env, not argv, so it stays out of ps).");
  process.exit(1);
}

// Assembled from parts so this repo never holds a string a secret scanner reads
// as a live key; the planted commit gets the whole thing. GitHub push protection
// rejected the literal, which says the bait is convincing enough.
const PLANTED_KEY = ["sk", "live", "8f3a9c2e1b7d4f6a0c5e8b2d"].join("_");
const PLANTED_DECL = `const API_KEY = "${PLANTED_KEY}";`;

const CLIENT_WITH_SECRET = `import { DEFAULT_CURRENCY } from "./config.js";

// TODO: move to configuration before launch
${PLANTED_DECL}
const BASE_URL = "https://pricing.example.com";

export interface Price {
  amount: number;
  currency: string;
}

/** Masks all but the first \`keep\` characters of a value. */
export function redact(value: string, keep: number): string {
  return value.slice(0, keep) + "*".repeat(value.length - keep);
}

export function apiKeyFingerprint(): string {
  return redact(API_KEY, 7);
}
`;

const CLIENT_WITH_FETCH = `${CLIENT_WITH_SECRET}
export async function fetchPrice(sku: string): Promise<Price> {
  try {
    const res = await fetch(\`\${BASE_URL}/prices/\${sku}\`, {
      headers: { Authorization: \`Bearer \${API_KEY}\` },
    });
    return (await res.json()) as Price;
  } catch {
    return { amount: 0, currency: DEFAULT_CURRENCY };
  }
}
`;

const CLIENT_FINAL = CLIENT_WITH_FETCH.replace(
  `// TODO: move to configuration before launch\n${PLANTED_DECL}`,
  `const API_KEY = process.env.PRICING_API_KEY ?? "";`,
);

// The whole experiment rests on this: planted in the first commit, gone from the
// last, so it exists only between them. A silently failed replace would turn a
// history-only defect into one the squashed diff shows.
if (!CLIENT_WITH_SECRET.includes(PLANTED_KEY) || CLIENT_FINAL.includes(PLANTED_KEY)) {
  throw new Error(
    "fixture invariant broken: the credential must be in the first commit and absent from the last",
  );
}

const INDEX_WITH_FETCH = `export { validateUsername, validateEmail } from "./validate.js";
export { formatCurrency, truncate } from "./format.js";
export { redact, fetchPrice } from "./client.js";
export type { ValidationResult, FormatOptions } from "./types.js";
`;

interface Step {
  message: string;
  path: string;
  content: string;
  plants?: string;
}

// Order matters: the credential is planted first and swept in the last commit,
// and index.ts references fetchPrice one commit before it exists.
const STEPS: Step[] = [
  {
    message: "feat: add pricing client with redaction helper",
    path: "src/client.ts",
    content: CLIENT_WITH_SECRET,
    plants: "secret-in-history, unbounded-redact",
  },
  {
    message: "feat: export the pricing client",
    path: "src/index.ts",
    content: INDEX_WITH_FETCH,
    plants: "broken-bisect (fetchPrice does not exist yet)",
  },
  {
    message: "feat: fetch prices from the pricing service",
    path: "src/client.ts",
    content: CLIENT_WITH_FETCH,
    plants: "swallowed-error",
  },
  {
    message: "refactor: read the API key from the environment",
    path: "src/client.ts",
    content: CLIENT_FINAL,
    plants: "removes the credential from the working tree, not from history",
  },
];

if (dryRun) {
  console.log(`Fixture (dry run): ${OWNER}/${REPO}, branch ${BRANCH} off ${BASE}\n`);
  STEPS.forEach((step, i) => {
    console.log(`  commit ${i + 1}  ${step.message}`);
    console.log(`            ${step.path}, ${step.content.split("\n").length} lines`);
    console.log(`            plants: ${step.plants}`);
  });
  console.log(`\n  Defects scored afterwards: ${DEFECTS.map((d) => d.id).join(", ")}`);
  process.exit(0);
}

const headers = {
  Authorization: `token ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${HOST}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await api(method, path, body);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const repoPath = `/repos/${OWNER}/${REPO}`;
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

async function resetBranch(): Promise<void> {
  const existing = await api("GET", `${repoPath}/branches/${encodeURIComponent(BRANCH)}`);
  if (existing.ok) {
    // Only ever a branch this script created; the name is namespaced.
    console.log(`  branch ${BRANCH} exists, recreating it`);
    for (const pr of await json<Array<{ number: number; head: { ref: string } }>>(
      "GET",
      `${repoPath}/pulls?state=open&limit=50`,
    )) {
      if (pr.head.ref === BRANCH) {
        await json("PATCH", `${repoPath}/pulls/${pr.number}`, { state: "closed" });
        console.log(`  closed the previous PR #${pr.number}`);
      }
    }
    const res = await api("DELETE", `${repoPath}/branches/${encodeURIComponent(BRANCH)}`);
    if (!res.ok) throw new Error(`could not delete ${BRANCH}: ${res.status}`);
  }
  await json("POST", `${repoPath}/branches`, {
    new_branch_name: BRANCH,
    old_branch_name: BASE,
  });
}

async function writeFile(step: Step): Promise<void> {
  const path = `${repoPath}/contents/${step.path}`;
  const current = await api("GET", `${path}?ref=${encodeURIComponent(BRANCH)}`);
  const sha = current.ok ? ((await current.json()) as { sha: string }).sha : undefined;

  await json(sha ? "PUT" : "POST", path, {
    branch: BRANCH,
    message: step.message,
    content: b64(step.content),
    ...(sha ? { sha } : {}),
  });
}

async function main(): Promise<void> {
  console.log(`Fixture: ${OWNER}/${REPO}, branch ${BRANCH} off ${BASE}`);
  await resetBranch();

  for (const [i, step] of STEPS.entries()) {
    await writeFile(step);
    console.log(`  commit ${i + 1}  ${step.message}`);
  }

  const pr = await json<{ number: number; html_url: string }>("POST", `${repoPath}/pulls`, {
    head: BRANCH,
    base: BASE,
    title: "feat: add pricing client",
    body: [
      "Adds a small client for the pricing service, with a redaction helper for logging.",
      "",
      "The API key moved to the environment while I was in here.",
    ].join("\n"),
  });

  console.log(`\n  PR #${pr.number}  ${pr.html_url}`);
  console.log(
    `  Run the arms with: ./agent/run.sh codebahn ${OWNER} ${REPO} review-defects --arm before|after`,
  );
  console.log(`  CB_PR=${pr.number}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
