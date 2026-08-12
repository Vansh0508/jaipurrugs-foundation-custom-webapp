-- Phase 5 follow-up: the public share-link page (app/(public)/f/[shareToken]) needs
-- anonymous read access to a form and its fields once published -- the original
-- forms/form_fields policies (20260812100000_forms_schema.sql) only granted
-- `authenticated` + is_active_team_member(), so genuine public visitors always hit
-- RLS and got treated as "not found". Mirrors the same `status = 'published'` gate
-- already used for form_submissions/form_answers in 20260812130000_submissions_schema.sql.

create policy "public_select_forms"
on public.forms
for select
to public
using ( status = 'published' );

create policy "public_select_form_fields"
on public.form_fields
for select
to public
using (
  deleted_at is null
  and exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
  )
);
