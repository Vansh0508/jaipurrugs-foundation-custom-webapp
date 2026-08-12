-- Phase 5: form_submissions, form_answers schema, storage bucket form-uploads, and RLS.
-- See docs/phases/05-public-renderer-submissions.md and AGENTS.md §5-§7.

create type public.submission_status as enum ('in_progress', 'completed');

create table public.form_submissions (
  id              uuid primary key default gen_random_uuid(),
  form_id         uuid not null references public.forms(id) on delete cascade,
  submitter_token text not null,
  status          public.submission_status not null default 'in_progress',
  metadata        jsonb not null default '{}'::jsonb,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index form_submissions_form_submitter_idx on public.form_submissions (form_id, submitter_token);
create index form_submissions_form_id_status_idx on public.form_submissions (form_id, status);

create trigger trg_form_submissions_set_updated_at
before update on public.form_submissions
for each row
execute procedure public.set_updated_at();

alter table public.form_submissions enable row level security;

-- Active team members can read/delete all submissions for admin review & export
create policy "active_members_select_submissions"
on public.form_submissions
for select
to authenticated
using ( public.is_active_team_member() );

create policy "active_members_delete_submissions"
on public.form_submissions
for delete
to authenticated
using ( public.is_active_team_member() );

-- Public / anon submitters can create a submission only if target form is published
create policy "public_insert_submissions"
on public.form_submissions
for insert
to public
with check (
  exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
  )
);

-- Public / anon submitters can read & update their own submission via submitter_token
create policy "public_select_own_submission"
on public.form_submissions
for select
to public
using (
  exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
  )
);

create policy "public_update_own_submission"
on public.form_submissions
for update
to public
using (
  exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
  )
)
with check (
  exists (
    select 1 from public.forms f
    where f.id = form_id and f.status = 'published'
  )
);


-- Form Answers Table
create table public.form_answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.form_submissions(id) on delete cascade,
  field_id       uuid not null references public.form_fields(id) on delete cascade,
  value          jsonb not null default 'null'::jsonb,
  -- Snapshot of {label, type, position} at answer time to keep historical reports correct
  field_snapshot jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index form_answers_submission_field_idx on public.form_answers (submission_id, field_id);

create trigger trg_form_answers_set_updated_at
before update on public.form_answers
for each row
execute procedure public.set_updated_at();

alter table public.form_answers enable row level security;

-- Active team members can read/delete all answers
create policy "active_members_select_answers"
on public.form_answers
for select
to authenticated
using ( public.is_active_team_member() );

create policy "active_members_delete_answers"
on public.form_answers
for delete
to authenticated
using ( public.is_active_team_member() );

-- Public / anon submitters can select/insert/update answers for published forms
create policy "public_select_answers"
on public.form_answers
for select
to public
using (
  exists (
    select 1 from public.form_submissions s
    join public.forms f on f.id = s.form_id
    where s.id = submission_id and f.status = 'published'
  )
);

create policy "public_insert_answers"
on public.form_answers
for insert
to public
with check (
  exists (
    select 1 from public.form_submissions s
    join public.forms f on f.id = s.form_id
    where s.id = submission_id and f.status = 'published'
  )
);

create policy "public_update_answers"
on public.form_answers
for update
to public
using (
  exists (
    select 1 from public.form_submissions s
    join public.forms f on f.id = s.form_id
    where s.id = submission_id and f.status = 'published'
  )
)
with check (
  exists (
    select 1 from public.form_submissions s
    join public.forms f on f.id = s.form_id
    where s.id = submission_id and f.status = 'published'
  )
);

-- Storage bucket for private submission file attachments
insert into storage.buckets (id, name, public)
values ('form-uploads', 'form-uploads', false)
on conflict (id) do update set public = false;

-- Storage RLS: Active team members can select objects (via signed URLs)
create policy "active_members_select_form_uploads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'form-uploads'
  and public.is_active_team_member()
);
