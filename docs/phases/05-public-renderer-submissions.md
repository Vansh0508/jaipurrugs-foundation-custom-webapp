# Phase 5 — Public Renderer & Submissions Pipeline

See [AGENTS.md](../../AGENTS.md) §3 for why this route group must stay outside the admin gate entirely.

## Scope

- `form_submissions` table: `form_id`, `submitter_token` (client-persisted, allows resuming a partial submission), `status` (`in_progress`/`completed`), `metadata` JSONB, timestamps.
- `form_answers` table: `submission_id`, `field_id`, `value` JSONB, `field_snapshot` JSONB (captures `{label, type}` at answer time so later field edits don't corrupt historical data), timestamps.
- RLS: anonymous role gets insert-only on both tables, scoped to `forms.status = 'published'`, and update only on rows matching its own `submitter_token`.
- `app/(public)/f/[shareToken]/page.tsx` — the public form renderer, entirely outside the `(admin)` middleware gate: anonymous, no Supabase session dependency.
- Pagination: fields are grouped into pages of `forms.settings.questions_per_page` (admin-configurable), with any `section` field always forcing a new page regardless of the count.
- Visual layer: renders the form's `logo_url`/`cover_image_url` and each page's resolved section background (per Phase 4's fallback pattern).
- Progressive save: on first load, create (or resume via `submitter_token`) a `form_submissions` row with `status='in_progress'`. Each page's Next/Submit upserts that page's answers into `form_answers`. Final page flips the submission to `completed` and shows the form's configured success message/redirect.
- File-upload answers are proxied through a server action using the service-role key (never exposed to the browser) into the private `form-uploads` bucket, path `{form_id}/{submission_id}/{field_id}/{filename}`.

## Do's

- Create the `form_submissions` row on first page load, before any answer exists, so there is always something for progressive saves to attach to.
- Save per page (or per answer), not only on final submit — this is the resilience feature for field workers on unreliable connections, and it's what feeds the drop-off funnel in Phase 6.
- Keep this entire route group free of any Supabase session dependency or admin middleware.

## Don'ts

- Don't gate `app/(public)/...` behind the admin middleware, and don't add anything under `(public)` that imports from `lib/actions/team.ts` or other admin-only server actions.
- Don't defer all persistence to a single final-submit write — that reintroduces exactly the data-loss risk progressive saving exists to prevent.
- Don't expose the service-role key to the browser for file uploads — route them through a server action.

## Definition of Done

Filling a form on a mobile viewport, killing the tab mid-way, and reopening the link resumes via `submitter_token` rather than restarting. A full submission flips to `completed` and its answers are immediately queryable. A non-published form's public URL refuses new submissions (RLS-enforced, not just a UI check).
