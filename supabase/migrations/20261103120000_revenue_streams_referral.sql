-- Revenue streams per visit, category-wise dashboard numbers, and a referral
-- message that goes to a visit's primary POC.
--
-- * Rural Experience revenue stays on the visit (amount_charged); it gains an
--   invoice id. JR sales and JR Farms sales attributed to a visit live in
--   visit_sales, one row per invoice, so a visit can carry several.
-- * dashboard_revenue_stats() reports the three streams and a per-visitor-category
--   breakdown (bookings, revenue, artisan payments) with the same filters as
--   dashboard_stats().
-- * Message rules gain `recipients` ('all' guests | 'primary' POC only) so a
--   message can go to the primary guest alone. A "referral request" sequence is
--   seeded: 15 days after the visit is marked completed, to the primary POC.

-- ---------------------------------------------------------------------------
-- Revenue
-- ---------------------------------------------------------------------------
alter table public.visits add column invoice_id text;

create table public.visit_sales (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visits (id) on delete cascade,
  -- Sales of rugs through JR, or of produce through JR Farms, attributed to this visit.
  channel     text not null check (channel in ('jr_sales', 'jr_farms')),
  invoice_id  text not null check (length(trim(invoice_id)) > 0),
  amount      numeric(12, 2) not null check (amount >= 0),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- An invoice is attributed to one visit only, so it can't be counted twice.
  unique (channel, invoice_id)
);

create index visit_sales_visit_idx on public.visit_sales (visit_id);

create trigger trg_visit_sales_set_updated_at
before update on public.visit_sales
for each row execute procedure public.set_updated_at();

alter table public.visit_sales enable row level security;

create policy "active_members_all_visit_sales"
on public.visit_sales for all to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Dashboard: revenue streams + visitor-category breakdown
-- ---------------------------------------------------------------------------
create function public.dashboard_revenue_stats(
  p_from date,
  p_to date,
  p_program text default 'rural_experience',
  p_visitor_category text default null,
  p_booking_channel text default null,
  p_village_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 366 * 6 then
    raise exception 'Date range too large' using errcode = '22023';
  end if;

  with
  counted as (
    select v.id, v.headcount, v.visitor_category, v.amount_charged, v.amount_to_artisans, v.invoice_id
    from public.visits v
    where v.status = 'completed'
      and v.visit_date between p_from and p_to
      and (p_program is null or p_program = 'all' or v.program_category = p_program)
      and (p_visitor_category is null or v.visitor_category = p_visitor_category)
      and (p_booking_channel is null or v.booking_channel = p_booking_channel)
      and (p_village_id is null or exists (
        select 1 from public.visit_villages vv where vv.visit_id = v.id and vv.village_id = p_village_id))
  ),
  sales as (
    select s.visit_id, s.channel, s.amount
    from public.visit_sales s
    join counted c on c.id = s.visit_id
  ),
  sales_by_visit as (
    select visit_id,
           coalesce(sum(amount) filter (where channel = 'jr_sales'), 0) as jr_sales,
           coalesce(sum(amount) filter (where channel = 'jr_farms'), 0) as jr_farms
    from sales
    group by visit_id
  )
  select jsonb_build_object(
    'streams', jsonb_build_object(
      'rural_experience', jsonb_build_object(
        'amount', (select coalesce(sum(amount_charged), 0) from counted),
        'invoices', (select count(*) from counted where nullif(trim(invoice_id), '') is not null),
        'visits', (select count(*) from counted where coalesce(amount_charged, 0) > 0)
      ),
      'jr_sales', jsonb_build_object(
        'amount', (select coalesce(sum(amount), 0) from sales where channel = 'jr_sales'),
        'invoices', (select count(*) from sales where channel = 'jr_sales'),
        'visits', (select count(distinct visit_id) from sales where channel = 'jr_sales')
      ),
      'jr_farms', jsonb_build_object(
        'amount', (select coalesce(sum(amount), 0) from sales where channel = 'jr_farms'),
        'invoices', (select count(*) from sales where channel = 'jr_farms'),
        'visits', (select count(distinct visit_id) from sales where channel = 'jr_farms')
      )
    ),
    'by_category', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'category', category,
                 'bookings', bookings,
                 'visitors', visitors,
                 'revenue', revenue,
                 'jr_sales', jr_sales,
                 'jr_farms', jr_farms,
                 'artisan_payments', artisan_payments
               )
               order by bookings desc, revenue desc, category)
      from (
        select coalesce(c.visitor_category, 'unspecified') as category,
               count(*) as bookings,
               coalesce(sum(c.headcount), 0) as visitors,
               coalesce(sum(c.amount_charged), 0) as revenue,
               coalesce(sum(sv.jr_sales), 0) as jr_sales,
               coalesce(sum(sv.jr_farms), 0) as jr_farms,
               coalesce(sum(c.amount_to_artisans), 0) as artisan_payments
        from counted c
        left join sales_by_visit sv on sv.visit_id = c.id
        group by coalesce(c.visitor_category, 'unspecified')
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_revenue_stats(date, date, text, text, text, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Message recipients
-- ---------------------------------------------------------------------------
alter table public.message_rule_set_items
  add column recipients text not null default 'all' check (recipients in ('all', 'primary'));
alter table public.visit_message_rules
  add column recipients text not null default 'all' check (recipients in ('all', 'primary'));

-- Same as before, plus the recipients filter.
create or replace function private.materialize_visit_sends(p_visit_id uuid)
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
        and (r.recipients = 'all' or vg.is_primary)
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

-- Changing who the primary POC is changes who a primary-only message goes to.
drop trigger trg_visit_guests_materialize on public.visit_guests;
create trigger trg_visit_guests_materialize
after insert or delete or update of status, is_primary on public.visit_guests
for each row execute procedure private.trg_materialize_visit_child();

-- ---------------------------------------------------------------------------
-- The referral sequence. Its message is switched off until a WhatsApp template is
-- chosen for it (Messaging > Sequences): applying a sequence copies only enabled
-- messages, and a message pointing at a template that isn't approved can't send.
-- It applies to new Rural Experience visits only; existing visits are untouched.
-- ---------------------------------------------------------------------------
with s as (
  insert into public.message_rule_sets (name, description, visit_type)
  values (
    'Rural Experience — referral request',
    'Asks the visit''s primary POC for a referral 15 days after the visit is marked completed.',
    'Rural Experience'
  )
  on conflict do nothing
  returning id
)
insert into public.message_rule_set_items (rule_set_id, name, anchor, offset_minutes, template_name, template_language, enabled, recipients)
select id, 'Referral request', 'on_complete', 15 * 1440, 'referral_request', 'en', false, 'primary'
from s;
