# Phase 6 — Submissions View & Metrics Dashboard

See [AGENTS.md](../../AGENTS.md) §5 on `field_snapshot` — this phase is where that design decision pays off.

## Scope

- `app/(admin)/forms/[id]/submissions/page.tsx` — response table (HeroUI Table): one row per submission, key field columns, completion status, submitted-at, date-range and completed/partial filters, CSV export (server action pivoting `form_answers` by `field_id` into columns using each field's **current** label for the export, while metrics below use the historical snapshot).
- Live updates: subscribe to Supabase Realtime `postgres_changes` on `form_submissions`/`form_answers` filtered by `form_id`, so new/updating responses appear without refresh.
- `app/(admin)/forms/[id]/metrics/page.tsx` — per-field dashboard: summary row (total responses, completion rate, avg completion time, response-volume sparkline), then one card per field in form order, type-appropriate visualization (bar breakdown for choice types, histogram + avg for numeric/rating/scale, response/skip count + sample for text, downloadable list for file uploads), plus a completion funnel by page showing drop-off between sections.

## Do's

- Use Supabase Realtime `postgres_changes` for live updates on this (admin) side only — the public side (Phase 5) is a pure writer and never subscribes.
- Compute all metrics/aggregations using each answer's `field_snapshot`, so a field renamed or retyped after collecting responses doesn't retroactively corrupt historical numbers.
- Count `in_progress` submissions in the drop-off funnel but never in "completed" totals.

## Don'ts

- Don't recompute historical metrics against the field's *current* config/label — use the snapshot captured at answer time.
- Don't load the full submissions set unpaginated on the client — filter/paginate server-side.

## Definition of Done

Submitting several responses with varied answers produces correct per-field visualizations, including partial submissions correctly reflected in the drop-off funnel but excluded from completed totals. Editing a field's label after collecting responses does not change how historical answers are labeled in the metrics view. New submissions appear in the submissions table live, without a manual refresh.
