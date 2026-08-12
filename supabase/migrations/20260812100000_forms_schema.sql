-- Phase 2: forms + form_fields schema and RLS. See AGENTS.md §1/§7 — team_members
-- has no roles, so (unlike the stale note in docs/phases/02-forms-schema-admin-crud.md)
-- both tables are gated on public.is_active_team_member() for every operation,
-- exactly like team_members itself, not on a since-abandoned editor/super_admin split.

create type public.form_status as enum ('draft', 'published', 'archived');

create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Untitled form',
  description text,
  slug        text not null,
  -- The public URL token (app/(public)/f/[shareToken]) — immutable, never
  -- editable from the admin UI once a row exists.
  share_token text not null default replace(gen_random_uuid()::text, '-', ''),
  status      public.form_status not null default 'draft',
  -- Success message, redirect URL, close date, submission limit, and later
  -- pagination/asset settings — see AGENTS.md §5 on keeping config as JSONB.
  settings    jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index forms_slug_lower_idx on public.forms (lower(slug));
create unique index forms_share_token_idx on public.forms (share_token);
create index forms_created_by_idx on public.forms (created_by);

-- Blank-form creation (insert default values, no title yet) still needs a
-- unique slug immediately, so derive one from the share_token when the caller
-- doesn't supply one — the admin-facing slug-rename UI lands in a later phase.
create or replace function public.forms_default_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := 'untitled-form-' || substr(new.share_token, 1, 8);
  end if;
  return new;
end;
$$;

create trigger trg_forms_default_slug
before insert on public.forms
for each row
execute procedure public.forms_default_slug();

create trigger trg_forms_set_updated_at
before update on public.forms
for each row
execute procedure public.set_updated_at();

alter table public.forms enable row level security;

create policy "active_members_can_select_forms"
on public.forms
for select
to authenticated
using ( public.is_active_team_member() );

create policy "active_members_can_insert_forms"
on public.forms
for insert
to authenticated
with check ( public.is_active_team_member() );

create policy "active_members_can_update_forms"
on public.forms
for update
to authenticated
using ( public.is_active_team_member() )
with check ( public.is_active_team_member() );

create policy "active_members_can_delete_forms"
on public.forms
for delete
to authenticated
using ( public.is_active_team_member() );

-- Core v1 field set per docs/phases/03-field-registry-editor.md. New types are
-- added later with `alter type ... add value` — the registry (Phase 3) stays
-- the single source of truth for how each type renders/validates/configures.
create type public.form_field_type as enum (
  'short_text',
  'long_text',
  'number',
  'email',
  'phone',
  'date',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'rating',
  'linear_scale',
  'file_upload',
  'section'
);

create table public.form_fields (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms (id) on delete cascade,
  type        public.form_field_type not null,
  -- Fractional index: reordering (Phase 3) writes exactly one row, never a
  -- renumbering pass. See AGENTS.md §5.
  position    double precision not null,
  label       text,
  description text,
  placeholder text,
  required    boolean not null default false,
  -- Type-specific config/validation, kept as JSONB and validated in the app
  -- layer by the Phase 3 field-type registry — see AGENTS.md §5/§6 on why this
  -- must never be normalized into per-type tables.
  config      jsonb not null default '{}'::jsonb,
  validation  jsonb not null default '{}'::jsonb,
  -- Reserved, unused until a later phase.
  logic       jsonb not null default '{}'::jsonb,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Partial + composite: every real query orders a form's live fields by
-- position, and soft-deleted rows should never show up in that scan.
create index form_fields_form_id_position_idx
  on public.form_fields (form_id, position)
  where deleted_at is null;

create trigger trg_form_fields_set_updated_at
before update on public.form_fields
for each row
execute procedure public.set_updated_at();

alter table public.form_fields enable row level security;

create policy "active_members_can_select_form_fields"
on public.form_fields
for select
to authenticated
using ( public.is_active_team_member() );

create policy "active_members_can_insert_form_fields"
on public.form_fields
for insert
to authenticated
with check ( public.is_active_team_member() );

create policy "active_members_can_update_form_fields"
on public.form_fields
for update
to authenticated
using ( public.is_active_team_member() )
with check ( public.is_active_team_member() );

create policy "active_members_can_delete_form_fields"
on public.form_fields
for delete
to authenticated
using ( public.is_active_team_member() );
