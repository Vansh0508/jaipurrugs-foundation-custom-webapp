-- Phase 11 / M5: per-guest feedback links.
--
-- A guest gets an opaque token (visit_guests.feedback_token) in a WhatsApp
-- template. /fb/<token> resolves it through the SECURITY DEFINER RPCs below and
-- reads/writes ONLY that guest's own submission. Guest-linked submissions are
-- hidden from every anon policy, so the token is the only way in — a guest can't
-- reach another guest's answers even by calling PostgREST directly.
--
-- NOTE (existing behaviour, not changed here): for ordinary public forms the anon
-- select/update policies on form_submissions / form_answers only check that the
-- form is published, and the submitter-token check lives in the server actions.
-- Guest feedback does not inherit that; it is gated by is_guest_feedback below.

-- ---------------------------------------------------------------------------
-- Link submissions to the visit/guest they belong to
-- ---------------------------------------------------------------------------
alter table public.form_submissions
  add column visit_id uuid references public.visits (id) on delete set null,
  add column visit_guest_id uuid references public.visit_guests (id) on delete set null,
  -- Set only by feedback_save(). Unlike visit_guest_id it is never nulled by a
  -- foreign-key action, so a submission can't become anon-readable if the guest
  -- or visit is later removed.
  add column is_guest_feedback boolean not null default false,
  add constraint form_submissions_guest_feedback_token
    check (not is_guest_feedback or submitter_token like 'vg:%');

create index form_submissions_visit_id_idx on public.form_submissions (visit_id) where visit_id is not null;

-- ---------------------------------------------------------------------------
-- Hide guest-linked rows from every anon policy
-- ---------------------------------------------------------------------------
alter policy "public_insert_submissions" on public.form_submissions
  with check (
    not is_guest_feedback
    and exists (select 1 from public.forms f where f.id = form_submissions.form_id and f.status = 'published')
  );

alter policy "public_select_own_submission" on public.form_submissions
  using (
    not is_guest_feedback
    and exists (select 1 from public.forms f where f.id = form_submissions.form_id and f.status = 'published')
  );

alter policy "public_update_own_submission" on public.form_submissions
  using (
    not is_guest_feedback
    and exists (select 1 from public.forms f where f.id = form_submissions.form_id and f.status = 'published')
  )
  with check (
    not is_guest_feedback
    and exists (select 1 from public.forms f where f.id = form_submissions.form_id and f.status = 'published')
  );

alter policy "public_insert_answers" on public.form_answers
  with check (
    exists (
      select 1
      from public.form_submissions s
      join public.forms f on f.id = s.form_id
      where s.id = form_answers.submission_id and f.status = 'published' and not s.is_guest_feedback
    )
  );

alter policy "public_select_answers" on public.form_answers
  using (
    exists (
      select 1
      from public.form_submissions s
      join public.forms f on f.id = s.form_id
      where s.id = form_answers.submission_id and f.status = 'published' and not s.is_guest_feedback
    )
  );

alter policy "public_update_answers" on public.form_answers
  using (
    exists (
      select 1
      from public.form_submissions s
      join public.forms f on f.id = s.form_id
      where s.id = form_answers.submission_id and f.status = 'published' and not s.is_guest_feedback
    )
  )
  with check (
    exists (
      select 1
      from public.form_submissions s
      join public.forms f on f.id = s.form_id
      where s.id = form_answers.submission_id and f.status = 'published' and not s.is_guest_feedback
    )
  );

-- ---------------------------------------------------------------------------
-- Token resolution (never callable from the API)
-- ---------------------------------------------------------------------------
create function private.feedback_resolve(p_token text)
returns table (guest_id uuid, visit_id uuid, lead_id uuid, form_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, v.id, g.lead_id, v.feedback_form_id
  from public.visit_guests g
  join public.visits v on v.id = g.visit_id
  join public.forms f on f.id = v.feedback_form_id
  where p_token is not null
    and length(p_token) between 20 and 80
    and g.feedback_token = p_token
    and v.status <> 'cancelled'
    and g.status <> 'no_show'
    and f.status = 'published'
  limit 1;
$$;

revoke all on function private.feedback_resolve(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the feedback page needs: which form, who it's for, and any saved answers.
-- Returns null for any invalid token (one uniform "not found").
-- ---------------------------------------------------------------------------
create function public.feedback_session(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_sub_id uuid;
  v_status text;
  v_answers jsonb := '[]'::jsonb;
  v_name text;
  v_type text;
  v_date date;
begin
  select * into r from private.feedback_resolve(p_token);
  if not found then
    return null;
  end if;

  select s.id, s.status into v_sub_id, v_status
  from public.form_submissions s
  where s.form_id = r.form_id and s.submitter_token = 'vg:' || r.guest_id::text;

  if v_sub_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('field_id', a.field_id, 'value', a.value)), '[]'::jsonb)
    into v_answers
    from public.form_answers a
    where a.submission_id = v_sub_id;
  end if;

  select nullif(split_part(trim(coalesce(l.name, '')), ' ', 1), '') into v_name
  from public.leads l where l.id = r.lead_id;

  select vt.visit_type, vt.visit_date into v_type, v_date
  from public.visits vt where vt.id = r.visit_id;

  return jsonb_build_object(
    'form_id', r.form_id,
    'guest_first_name', v_name,
    'visit_type', v_type,
    'visit_date', v_date,
    'completed', coalesce(v_status = 'completed', false),
    'answers', v_answers
  );
end;
$$;

revoke execute on function public.feedback_session(text) from public;
grant execute on function public.feedback_session(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save (and optionally complete) the guest's answers.
--   p_answers: [{ "field_id": uuid, "value": any }]
-- Field ids are validated against the form (and the snapshot is built here, from
-- the field itself, never trusted from the client). Required fields are enforced
-- on completion. File-upload and section fields are rejected.
-- ---------------------------------------------------------------------------
create function public.feedback_save(p_token text, p_answers jsonb, p_complete boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_sub_id uuid;
  v_status text;
  elem jsonb;
  f record;
  v_value jsonb;
  v_missing text[];
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select * into r from private.feedback_resolve(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.form_submissions (form_id, submitter_token, status, visit_id, visit_guest_id, is_guest_feedback)
  values (r.form_id, 'vg:' || r.guest_id::text, 'in_progress', r.visit_id, r.guest_id, true)
  on conflict (form_id, submitter_token) do update set updated_at = now()
  returning id, status into v_sub_id, v_status;

  if v_status = 'completed' then
    return jsonb_build_object('ok', false, 'error', 'already_completed');
  end if;

  for elem in select * from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(elem) <> 'object' or (elem ->> 'field_id') is null
       or (elem ->> 'field_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_field');
    end if;

    select ff.id, ff.label, ff.type, ff.position into f
    from public.form_fields ff
    where ff.id = (elem ->> 'field_id')::uuid
      and ff.form_id = r.form_id
      and ff.deleted_at is null
      and ff.type not in ('section', 'file_upload');
    if not found then
      return jsonb_build_object('ok', false, 'error', 'invalid_field');
    end if;

    v_value := coalesce(elem -> 'value', 'null'::jsonb);
    if v_value = 'null'::jsonb or v_value = '""'::jsonb or v_value = '[]'::jsonb then
      delete from public.form_answers where submission_id = v_sub_id and field_id = f.id;
    else
      if pg_column_size(v_value) > 20000 then
        return jsonb_build_object('ok', false, 'error', 'invalid_request');
      end if;
      insert into public.form_answers (submission_id, field_id, value, field_snapshot)
      values (
        v_sub_id, f.id, v_value,
        jsonb_build_object('label', f.label, 'type', f.type, 'position', f.position)
      )
      on conflict (submission_id, field_id)
      do update set value = excluded.value, field_snapshot = excluded.field_snapshot, updated_at = now();
    end if;
  end loop;

  if p_complete then
    select array_agg(coalesce(nullif(ff.label, ''), 'Question') order by ff.position) into v_missing
    from public.form_fields ff
    where ff.form_id = r.form_id
      and ff.deleted_at is null
      and ff.required
      and ff.type not in ('section', 'file_upload')
      and not exists (
        select 1 from public.form_answers a where a.submission_id = v_sub_id and a.field_id = ff.id
      );
    if v_missing is not null then
      return jsonb_build_object('ok', false, 'error', 'missing_required', 'missing', to_jsonb(v_missing));
    end if;

    update public.form_submissions set status = 'completed', completed_at = now() where id = v_sub_id;
  end if;

  return jsonb_build_object('ok', true, 'completed', p_complete);
end;
$$;

revoke execute on function public.feedback_save(text, jsonb, boolean) from public;
grant execute on function public.feedback_save(text, jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lead sync: a guest-linked submission belongs to the guest's lead by
-- construction. It never uses the form's phone field (a guest could type
-- another number and alter someone else's lead), and only fills gaps in the
-- lead's name and attributes.
-- ---------------------------------------------------------------------------
create or replace function private.sync_lead_from_submission(p_submission_id uuid, p_overwrite boolean default true)
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
  select s.id, s.form_id, s.status, s.visit_guest_id, s.is_guest_feedback into sub
  from public.form_submissions s
  where s.id = p_submission_id;
  if not found or sub.status <> 'completed' then
    return null;
  end if;

  if sub.is_guest_feedback then
    select g.lead_id into v_lead_id from public.visit_guests g where g.id = sub.visit_guest_id;
    if v_lead_id is null then
      return null;
    end if;

    select * into mapping
    from public.form_lead_mappings m
    where m.form_id = sub.form_id and m.enabled;
    if not found then
      return v_lead_id;
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

    update public.leads
    set name = coalesce(public.leads.name, v_name),
        attributes = v_attrs || public.leads.attributes
    where id = v_lead_id;

    insert into public.lead_list_members (list_id, lead_id)
    select l.id, v_lead_id
    from public.lead_lists l
    where l.id = any (mapping.list_ids)
    on conflict do nothing;

    return v_lead_id;
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

-- ---------------------------------------------------------------------------
-- The agent also sees feedback the contact gave through a visit link (those
-- submissions have no phone answer, so they are matched through the guest).
-- ---------------------------------------------------------------------------
create or replace function public.agent_submissions_for_phone(p_phone text, p_limit integer default 20)
returns table (
  submission_id uuid,
  form_id uuid,
  form_title text,
  status public.submission_status,
  created_at timestamptz,
  completed_at timestamptz,
  answers jsonb
)
language sql
stable
set search_path = ''
as $$
  with matched as (
    select distinct fa.submission_id
    from public.form_answers fa
    where fa.field_snapshot ->> 'type' = 'phone'
      and public.normalize_phone(fa.value #>> '{}') = public.normalize_phone(p_phone)
    union
    select s.id
    from public.form_submissions s
    join public.visit_guests g on g.id = s.visit_guest_id
    join public.leads l on l.id = g.lead_id
    where s.is_guest_feedback
      and public.normalize_phone(p_phone) is not null
      and l.phone_normalized = public.normalize_phone(p_phone)
  )
  select
    s.id,
    s.form_id,
    f.title,
    s.status,
    s.created_at,
    s.completed_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', a.field_snapshot ->> 'label',
            'type',  a.field_snapshot ->> 'type',
            'value', a.value
          )
          order by (a.field_snapshot ->> 'position')::numeric
        )
        from public.form_answers a
        where a.submission_id = s.id
      ),
      '[]'::jsonb
    )
  from matched m
  join public.form_submissions s on s.id = m.submission_id
  join public.forms f on f.id = s.form_id
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
