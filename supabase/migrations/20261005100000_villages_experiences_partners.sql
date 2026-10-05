-- Phase 11 / M1: reference data for the visit-operations module — villages,
-- the experiences offered in each village, and partners. Everything the visits
-- tables (M2) and the WhatsApp agent (M3) point at. See docs/phases/11-visit-operations.md
-- and AGENTS.md §5-§7. Admin-only: no anon access to any of these tables.

-- ---------------------------------------------------------------------------
-- Villages (deactivate instead of delete so past visits keep their history)
-- ---------------------------------------------------------------------------
create table public.villages (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (length(trim(name)) > 0),
  region                    text,
  -- Craft / region / partner type feed the "innovation" (replicability) metric
  -- on the dashboard: different crafts, regions and partner types are a
  -- stronger scaling claim than identical replication.
  craft_type                text,
  partner_type              text,
  total_households          integer check (total_households is null or total_households >= 0),
  artisan_families_engaged  integer check (artisan_families_engaged is null or artisan_families_engaged >= 0),
  women_participants        integer check (women_participants is null or women_participants >= 0),
  active_since              date,
  is_active                 boolean not null default true,
  notes                     text,
  created_by                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create unique index villages_name_key on public.villages (lower(trim(name)));

create trigger trg_villages_set_updated_at
before update on public.villages
for each row
execute procedure public.set_updated_at();

alter table public.villages enable row level security;

create policy "active_members_all_villages"
on public.villages
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Experiences (activities offered in a village)
-- ---------------------------------------------------------------------------
create table public.experiences (
  id            uuid primary key default gen_random_uuid(),
  village_id    uuid not null references public.villages (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  description   text,
  -- Free-text grouping, e.g. "Craft & Making", "Food & Cooking".
  category      text,
  duration_min  integer check (duration_min is null or duration_min > 0),
  capacity      integer check (capacity is null or capacity > 0),
  -- Free-text seasonal note, e.g. "Paused in monsoon".
  seasonal      text,
  -- Highlighted first when the agent is asked what to do / what is popular.
  featured      boolean not null default false,
  is_active     boolean not null default true,
  -- Ordered steps: [{ "title": text, "minutes": int|null, "description": text|null }].
  -- Validated by zod in the app layer (src/lib/visits/schemas.ts).
  itinerary     jsonb not null default '[]'::jsonb check (jsonb_typeof(itinerary) = 'array'),
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index experiences_village_name_key on public.experiences (village_id, lower(trim(name)));
create index experiences_village_id_idx on public.experiences (village_id);

create trigger trg_experiences_set_updated_at
before update on public.experiences
for each row
execute procedure public.set_updated_at();

alter table public.experiences enable row level security;

create policy "active_members_all_experiences"
on public.experiences
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Partners (feeds the "collaboration" metric: which sectors are engaged)
-- ---------------------------------------------------------------------------
create table public.partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  sector        text not null check (sector in ('private', 'public', 'civil_society')),
  -- Free-text label, e.g. "Tour agency", "OTA", "Govt tourism board", "NGO".
  partner_type  text,
  is_active     boolean not null default true,
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index partners_name_key on public.partners (lower(trim(name)));
create index partners_sector_idx on public.partners (sector);

create trigger trg_partners_set_updated_at
before update on public.partners
for each row
execute procedure public.set_updated_at();

alter table public.partners enable row level security;

create policy "active_members_all_partners"
on public.partners
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );
