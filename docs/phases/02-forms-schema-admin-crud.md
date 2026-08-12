# Phase 2 — Forms Schema & Admin CRUD Shell

See [AGENTS.md](../../AGENTS.md) §5–6 for the RLS and JSONB-config conventions this phase establishes for the rest of the forms domain.

## Scope

- `forms` table: `title`, `description`, `slug` (unique, admin-facing/editable), `share_token` (unique, immutable, the public URL), `status` (`draft`/`published`/`archived`), `settings` JSONB (success message, redirect URL, close date, submission limit, pagination/asset settings added in later phases), `created_by`, timestamps.
- `form_fields` table: `form_id`, `type` (enum, core v1 set only — see Phase 3), fractional `position`, `label`/`description`/`placeholder`, `required`, `config` JSONB, `validation` JSONB, `logic` JSONB (reserved, unused), `deleted_at` (soft delete).
- RLS on both tables via `public.is_active_team_member()`: any active member can read and write — `team_members` is single-tier with no roles (AGENTS.md §1/§7), so there is no separate `editor`/`super_admin` write tier.
- `app/(admin)/forms/page.tsx` — forms list (HeroUI Table), status filter tabs, search, "Create form" button.
- "Create form" inserts a blank `forms` row server-side and redirects straight into `/forms/[id]/edit`, so the editor always has a real row to autosave against from the first keystroke.
- A basic `/forms/[id]/edit` shell (routing and layout only — the actual field-editing canvas is Phase 3).

## Do's

- Enable RLS on `forms` and `form_fields` in the same migration that creates them — not as a follow-up.
- Use a fractional `position` column from the start, so reordering (added in Phase 3) is a single-row update rather than a renumbering migration later.
- Keep `config`/`validation` as JSONB on `form_fields`, validated in the app layer — this is what lets Phase 3's field-type registry add new types without a schema change.

## Don'ts

- Don't normalize field config into per-type tables (e.g. a separate options table for choice fields) — this defeats the JSONB-registry design the rest of the forms domain depends on.
- Don't ship `forms` or `form_fields` without RLS "temporarily, to move faster" — there is no safe temporary state for an admin-owned table with no RLS.
- Don't build the field-editing UI in this phase — this phase is schema + list + shell only; the canvas is Phase 3.

## Definition of Done

A form can be created from `/forms`, appears in the list with the correct status, and its `id` routes correctly to an (empty) edit shell. Reordering a field's `position` (tested directly via SQL) touches exactly one row. A non-whitelisted/inactive test JWT cannot read or write `forms`/`form_fields` even when querying directly.
