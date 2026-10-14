"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRotateRight, ChevronDown } from "@gravity-ui/icons";
import { Avatar, Button, Chip, Dropdown, Label, toast } from "@heroui/react";
import { syncReviewsFromSource } from "@/lib/actions/reviews";
import type { Tables } from "@/lib/types/supabase";
import { REVIEW_SOURCE_LABELS, REVIEW_SYNC_TARGETS, isReviewSource, type ReviewSource } from "@/lib/reviews/sources";

export type ReviewRow = Tables<"reviews">;

const SOURCE_CHIP_COLOR: Record<ReviewSource, "danger" | "success"> = {
  airbnb: "danger",
  tripadvisor: "success",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

// Platforms often give only a month, so show month + year rather than a day we can't vouch for.
function formatReviewDate(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function SourceTag({ source }: { source: string }) {
  const known = isReviewSource(source);
  return (
    <Chip size="sm" variant="soft" color={known ? SOURCE_CHIP_COLOR[source] : "default"}>
      <Chip.Label>{known ? REVIEW_SOURCE_LABELS[source] : source}</Chip.Label>
    </Chip>
  );
}

const LONG_REVIEW_CHARS = 320;

function ReviewCard({ review }: { review: ReviewRow }) {
  const [expanded, setExpanded] = useState(false);
  const date = formatReviewDate(review.reviewed_at);
  const isLong = review.review_text.length > LONG_REVIEW_CHARS;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <Avatar size="md">
          {review.reviewer_avatar_url && (
            // Linked straight from Airbnb's image CDN; no-referrer so it loads regardless of our domain.
            <Avatar.Image alt={review.reviewer_name} src={review.reviewer_avatar_url} referrerPolicy="no-referrer" />
          )}
          <Avatar.Fallback>{initials(review.reviewer_name)}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{review.reviewer_name}</p>
          <p className="text-xs text-muted">{date ?? "Date not shown"}</p>
        </div>
        <SourceTag source={review.source} />
      </header>
      {review.rating !== null && (
        <p className="text-sm text-warning" aria-label={`${review.rating} out of 5 stars`}>
          {"★".repeat(review.rating)}
          <span className="text-muted/40">{"★".repeat(5 - review.rating)}</span>
        </p>
      )}
      <p className={`whitespace-pre-line text-sm text-foreground/90 ${isLong && !expanded ? "line-clamp-6" : ""}`}>
        {review.review_text}
      </p>
      {isLong && (
        <button
          type="button"
          className="self-start text-xs font-medium text-accent hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </article>
  );
}

export function ReviewsPanel({ reviews }: { reviews: ReviewRow[] }) {
  const [filter, setFilter] = useState<"all" | ReviewSource>("all");
  const [syncingSource, setSyncingSource] = useState<ReviewSource | null>(null);
  const [, startSync] = useTransition();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reviews) map.set(r.source, (map.get(r.source) ?? 0) + 1);
    return map;
  }, [reviews]);

  // Offer a filter for every source that has reviews, plus any source we can sync.
  const filterSources = (Object.keys(REVIEW_SOURCE_LABELS) as ReviewSource[]).filter(
    (s) => counts.has(s) || REVIEW_SYNC_TARGETS[s],
  );
  const syncSources = Object.keys(REVIEW_SYNC_TARGETS) as ReviewSource[];
  const visible = filter === "all" ? reviews : reviews.filter((r) => r.source === filter);

  function handleSync(source: ReviewSource) {
    setSyncingSource(source);
    startSync(async () => {
      const result = await syncReviewsFromSource(source);
      setSyncingSource(null);
      if (result.error) {
        toast.danger(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      const label = REVIEW_SOURCE_LABELS[source];
      toast.success(
        result.inserted
          ? `Added ${result.inserted} new ${label} review${result.inserted === 1 ? "" : "s"}.`
          : `${label} reviews are already up to date.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter reviews by source">
          <Button size="sm" variant={filter === "all" ? "primary" : "secondary"} onPress={() => setFilter("all")}>
            All ({reviews.length})
          </Button>
          {filterSources.map((source) => (
            <Button
              key={source}
              size="sm"
              variant={filter === source ? "primary" : "secondary"}
              onPress={() => setFilter(source)}
            >
              {REVIEW_SOURCE_LABELS[source]} ({counts.get(source) ?? 0})
            </Button>
          ))}
        </div>
        <Dropdown>
          <Button size="sm" isPending={syncingSource !== null}>
            Merge
            <ChevronDown className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              disabledKeys={syncingSource ? syncSources : []}
              onAction={(key) => handleSync(String(key) as ReviewSource)}
            >
              {syncSources.map((source) => (
                <Dropdown.Item key={source} id={source} textValue={`Sync ${REVIEW_SOURCE_LABELS[source]} reviews`}>
                  <ArrowRotateRight className="size-4 shrink-0" />
                  <Label>Sync {REVIEW_SOURCE_LABELS[source]} reviews</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {reviews.length === 0
            ? "No reviews yet. Use a sync button to fetch them from Airbnb or TripAdvisor."
            : "No reviews from this source yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
