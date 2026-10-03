-- Phase 9: lead lists with custom attributes, form → lead sync, and the
-- template variable bindings the agent uses to fill WhatsApp templates.
-- See docs/phases/09-leads-templates.md and AGENTS.md §5-§7.

-- ---------------------------------------------------------------------------
-- Custom attributes (global; deactivate instead of delete so data survives)
-- ---------------------------------------------------------------------------
create type public.lead_attribute_type as enum ('text', 'number', 'date', 'select');

create table public.lead_attributes (
  id          uuid primary key default gen_random_uuid(),
  -- Stable identifier used in leads.attributes, form mappings and template
  -- bindings. Immutable once created (enforced in the app layer).
  key         text not null unique
              check (key ~ '^[a-z][a-z0-9_]{0,39}$' and key not in ('name', 'phone')),
  label       text not null check (length(trim(label)) > 0),
  type        public.lead_attribute_type not null default 'text',
  options     text[] not null default '{}',
  -- Shown to the agent so it knows what to ask for and how to phrase it.
  description text,
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_lead_attributes_set_updated_at
before update on public.lead_attributes
for each row
execute procedure public.set_updated_at();

alter table public.lead_attributes enable row level security;

create policy "active_members_all_lead_attributes"
on public.lead_attributes
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Leads (one row per phone number)
-- ---------------------------------------------------------------------------
create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  name             text,
  -- { "<lead_attributes.key>": value } — values already coerced to the
  -- attribute's type by public.lead_attribute_value().
  attributes       jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  source           text not null default 'form' check (source in ('form', 'whatsapp_agent', 'manual')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leads_phone_valid check (phone_normalized is not null)
);

create unique index leads_phone_normalized_key on public.leads (phone_normalized);
create index leads_updated_at_idx on public.leads (updated_at desc);

create trigger trg_leads_set_updated_at
before update on public.leads
for each row
execute procedure public.set_updated_at();

alter table public.leads enable row level security;

create policy "active_members_all_leads"
on public.leads
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Named lists (a lead can be in many)
-- ---------------------------------------------------------------------------
create table public.lead_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index lead_lists_name_key on public.lead_lists (lower(name));

create trigger trg_lead_lists_set_updated_at
before update on public.lead_lists
for each row
execute procedure public.set_updated_at();

alter table public.lead_lists enable row level security;

create policy "active_members_all_lead_lists"
on public.lead_lists
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

create table public.lead_list_members (
  list_id  uuid not null references public.lead_lists(id) on delete cascade,
  lead_id  uuid not null references public.leads(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, lead_id)
);

create index lead_list_members_lead_id_idx on public.lead_list_members (lead_id);

alter table public.lead_list_members enable row level security;

create policy "active_members_all_lead_list_members"
on public.lead_list_members
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Per-form mapping: which answers become which lead fields
-- ---------------------------------------------------------------------------
create table public.form_lead_mappings (
  form_id        uuid primary key references public.forms(id) on delete cascade,
  enabled        boolean not null default true,
  phone_field_id uuid references public.form_fields(id) on delete set null,
  name_field_id  uuid references public.form_fields(id) on delete set null,
  -- { "<form_fields.id>": "<lead_attributes.key>" }
  attribute_map  jsonb not null default '{}'::jsonb check (jsonb_typeof(attribute_map) = 'object'),
  list_ids       uuid[] not null default '{}',
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index form_lead_mappings_phone_field_idx on public.form_lead_mappings (phone_field_id);
create index form_lead_mappings_name_field_idx on public.form_lead_mappings (name_field_id);

create trigger trg_form_lead_mappings_set_updated_at
before update on public.form_lead_mappings
for each row
execute procedure public.set_updated_at();

alter table public.form_lead_mappings enable row level security;

create policy "active_members_all_form_lead_mappings"
on public.form_lead_mappings
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Template variable bindings (Meta/Zernio store no notion of a value source)
-- ---------------------------------------------------------------------------
create table public.whatsapp_template_bindings (
  template_name text not null,
  language      text not null,
  -- [{ "key": "header:1"|"body:<placeholder>"|"button.<i>:1",
  --    "field": "name"|"phone"|"attr:<key>", "fallback": text|null }]
  variables     jsonb not null default '[]'::jsonb check (jsonb_typeof(variables) = 'array'),
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (template_name, language)
);

create trigger trg_whatsapp_template_bindings_set_updated_at
before update on public.whatsapp_template_bindings
for each row
execute procedure public.set_updated_at();

alter table public.whatsapp_template_bindings enable row level security;

create policy "active_members_all_template_bindings"
on public.whatsapp_template_bindings
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Value helpers (pure)
-- ---------------------------------------------------------------------------
-- A form answer as text: strings as-is, numbers/booleans cast, checkbox
-- arrays joined. Objects (e.g. file uploads) have no text form.
create or replace function public.answer_to_text(p_value jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(trim(case jsonb_typeof(p_value)
    when 'string' then p_value #>> '{}'
    when 'number' then p_value #>> '{}'
    when 'boolean' then p_value #>> '{}'
    when 'array' then (
      select string_agg(e #>> '{}', ', ')
      from jsonb_array_elements(p_value) as e
      where jsonb_typeof(e) in ('string', 'number', 'boolean')
    )
  end), '');
$$;

-- Coerce raw text to an attribute's type. NULL means "not a valid value",
-- so callers drop it rather than storing junk.
create or replace function public.lead_attribute_value(
  p_type public.lead_attribute_type,
  p_options text[],
  p_raw text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := nullif(trim(coalesce(p_raw, '')), '');
  match text;
begin
  if v is null then
    return null;
  end if;

  if p_type = 'number' then
    begin
      return to_jsonb(replace(v, ',', '')::numeric);
    exception when others then
      return null;
    end;
  elsif p_type = 'date' then
    begin
      return to_jsonb(to_char(v::date, 'YYYY-MM-DD'));
    exception when others then
      return null;
    end;
  elsif p_type = 'select' then
    select o into match from unnest(p_options) as o where lower(o) = lower(v) limit 1;
    return case when match is null then null else to_jsonb(match) end;
  end if;

  return to_jsonb(left(v, 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- Agent: create/update the lead for the conversation's phone
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: RLS on leads still applies. Only active attributes are
-- accepted; each value is coerced to its type. Returns what was saved and
-- what was rejected so the agent can re-ask.
create or replace function public.agent_upsert_lead(
  p_phone      text,
  p_name       text,
  p_attributes jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  attr record;
  coerced jsonb;
  clean jsonb := '{}'::jsonb;
  saved text[] := '{}';
  rejected jsonb := '[]'::jsonb;
  k text;
  v_lead_id uuid;
begin
  if public.normalize_phone(p_phone) is null then
    raise exception 'invalid phone';
  end if;

  for k in select jsonb_object_keys(coalesce(p_attributes, '{}'::jsonb)) loop
    select * into attr from public.lead_attributes la where la.key = k and la.is_active;
    if not found then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'unknown or inactive attribute');
      continue;
    end if;
    coerced := public.lead_attribute_value(attr.type, attr.options, public.answer_to_text(p_attributes -> k));
    if coerced is null then
      rejected := rejected || jsonb_build_object(
        'key', k,
        'reason', case attr.type
          when 'select' then 'must be one of: ' || array_to_string(attr.options, ', ')
          when 'number' then 'must be a number'
          when 'date' then 'must be a date (YYYY-MM-DD)'
          else 'empty value'
        end
      );
      continue;
    end if;
    clean := clean || jsonb_build_object(k, coerced);
    saved := saved || k;
  end loop;

  insert into public.leads (phone, name, attributes, source)
  values (p_phone, nullif(trim(coalesce(p_name, '')), ''), clean, 'whatsapp_agent')
  on conflict (phone_normalized) do update
    set name = coalesce(excluded.name, public.leads.name),
        attributes = public.leads.attributes || excluded.attributes
  returning id into v_lead_id;

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'saved_name', nullif(trim(coalesce(p_name, '')), '') is not null,
    'saved', to_jsonb(saved),
    'rejected', rejected
  );
end;
$$;

revoke execute on function public.agent_upsert_lead(text, text, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- Form submission → lead sync
-- ---------------------------------------------------------------------------
-- Lives in `private` (not exposed through the Data API) because it is
-- SECURITY DEFINER: completed submissions come from anonymous form fillers,
-- who must never get write access to leads themselves.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- p_overwrite: a live submission is the newest information, so its answers
-- win. The admin backfill passes false and only fills gaps, so replaying old
-- submissions never clobbers newer data (e.g. details the agent collected).
create or replace function private.sync_lead_from_submission(
  p_submission_id uuid,
  p_overwrite boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub record;
  mapping record;
  v_phone text;
  v_name text;
  v_attrs jsonb := '{}'::jsonb;
  v_lead_id uuid;
  entry record;
  coerced jsonb;
begin
  select s.id, s.form_id, s.status into sub
  from public.form_submissions s
  where s.id = p_submission_id;
  if not found or sub.status <> 'completed' then
    return null;
  end if;

  select * into mapping
  from public.form_lead_mappings m
  where m.form_id = sub.form_id and m.enabled and m.phone_field_id is not null;
  if not found then
    return null;
  end if;

  select public.answer_to_text(a.value) into v_phone
  from public.form_answers a
  where a.submission_id = sub.id and a.field_id = mapping.phone_field_id;
  if public.normalize_phone(v_phone) is null then
    return null;
  end if;

  if mapping.name_field_id is not null then
    select public.answer_to_text(a.value) into v_name
    from public.form_answers a
    where a.submission_id = sub.id and a.field_id = mapping.name_field_id;
  end if;

  for entry in
    select la.key, la.type, la.options, public.answer_to_text(a.value) as raw
    from jsonb_each_text(mapping.attribute_map) as m(field_id, attr_key)
    join public.lead_attributes la on la.key = m.attr_key and la.is_active
    join public.form_answers a on a.submission_id = sub.id and a.field_id::text = m.field_id
  loop
    coerced := public.lead_attribute_value(entry.type, entry.options, entry.raw);
    if coerced is not null then
      v_attrs := v_attrs || jsonb_build_object(entry.key, coerced);
    end if;
  end loop;

  -- Never erases a known value; on overwrite, a new answer replaces an old one.
  insert into public.leads (phone, name, attributes, source)
  values (v_phone, v_name, v_attrs, 'form')
  on conflict (phone_normalized) do update
    set name = case when p_overwrite
                 then coalesce(excluded.name, public.leads.name)
                 else coalesce(public.leads.name, excluded.name) end,
        attributes = case when p_overwrite
                 then public.leads.attributes || excluded.attributes
                 else excluded.attributes || public.leads.attributes end
  returning id into v_lead_id;

  insert into public.lead_list_members (list_id, lead_id)
  select l.id, v_lead_id
  from public.lead_lists l
  where l.id = any (mapping.list_ids)
  on conflict do nothing;

  return v_lead_id;
end;
$$;

revoke execute on function private.sync_lead_from_submission(uuid, boolean) from public, anon, authenticated;

-- Never let lead sync break a public form submission: any failure is logged
-- as a warning and the submission still completes.
create or replace function private.trg_sync_lead_on_submission_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    begin
      perform private.sync_lead_from_submission(new.id);
    exception when others then
      raise warning 'lead sync failed for submission %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function private.trg_sync_lead_on_submission_complete() from public, anon, authenticated;

create trigger trg_form_submissions_sync_lead
after insert or update of status on public.form_submissions
for each row
execute procedure private.trg_sync_lead_on_submission_complete();

-- Admin backfill over a form's existing completed submissions. Newest first
-- and gap-filling only, so the most recent answer for each field lands and
-- nothing already on the lead is overwritten.
create or replace function public.sync_form_leads(p_form_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  synced integer := 0;
begin
  if not public.is_active_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for s in
    select id from public.form_submissions
    where form_id = p_form_id and status = 'completed'
    order by coalesce(completed_at, created_at) desc
  loop
    if private.sync_lead_from_submission(s.id, false) is not null then
      synced := synced + 1;
    end if;
  end loop;

  return synced;
end;
$$;

revoke execute on function public.sync_form_leads(uuid) from public, anon;
grant execute on function public.sync_form_leads(uuid) to authenticated;
