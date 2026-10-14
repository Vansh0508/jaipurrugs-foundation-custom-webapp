import "server-only";
import { createHash } from "node:crypto";
import type { ReviewSource } from "./sources";

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

// Reviewer + the start of the text, not the date: platforms show relative dates
// ("2 weeks ago") that change between syncs, which would make every sync look new.
export function reviewDedupeKey(source: ReviewSource, reviewerName: string, reviewText: string) {
  return createHash("sha256")
    .update(`${source}|${normalize(reviewerName)}|${normalize(reviewText).slice(0, 160)}`)
    .digest("hex");
}
