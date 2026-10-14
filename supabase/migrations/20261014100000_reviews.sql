-- Phase 11 / M6: public reviews pulled from booking platforms (currently Airbnb)
-- via Firecrawl + the review-organizer agent. See docs/phases/11-visit-operations.md.
-- Admin-only: no anon access.

create table public.reviews (
  id                   uuid primary key default gen_random_uuid(),
  -- Where the review was fetched from; drives the tag on the card and the filter.
  source               text not null check (source in ('airbnb', 'tripadvisor')),
  source_url           text,
  -- sha256 of source + reviewer + start of the text, computed in lib/reviews/dedupe.ts.
  -- Deliberately excludes the date: platforms show relative dates ("2 weeks ago") that
  -- drift between syncs. Makes re-syncing idempotent.
  dedupe_key           text not null,
  reviewer_name        text not null check (length(trim(reviewer_name)) > 0),
  -- Optional: the UI falls back to the name's initials when this is null or fails to load.
  reviewer_avatar_url  text,
  rating               smallint check (rating is null or rating between 1 and 5),
  review_text          text not null check (length(trim(review_text)) > 0),
  -- Platforms often show only "October 2026" or "2 weeks ago", so this is the best
  -- date the agent could derive (first of the month for month-only dates).
  reviewed_at          date,
  fetched_at           timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create unique index reviews_source_dedupe_key on public.reviews (source, dedupe_key);
create index reviews_source_reviewed_at_idx on public.reviews (source, reviewed_at desc nulls last);

alter table public.reviews enable row level security;

create policy "active_members_all_reviews"
on public.reviews
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );
