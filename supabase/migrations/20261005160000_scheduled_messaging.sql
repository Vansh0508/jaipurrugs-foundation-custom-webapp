-- Phase 11 / M6: scheduled WhatsApp messaging for visit guests.
--
--   message_rule_sets / _items   reusable "after-visit sequence" templates
--   visit_message_rules          the rules that apply to ONE visit (copied from a set)
--   scheduled_whatsapp_sends     one row per (rule, guest): the queue
--
-- Rows are computed by private.materialize_visit_sends(), called from triggers
-- whenever a visit, its guests, its rules or a lead's opt-out change. A secret-
-- protected route (/api/cron/dispatch, called by pg_cron — M7) claims due rows
-- with public.claim_scheduled_sends() and sends them.
--
-- Nothing here relies on public.is_active_team_member(): it is false under the
-- service role and under pg_cron, which is who runs the dispatcher.
-- See docs/phases/11-visit-operations.md.

-- ---------------------------------------------------------------------------
-- Messages the system sends on its own show up in the inbox as 'system'.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_messages drop constraint whatsapp_messages_sender_type_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_sender_type_check
  check (sender_type in ('contact', 'agent', 'staff', 'external', 'system'));

-- ---------------------------------------------------------------------------
-- Reusable rule sets
-- ---------------------------------------------------------------------------
create table public.message_rule_sets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  -- When set, new visits of this type (case-insensitive) get this set automatically.
  visit_type  text,
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index message_rule_sets_name_key on public.message_rule_sets (lower(trim(name)));

create trigger trg_message_rule_sets_set_updated_at
before update on public.message_rule_sets
for each row execute procedure public.set_updated_at();

alter table public.message_rule_sets enable row level security;

create policy "active_members_all_message_rule_sets"
on public.message_rule_sets for all to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

create table public.message_rule_set_items (
  id               uuid primary key default gen_random_uuid(),
  rule_set_id      uuid not null references public.message_rule_sets (id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  -- on_complete: after the visit is marked completed. before_start / after_start: relative to the start time.
  anchor           text not null check (anchor in ('on_complete', 'before_start', 'after_start')),
  -- Always a magnitude; the direction comes from the anchor. Up to 30 days.
  offset_minutes   integer not null default 0 check (offset_minutes between 0 and 43200),
  template_name    text not null check (length(trim(template_name)) > 0),
  template_language text not null default 'en',
  enabled          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index message_rule_set_items_set_idx on public.message_rule_set_items (rule_set_id);

create trigger trg_message_rule_set_items_set_updated_at
before update on public.message_rule_set_items
for each row execute procedure public.set_updated_at();

alter table public.message_rule_set_items enable row level security;

create policy "active_members_all_message_rule_set_items"
on public.message_rule_set_items for all to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- The rules on one visit (copied from a set, then editable per visit; editing a
-- set later never silently changes sends that are already scheduled).
-- ---------------------------------------------------------------------------
create table public.visit_message_rules (
  id                uuid primary key default gen_random_uuid(),
  visit_id          uuid not null references public.visits (id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  anchor            text not null check (anchor in ('on_complete', 'before_start', 'after_start')),
  offset_minutes    integer not null default 0 check (offset_minutes between 0 and 43200),
  template_name     text not null check (length(trim(template_name)) > 0),
  template_language text not null default 'en',
  enabled           boolean not null default true,
  source_item_id    uuid references public.message_rule_set_items (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index visit_message_rules_visit_idx on public.visit_message_rules (visit_id);

create trigger trg_visit_message_rules_set_updated_at
before update on public.visit_message_rules
for each row execute procedure public.set_updated_at();

alter table public.visit_message_rules enable row level security;

create policy "active_members_all_visit_message_rules"
on public.visit_message_rules for all to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------
create table public.scheduled_whatsapp_sends (
  id                    uuid primary key default gen_random_uuid(),
  rule_id               uuid not null references public.visit_message_rules (id) on delete cascade,
  visit_id              uuid not null references public.visits (id) on delete cascade,
  visit_guest_id        uuid not null references public.visit_guests (id) on delete cascade,
  run_at                timestamptz not null,
  -- Not sent by this time = dropped, so a late "mark complete" can't flood guests.
  expires_at            timestamptz,
  -- queued -> processing -> sent | failed | unknown. dry_run: recorded but never sent
  -- (visit_settings.dry_run). cancelled / skipped rows are recomputed by the materializer.
  status                text not null default 'queued'
                        check (status in ('queued', 'processing', 'sent', 'failed', 'cancelled', 'skipped', 'unknown', 'dry_run')),
  attempts              integer not null default 0,
  claimed_at            timestamptz,
  -- Set just before calling WhatsApp. A row stuck 'processing' WITH this set may already
  -- have been delivered, so it is reconciled, never blindly retried.
  send_started_at       timestamptz,
  last_error            text,
  error_class           text check (error_class in ('definite', 'ambiguous', 'rate_limited')),
  platform_message_id   text,
  zernio_conversation_id text,
  -- What was actually sent (template variable values), written after the send.
  params_sent           jsonb,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (rule_id, visit_guest_id)
);

create index scheduled_whatsapp_sends_due_idx on public.scheduled_whatsapp_sends (run_at) where status = 'queued';
create index scheduled_whatsapp_sends_visit_idx on public.scheduled_whatsapp_sends (visit_id);
create index scheduled_whatsapp_sends_guest_idx on public.scheduled_whatsapp_sends (visit_guest_id);

create trigger trg_scheduled_whatsapp_sends_set_updated_at
before update on public.scheduled_whatsapp_sends
for each row execute procedure public.set_updated_at();

alter table public.scheduled_whatsapp_sends enable row level security;

create policy "active_members_all_scheduled_whatsapp_sends"
on public.scheduled_whatsapp_sends for all to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Quiet hours (IST). Returns p_ts unchanged outside the window, otherwise the
-- next instant the window ends. The window may cross midnight (23:00-08:00).
-- ---------------------------------------------------------------------------
create function private.next_send_time(p_ts timestamptz, p_start time, p_end time)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Kolkata';
  l timestamp := p_ts at time zone tz;
  t time := l::time;
  d date := l::date;
begin
  if p_start = p_end then
    return p_ts;
  end if;
  if p_start < p_end then
    if t >= p_start and t < p_end then
      return (d + p_end) at time zone tz;
    end if;
  else
    if t >= p_start then
      return ((d + 1) + p_end) at time zone tz;
    end if;
    if t < p_end then
      return (d + p_end) at time zone tz;
    end if;
  end if;
  return p_ts;
end;
$$;

revoke all on function private.next_send_time(timestamptz, time, time) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Materializer: makes the queue match the visit's rules and guests.
-- Idempotent. Only queued / cancelled / skipped rows are ever touched, so a send
-- that is in flight, delivered or of unknown outcome is never duplicated.
-- ---------------------------------------------------------------------------
create function private.materialize_visit_sends(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.visits%rowtype;
  st public.visit_settings%rowtype;
  r record;
  g record;
  v_run timestamptz;
  v_exp timestamptz;
  v_status text;
  v_err text;
begin
  select * into v from public.visits where id = p_visit_id;
  if not found then
    return;
  end if;
  select * into st from public.visit_settings where id;

  if v.status = 'cancelled' then
    update public.scheduled_whatsapp_sends
    set status = 'cancelled', last_error = 'visit cancelled', claimed_at = null
    where visit_id = p_visit_id and status = 'queued';
    return;
  end if;

  -- Anything still waiting is recomputed below; whatever is no longer wanted stays cancelled.
  update public.scheduled_whatsapp_sends
  set status = 'cancelled', last_error = 'recomputed', claimed_at = null
  where visit_id = p_visit_id and status = 'queued';

  for r in
    select * from public.visit_message_rules where visit_id = p_visit_id and enabled
  loop
    if r.anchor = 'on_complete' then
      if v.status <> 'completed' or v.completed_at is null then
        continue;
      end if;
      v_run := v.completed_at + make_interval(mins => r.offset_minutes);
    elsif r.anchor = 'before_start' then
      if v.start_at is null then
        continue;
      end if;
      v_run := v.start_at - make_interval(mins => r.offset_minutes);
    else
      if v.start_at is null then
        continue;
      end if;
      v_run := v.start_at + make_interval(mins => r.offset_minutes);
    end if;

    v_exp := case
      when r.anchor = 'before_start' then v.start_at
      else v_run + make_interval(days => st.expiry_days)
    end;

    v_status := 'queued';
    v_err := null;
    -- A reminder whose time has already passed is not sent late.
    if r.anchor = 'before_start' and v_run < now() - interval '2 minutes' then
      v_status := 'skipped';
      v_err := 'missed_window';
    end if;

    for g in
      select vg.id
      from public.visit_guests vg
      join public.leads l on l.id = vg.lead_id
      where vg.visit_id = p_visit_id
        and vg.status <> 'no_show'
        and not l.whatsapp_opt_out
    loop
      insert into public.scheduled_whatsapp_sends (rule_id, visit_id, visit_guest_id, run_at, expires_at, status, last_error)
      values (r.id, p_visit_id, g.id, v_run, v_exp, v_status, v_err)
      on conflict (rule_id, visit_guest_id) do update
        set run_at = excluded.run_at,
            expires_at = excluded.expires_at,
            status = excluded.status,
            last_error = excluded.last_error,
            attempts = 0,
            claimed_at = null,
            send_started_at = null
        where public.scheduled_whatsapp_sends.status in ('queued', 'cancelled', 'skipped');
    end loop;
  end loop;
end;
$$;

revoke all on function private.materialize_visit_sends(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers. A failure here must never block saving a visit, a guest or a rule.
-- ---------------------------------------------------------------------------
create function private.trg_materialize_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.materialize_visit_sends(new.id);
  exception when others then
    raise warning 'materialize_visit_sends failed for visit %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create function private.trg_materialize_visit_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit uuid := coalesce(new.visit_id, old.visit_id);
begin
  begin
    perform private.materialize_visit_sends(v_visit);
  exception when others then
    raise warning 'materialize_visit_sends failed for visit %: %', v_visit, sqlerrm;
  end;
  return null;
end;
$$;

create function private.trg_materialize_lead_optout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit uuid;
begin
  begin
    for v_visit in select distinct vg.visit_id from public.visit_guests vg where vg.lead_id = new.id loop
      perform private.materialize_visit_sends(v_visit);
    end loop;
  exception when others then
    raise warning 'materialize_visit_sends failed for lead %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.trg_materialize_visit() from public, anon, authenticated;
revoke all on function private.trg_materialize_visit_child() from public, anon, authenticated;
revoke all on function private.trg_materialize_lead_optout() from public, anon, authenticated;

create trigger trg_visits_materialize
after update of visit_date, start_time, end_time, status, completed_at, start_at, end_at on public.visits
for each row execute procedure private.trg_materialize_visit();

create trigger trg_visit_guests_materialize
after insert or delete or update of status on public.visit_guests
for each row execute procedure private.trg_materialize_visit_child();

create trigger trg_visit_message_rules_materialize
after insert or delete or update on public.visit_message_rules
for each row execute procedure private.trg_materialize_visit_child();

create trigger trg_leads_materialize_optout
after update of whatsapp_opt_out on public.leads
for each row
when (old.whatsapp_opt_out is distinct from new.whatsapp_opt_out)
execute procedure private.trg_materialize_lead_optout();

-- ---------------------------------------------------------------------------
-- Claim due sends (service role only). SECURITY DEFINER so it can use the
-- private helpers; execute is granted to service_role alone.
--   1. requeue rows that were claimed but never reached WhatsApp
--   2. rows that DID reach WhatsApp but never reported back: reconcile against the
--      inbox (the webhook echo records the message even if our write failed), else
--      park as 'unknown' for a person to decide — never retried automatically
--   3. drop rows past their expiry
--   4. inside quiet hours, push due rows to the end of the window
--   5. claim up to p_limit rows with FOR UPDATE SKIP LOCKED
-- ---------------------------------------------------------------------------
create function public.claim_scheduled_sends(p_limit integer default 20)
returns setof public.scheduled_whatsapp_sends
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.visit_settings%rowtype;
  v_next timestamptz;
begin
  select * into st from public.visit_settings where id;

  update public.scheduled_whatsapp_sends
  set status = 'queued', claimed_at = null
  where status = 'processing' and send_started_at is null and claimed_at < now() - interval '10 minutes';

  update public.scheduled_whatsapp_sends s
  set status = case
        when exists (
          select 1
          from public.visit_guests vg
          join public.whatsapp_conversations c on c.lead_id = vg.lead_id
          join public.whatsapp_messages m on m.conversation_id = c.id
          join public.visit_message_rules r on r.id = s.rule_id
          where vg.id = s.visit_guest_id
            and m.direction = 'outbound'
            and m.kind = 'template'
            and m.template_name = r.template_name
            and m.sent_at >= s.send_started_at - interval '2 minutes'
        ) then 'sent' else 'unknown' end,
      last_error = case
        when exists (
          select 1
          from public.visit_guests vg
          join public.whatsapp_conversations c on c.lead_id = vg.lead_id
          join public.whatsapp_messages m on m.conversation_id = c.id
          join public.visit_message_rules r on r.id = s.rule_id
          where vg.id = s.visit_guest_id
            and m.direction = 'outbound'
            and m.kind = 'template'
            and m.template_name = r.template_name
            and m.sent_at >= s.send_started_at - interval '2 minutes'
        ) then 'reconciled from the inbox' else 'outcome unknown: needs a person to check' end,
      error_class = 'ambiguous',
      sent_at = case when s.sent_at is null then now() else s.sent_at end
  where s.status = 'processing' and s.send_started_at < now() - interval '10 minutes';

  update public.scheduled_whatsapp_sends
  set status = 'skipped', last_error = 'expired'
  where status = 'queued' and expires_at is not null and expires_at < now();

  v_next := private.next_send_time(now(), st.quiet_start, st.quiet_end);
  if v_next > now() then
    update public.scheduled_whatsapp_sends
    set status = 'skipped', last_error = 'expired during quiet hours'
    where status = 'queued' and run_at <= now() and expires_at is not null and expires_at < v_next;

    update public.scheduled_whatsapp_sends
    set run_at = v_next
    where status = 'queued' and run_at <= now();

    return;
  end if;

  return query
  update public.scheduled_whatsapp_sends s
  set status = 'processing', claimed_at = now(), attempts = s.attempts + 1
  where s.id in (
    select q.id
    from public.scheduled_whatsapp_sends q
    where q.status = 'queued' and q.run_at <= now()
    order by q.run_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  returning s.*;
end;
$$;

revoke all on function public.claim_scheduled_sends(integer) from public, anon, authenticated;
grant execute on function public.claim_scheduled_sends(integer) to service_role;
