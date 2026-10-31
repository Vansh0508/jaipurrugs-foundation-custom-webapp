-- Primary POC per visit, and filters for the dashboard.
--
-- * A visit's primary POC is one of its guests (a lead, so it has a phone and an
--   optional email attribute). The Trips grid shows that person in place of the
--   guest count. At most one primary guest per visit.
-- * dashboard_stats / dashboard_feedback_stats take optional filters. The
--   defaults reproduce the previous behaviour (Rural Experience only); passing
--   p_program => 'all' counts every program. Every visit-derived number (operations,
--   reach, income, repeat guests, partner retention, satisfaction) follows the
--   filters; the village/partner state numbers do not.

-- ---------------------------------------------------------------------------
-- Primary guest
-- ---------------------------------------------------------------------------
alter table public.visit_guests
  add column is_primary boolean not null default false;

create unique index visit_guests_one_primary_idx on public.visit_guests (visit_id) where is_primary;

-- ---------------------------------------------------------------------------
-- dashboard_stats with filters
-- ---------------------------------------------------------------------------
drop function public.dashboard_stats(date, date);

create function public.dashboard_stats(
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
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 366 * 6 then
    raise exception 'Date range too large' using errcode = '22023';
  end if;

  with
  -- Every visit that matches the filters, regardless of status or date.
  scoped as (
    select v.*
    from public.visits v
    where (p_program is null or p_program = 'all' or v.program_category = p_program)
      and (p_visitor_category is null or v.visitor_category = p_visitor_category)
      and (p_booking_channel is null or v.booking_channel = p_booking_channel)
      and (p_village_id is null or exists (
        select 1 from public.visit_villages vv where vv.visit_id = v.id and vv.village_id = p_village_id))
  ),
  months as (
    select to_char(d, 'YYYY-MM') as month
    from generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') as d
  ),
  counted as (
    select s.id, s.visit_date, s.headcount, s.visitor_category, s.booking_channel,
           s.amount_charged, s.amount_to_artisans
    from scoped s
    where s.status = 'completed'
      and s.visit_date between p_from and p_to
  ),
  attendance as (
    select g.lead_id, count(distinct g.visit_id) as n
    from public.visit_guests g
    join scoped s on s.id = g.visit_id
    where s.status = 'completed' and g.status <> 'no_show'
    group by g.lead_id
  ),
  range_guests as (
    select distinct g.lead_id
    from public.visit_guests g
    join counted c on c.id = g.visit_id
    where g.status <> 'no_show'
  ),
  partner_use as (
    select s.partner_id, count(*) as n
    from scoped s
    where s.status = 'completed' and s.partner_id is not null
    group by s.partner_id
  ),
  active_villages as (
    select * from public.villages where is_active
  ),
  active_partners as (
    select * from public.partners where is_active
  ),
  monthly as (
    select m.month,
           count(c.id) as visits,
           coalesce(sum(c.headcount), 0) as visitors,
           coalesce(sum(c.amount_charged), 0) as income,
           coalesce(sum(c.amount_to_artisans), 0) as to_artisans
    from months m
    left join counted c on to_char(c.visit_date, 'YYYY-MM') = m.month
    group by m.month
  ),
  totals as (
    select count(*) as visits,
           coalesce(sum(headcount), 0) as visitors,
           coalesce(sum(amount_charged), 0) as income,
           coalesce(sum(amount_to_artisans), 0) as to_artisans
    from counted
  ),
  guest_split as (
    select (select count(*) from range_guests) as unique_guests,
           (select count(*) from range_guests rg join attendance a on a.lead_id = rg.lead_id where a.n = 1) as first_time,
           (select count(*) from range_guests rg join attendance a on a.lead_id = rg.lead_id where a.n > 1) as repeat
  ),
  village_totals as (
    select coalesce(sum(artisan_families_engaged), 0) as families,
           coalesce(sum(total_households), 0) as households,
           coalesce(sum(women_participants), 0) as women
    from active_villages
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'operations', jsonb_build_object(
      'upcoming_visits', (
        select count(*) from scoped
        where visit_date >= v_today and status in ('tentative', 'confirmed', 'booking_done')),
      'upcoming_guests', (
        select count(*) from public.visit_guests g
        join scoped s on s.id = g.visit_id
        where s.visit_date >= v_today and s.status in ('tentative', 'confirmed', 'booking_done')),
      'awaiting_completion', (
        select count(*) from scoped
        where status in ('confirmed', 'booking_done') and end_at is not null and end_at < now()),
      'completed_in_range', (
        select count(*) from scoped
        where status = 'completed' and visit_date between p_from and p_to),
      'cancelled_in_range', (
        select count(*) from scoped
        where status = 'cancelled' and visit_date between p_from and p_to)
    ),
    'reach', jsonb_build_object(
      'visits', (select visits from totals),
      'visitors', (select visitors from totals),
      'unique_guests', (select unique_guests from guest_split),
      'first_time_guests', (select first_time from guest_split),
      'repeat_guests', (select repeat from guest_split),
      'repeat_rate_pct', (
        select round(100.0 * repeat / nullif(unique_guests, 0), 1) from guest_split),
      'by_category', coalesce((
        select jsonb_agg(jsonb_build_object('label', visitor_category, 'value', n) order by n desc)
        from (select visitor_category, count(*) as n from counted where visitor_category is not null group by visitor_category) s
      ), '[]'::jsonb),
      -- Every booking channel is listed, even at zero, so a channel you hold an account on shows before its first booking.
      'by_channel', (
        select jsonb_agg(jsonb_build_object('label', ch.id, 'value', coalesce(s.n, 0)) order by ch.ord)
        from unnest(array['airbnb', 'tripadvisor', 'viator', 'direct', 'partner_agency']) with ordinality as ch(id, ord)
        left join (select booking_channel, count(*) as n from counted group by booking_channel) s on s.booking_channel = ch.id
      ),
      'by_village', coalesce((
        select jsonb_agg(jsonb_build_object('label', name, 'value', n) order by n desc, name)
        from (
          select vl.name, count(distinct c.id) as n
          from counted c
          join public.visit_villages vv on vv.visit_id = c.id
          join public.villages vl on vl.id = vv.village_id
          group by vl.name
          order by count(distinct c.id) desc, vl.name
          limit 10
        ) s
      ), '[]'::jsonb),
      'monthly', (
        select jsonb_agg(jsonb_build_object('month', month, 'visits', visits, 'visitors', visitors) order by month)
        from monthly)
    ),
    'economic', jsonb_build_object(
      'total_income', (select income from totals),
      'income_to_artisans', (select to_artisans from totals),
      'pct_to_artisans', (select round(100.0 * to_artisans / nullif(income, 0), 1) from totals),
      'income_per_family', (
        select round((select to_artisans from totals) / nullif((select families from village_totals), 0), 2)),
      'monthly', (
        select jsonb_agg(jsonb_build_object('month', month, 'income', income, 'to_artisans', to_artisans) order by month)
        from monthly)
    ),
    'participation', jsonb_build_object(
      'families_engaged', (select families from village_totals),
      'total_households', (select households from village_totals),
      'pct_households', (select round(100.0 * families / nullif(households, 0), 1) from village_totals),
      'women_participants', (select women from village_totals),
      'active_villages', (select count(*) from active_villages)
    ),
    'quality', jsonb_build_object(
      'repeat_rate_pct', (select round(100.0 * repeat / nullif(unique_guests, 0), 1) from guest_split),
      'partners_used', (select count(*) from partner_use),
      'partners_retained', (select count(*) from partner_use where n >= 2),
      'partner_retention_pct', (
        select round(100.0 * count(*) filter (where n >= 2) / nullif(count(*), 0), 1) from partner_use)
    ),
    'collaboration', jsonb_build_object(
      'sectors_engaged', (select count(distinct sector) from active_partners),
      'total_partners', (select count(*) from active_partners),
      'by_sector', (
        select jsonb_agg(jsonb_build_object('label', sec.id, 'value', coalesce(s.n, 0)) order by sec.ord)
        from unnest(array['private', 'public', 'civil_society']) with ordinality as sec(id, ord)
        left join (select sector, count(*) as n from active_partners group by sector) s on s.sector = sec.id
      )
    ),
    'innovation', jsonb_build_object(
      'craft_types', (select count(distinct lower(trim(craft_type))) from active_villages where nullif(trim(craft_type), '') is not null),
      'regions', (select count(distinct lower(trim(region))) from active_villages where nullif(trim(region), '') is not null),
      'partner_types', (select count(distinct lower(trim(partner_type))) from active_villages where nullif(trim(partner_type), '') is not null),
      'timeline', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'village', name, 'active_since', active_since, 'craft', craft_type, 'region', region,
                 'partner_type', partner_type, 'cumulative', cum) order by active_since, name)
        from (
          select name, active_since, craft_type, region, partner_type,
                 row_number() over (order by active_since, name) as cum
          from active_villages
          where active_since is not null
        ) s
      ), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_stats(date, date, text, text, text, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- dashboard_feedback_stats with the same filters
-- ---------------------------------------------------------------------------
drop function public.dashboard_feedback_stats(date, date);

create function public.dashboard_feedback_stats(
  p_from date,
  p_to date,
  p_program text default 'rural_experience',
  p_visitor_category text default null,
  p_booking_channel text default null,
  p_village_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with rated as (
    select s.id,
           avg(
             (a.value #>> '{}')::numeric
             / nullif(coalesce(nullif(ff.config ->> 'max', '')::numeric, 5), 0) * 5
           ) as score
    from public.form_submissions s
    join public.visits v on v.id = s.visit_id
    join public.form_answers a on a.submission_id = s.id
    join public.form_fields ff on ff.id = a.field_id
    where s.is_guest_feedback
      and s.status = 'completed'
      and (p_program is null or p_program = 'all' or v.program_category = p_program)
      and (p_visitor_category is null or v.visitor_category = p_visitor_category)
      and (p_booking_channel is null or v.booking_channel = p_booking_channel)
      and (p_village_id is null or exists (
        select 1 from public.visit_villages vv where vv.visit_id = v.id and vv.village_id = p_village_id))
      and v.status = 'completed'
      and v.visit_date between p_from and p_to
      and ff.type = 'rating'
      and jsonb_typeof(a.value) = 'number'
    group by s.id
  )
  select jsonb_build_object(
    'avg_rating', (select round(avg(score)::numeric, 2) from rated),
    'feedback_count', (select count(*) from rated)
  );
$$;

revoke execute on function public.dashboard_feedback_stats(date, date, text, text, text, uuid) from public, anon;
