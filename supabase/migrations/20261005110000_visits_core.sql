-- Phase 11 / M2: visits, the villages/experiences/guests attached to them, and
-- the settings that drive scheduled messaging later (M6). See
-- docs/phases/11-visit-operations.md and AGENTS.md §5-§7.
--
-- Guests are leads: a guest is a row in visit_guests pointing at public.leads
-- (phone-keyed), with email and other details held in the custom lead
-- attributes. There are no guest logins or visitor accounts — the WhatsApp
-- agent is the guest-facing surface.

-- ---------------------------------------------------------------------------
-- Opt-out: required before any bulk/scheduled template is sent (honoured by
-- the scheduler in M6).
-- ---------------------------------------------------------------------------
alter table public.leads
  add column whatsapp_opt_out boolean not null default false;

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------
create table public.visits (
  id                 uuid primary key default gen_random_uuid(),
  -- Free text on purpose: the real historical values are too varied to enum.
  visit_type         text not null default 'Field visit' check (length(trim(visit_type)) > 0),
  -- Local (Asia/Kolkata) wall-clock values entered by staff...
  visit_date         date,
  start_time         time,
  end_time           time,
  -- ...and the absolute instants derived from them by the trigger below.
  start_at           timestamptz,
  end_at             timestamptz,
  status             text not null default 'tentative'
                     check (status in ('tentative', 'confirmed', 'booking_done', 'completed', 'cancelled')),
  poc_name           text,
  poc_phone          text,
  facilitator        text,
  partner_id         uuid references public.partners (id) on delete set null,
  -- Group size as booked. Not the same as the number of guests added with a phone.
  headcount          integer check (headcount is null or headcount >= 0),
  visitor_group      text,
  source             text,
  origin_place       text,
  -- Only 'rural_experience' visits feed the impact numbers on the dashboard.
  program_category   text not null default 'other' check (program_category in ('rural_experience', 'other')),
  visitor_category   text check (visitor_category in ('individual', 'group', 'corporate', 'student', 'tour_agency')),
  booking_channel    text check (booking_channel in ('airbnb', 'tripadvisor', 'viator', 'direct', 'partner_agency')),
  amount_charged     numeric(12, 2) check (amount_charged is null or amount_charged >= 0),
  amount_to_artisans numeric(12, 2) check (amount_to_artisans is null or amount_to_artisans >= 0),
  notes              text,
  completed_at       timestamptz,
  -- 'staff:<email>' or 'auto' (the auto-complete fallback in M7).
  completed_by       text,
  -- The feedback form sent to guests after the visit (wired up in M5).
  feedback_form_id   uuid references public.forms (id) on delete set null,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index visits_visit_date_idx on public.visits (visit_date);
create index visits_status_idx on public.visits (status);
create index visits_end_at_idx on public.visits (end_at) where status in ('confirmed', 'booking_done');

-- Derives start_at/end_at (a trigger, not a generated column: `timestamp AT TIME
-- ZONE <name>` is only STABLE) and keeps completed_at in step with status.
create function public.visits_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Kolkata';
begin
  if new.visit_date is null then
    new.start_at := null;
    new.end_at := null;
  else
    new.start_at := (new.visit_date + coalesce(new.start_time, time '09:00')) at time zone tz;
    if new.end_time is null then
      -- No end time recorded: the visit runs to the end of that day.
      new.end_at := (new.visit_date + time '23:59') at time zone tz;
    elsif new.start_time is not null and new.end_time < new.start_time then
      -- Ends after midnight.
      new.end_at := ((new.visit_date + 1) + new.end_time) at time zone tz;
    else
      new.end_at := (new.visit_date + new.end_time) at time zone tz;
    end if;
  end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

create trigger trg_visits_before_write
before insert or update of visit_date, start_time, end_time, status on public.visits
for each row
execute procedure public.visits_before_write();

create trigger trg_visits_set_updated_at
before update on public.visits
for each row
execute procedure public.set_updated_at();

alter table public.visits enable row level security;

create policy "active_members_all_visits"
on public.visits
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Which villages / experiences a visit covers. Real rows instead of a text
-- array, so a typo can't silently hide an itinerary, and the agent can name
-- exactly what a guest will do. Restricting deletes keeps history intact
-- (deactivate a village or experience instead).
-- ---------------------------------------------------------------------------
create table public.visit_villages (
  visit_id   uuid not null references public.visits (id) on delete cascade,
  village_id uuid not null references public.villages (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (visit_id, village_id)
);

create index visit_villages_village_id_idx on public.visit_villages (village_id);

alter table public.visit_villages enable row level security;

create policy "active_members_all_visit_villages"
on public.visit_villages
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

create table public.visit_experiences (
  visit_id      uuid not null references public.visits (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete restrict,
  created_at    timestamptz not null default now(),
  primary key (visit_id, experience_id)
);

create index visit_experiences_experience_id_idx on public.visit_experiences (experience_id);

alter table public.visit_experiences enable row level security;

create policy "active_members_all_visit_experiences"
on public.visit_experiences
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Guests on a visit (leads). The visit <-> WhatsApp chat link is
-- visit_guests.lead_id = whatsapp_conversations.lead_id.
-- ---------------------------------------------------------------------------
create table public.visit_guests (
  id             uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references public.visits (id) on delete cascade,
  lead_id        uuid not null references public.leads (id) on delete cascade,
  -- Only 'attended' (and still-'invited') guests are messaged after the visit.
  status         text not null default 'invited' check (status in ('invited', 'attended', 'no_show')),
  -- Opaque per-guest token for the feedback link (M5). 144+ bits, unguessable.
  feedback_token text not null unique
                 default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 36),
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (visit_id, lead_id)
);

create index visit_guests_lead_id_idx on public.visit_guests (lead_id);

create trigger trg_visit_guests_set_updated_at
before update on public.visit_guests
for each row
execute procedure public.set_updated_at();

alter table public.visit_guests enable row level security;

create policy "active_members_all_visit_guests"
on public.visit_guests
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Settings (single row, like inbox_settings). Defaults are the safe ones:
-- nothing is sent until staff switch sends on and dry run off.
-- ---------------------------------------------------------------------------
create table public.visit_settings (
  id                        boolean primary key default true check (id),
  -- Kill switch for every scheduled message.
  sends_enabled             boolean not null default false,
  -- While true the dispatcher records sends but never calls WhatsApp.
  dry_run                   boolean not null default true,
  -- A confirmed / booked visit nobody marked completed is auto-completed this
  -- many hours after it ends, so a thank-you is never silently skipped.
  auto_complete_after_hours integer not null default 6 check (auto_complete_after_hours between 0 and 168),
  -- Scheduled messages are not sent between quiet_start and quiet_end (IST);
  -- they wait until quiet_end instead.
  quiet_start               time not null default time '23:00',
  quiet_end                 time not null default time '08:00',
  -- A scheduled message not sent within this many days of its due time is dropped.
  expiry_days               integer not null default 7 check (expiry_days between 1 and 60),
  updated_by                text,
  updated_at                timestamptz not null default now()
);

insert into public.visit_settings (id) values (true);

create trigger trg_visit_settings_set_updated_at
before update on public.visit_settings
for each row
execute procedure public.set_updated_at();

alter table public.visit_settings enable row level security;

create policy "active_members_select_visit_settings"
on public.visit_settings
for select
to authenticated
using ( (select public.is_active_team_member()) );

create policy "active_members_update_visit_settings"
on public.visit_settings
for update
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );
