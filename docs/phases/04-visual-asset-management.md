# Phase 4 — Visual Asset Management

See [AGENTS.md](../../AGENTS.md) §5–6 for the storage-bucket and JSONB-default-fallback conventions this phase implements.

## Scope

- `form-assets` Supabase Storage bucket: **public-read**, write restricted to active team members via storage RLS. Path convention: `forms/{form_id}/{logo|cover}/{filename}` and `forms/{form_id}/sections/{section_field_id}/{filename}`.
- Logo and cover image upload controls in the form editor, writing `forms.settings.logo_url` / `cover_image_url`.
- Per-section background control (color or image) on each `section` field, stored as an override in that field's own `config.background`.
- A form-wide "section style" default at `forms.settings.section_defaults.background` — editing this one value re-styles every section that has no individual override, implementing "apply a background to all sections at once" without any bulk row-update mutation. Resolution order at render time: section's own `config.background` override, else `forms.settings.section_defaults.background`, else none.

## Do's

- Keep `form-assets` public-read — these images render on the anonymous public form page and cannot sit behind admin-only signed URLs.
- Restrict all writes (upload/replace/delete) on `form-assets` to active team members via storage RLS, even though reads are public.
- Implement "apply to all sections" purely as the default-fallback read pattern described above — no separate bulk-update action needed or wanted.

## Don'ts

- Don't put logo, cover, or section images in the private `admin-assets`/`form-uploads` buckets — the public renderer (Phase 5) cannot read those.
- Don't build a bulk-update mutation that writes the same background into every section field's `config` row — this creates a sync problem the whole time a form is being edited. Use the fallback pattern instead.

## Definition of Done

Setting a form's logo/cover image and a form-wide section background default makes it appear on every section on the (not-yet-built) public page once Phase 5 lands. Overriding one section's background individually changes only that section. An anonymous, unauthenticated request can read images from `form-assets` directly but cannot upload or replace them.
