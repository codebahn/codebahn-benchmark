// Scores a review transcript against the planted defects.

import type { Defect, Visibility } from "./defects.js";

interface TranscriptEvent {
  type?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
}

/**
 * The review text to score. The task asks for a fenced json block; when the
 * agent supplies one we score only that, so prose speculation earlier in the
 * message cannot earn credit. Otherwise we fall back to the whole reply.
 */
export function extractFindingsText(events: TranscriptEvent[]): string {
  let last = "";
  for (const event of events) {
    if (event.type !== "assistant") continue;
    const text = (event.message?.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    if (text.trim()) last = text;
  }

  const fences = [...last.matchAll(/```json\s*([\s\S]*?)```/g)];
  const fenced = fences.at(-1)?.[1];
  return (fenced ?? last).trim();
}

interface VisibilityScore {
  found: number;
  total: number;
  recall: number;
}

export interface ReviewScore {
  found: Defect[];
  missed: Defect[];
  recall: number;
  byVisibility: Record<Visibility, VisibilityScore>;
}

const recallOf = (found: number, total: number) => (total > 0 ? found / total : 0);

export function scoreReview(text: string, defects: Defect[]): ReviewScore {
  const found = defects.filter((defect) => defect.signals.every((s) => s.test(text)));
  const missed = defects.filter((defect) => !found.includes(defect));

  const byVisibility = {} as Record<Visibility, VisibilityScore>;
  for (const visibility of ["squashed", "history"] as const) {
    const total = defects.filter((d) => d.visibility === visibility).length;
    const hit = found.filter((d) => d.visibility === visibility).length;
    byVisibility[visibility] = { found: hit, total, recall: recallOf(hit, total) };
  }

  return { found, missed, recall: recallOf(found.length, defects.length), byVisibility };
}
