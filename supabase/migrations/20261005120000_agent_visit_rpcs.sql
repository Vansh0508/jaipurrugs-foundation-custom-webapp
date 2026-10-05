-- Phase 11 / M3: phone-scoped, read-only visit lookups for the WhatsApp agent.
-- Same pattern as public.agent_submissions_for_phone (phase 8): the agent tool
-- passes the conversation's phone from its server-side closure, the match is
-- done in SQL on normalize_phone(), and the model never supplies an identity.
--
-- Column allowlist — what a guest may be told about their own visit. Never
-- returned: amounts, internal notes, booking channel, partner, headcount,
-- other guests, or anything about another person's visit.

-- ---------------------------------------------------------------------------
-- The contact's visits. p_scope: 'upcoming' | 'past' | 'all'.
-- ---------------------------------------------------------------------------
create function public.agent_visits_for_phone(
  p_phone text,
  p_scope text default 'all',
  p_limit integer default 10
)
returns table (
  visit_id         uuid,
  visit_type       text,
  visit_date       date,
  start_time       time,
  end_time         time,
  status           text,
  guest_status     text,
  poc_name         text,
  poc_phone        text,
  facilitator      text,
  village_names    text[],
  experience_names text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.id,
    v.visit_type,
    v.visit_date,
    v.start_time,
    v.end_time,
    v.status,
    g.status,
    v.poc_name,
    v.poc_phone,
    v.facilitator,
    coalesce(
      (select array_agg(vl.name order by vl.name)
         from public.visit_villages vv
         join public.villages vl on vl.id = vv.village_id
        where vv.visit_id = v.id),
      '{}'::text[]
    ),
    coalesce(
      (select array_agg(e.name order by e.name)
         from public.visit_experiences ve
         join public.experiences e on e.id = ve.experience_id
        where ve.visit_id = v.id),
      '{}'::text[]
    )
  from public.leads l
  join public.visit_guests g on g.lead_id = l.id
  join public.visits v on v.id = g.visit_id
  where public.normalize_phone(p_phone) is not null
    and l.phone_normalized = public.normalize_phone(p_phone)
    and (
      p_scope not in ('upcoming', 'past')
      or (
        p_scope = 'upcoming'
        and v.status in ('tentative', 'confirmed', 'booking_done')
        and (v.end_at is null or v.end_at >= now())
      )
      or (
        p_scope = 'past'
        and v.status <> 'cancelled'
        and (v.status = 'completed' or (v.end_at is not null and v.end_at < now()))
      )
    )
  order by
    case when p_scope = 'upcoming' then extract(epoch from v.start_at) else -extract(epoch from v.start_at) end
    nulls last
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

revoke execute on function public.agent_visits_for_phone(text, text, integer) from public, anon;

-- ---------------------------------------------------------------------------
-- One of the contact's visits in full: villages, experiences and itinerary.
-- Returns null unless the contact is a guest on that visit, so the model can't
-- read an arbitrary visit id.
-- ---------------------------------------------------------------------------
create function public.agent_visit_itinerary_for_phone(p_phone text, p_visit_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'visitType', v.visit_type,
    'date', v.visit_date,
    'startTime', v.start_time,
    'endTime', v.end_time,
    'status', v.status,
    'coordinator', v.poc_name,
    'coordinatorPhone', v.poc_phone,
    'facilitator', v.facilitator,
    'villages', coalesce(
      (select jsonb_agg(jsonb_build_object('name', vl.name, 'region', vl.region) order by vl.name)
         from public.visit_villages vv
         join public.villages vl on vl.id = vv.village_id
        where vv.visit_id = v.id),
      '[]'::jsonb
    ),
    'experiences', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'name', e.name,
                  'description', e.description,
                  'durationMin', e.duration_min,
                  'seasonal', e.seasonal,
                  'village', vl.name,
                  'itinerary', e.itinerary
                )
                order by vl.name, e.name
              )
         from public.visit_experiences ve
         join public.experiences e on e.id = ve.experience_id
         join public.villages vl on vl.id = e.village_id
        where ve.visit_id = v.id),
      '[]'::jsonb
    )
  )
  from public.leads l
  join public.visit_guests g on g.lead_id = l.id
  join public.visits v on v.id = g.visit_id
  where public.normalize_phone(p_phone) is not null
    and l.phone_normalized = public.normalize_phone(p_phone)
    and v.id = p_visit_id
  limit 1;
$$;

revoke execute on function public.agent_visit_itinerary_for_phone(text, uuid) from public, anon;
