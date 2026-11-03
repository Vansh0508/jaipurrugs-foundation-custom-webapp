-- Facilitators: JRF's own staff who run visits, kept as a small directory
-- instead of typing a name and phone into every visit.
--
-- A visit points at a facilitator with facilitator_id. visits.poc_name /
-- poc_phone stay as a denormalised copy of the facilitator's name and phone,
-- maintained by the triggers below, because the WhatsApp agent RPCs, the
-- scheduler and the `visit:poc_name` template variable all read them.

create table public.facilitators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  email       text not null check (length(trim(email)) > 0),
  phone       text not null check (length(trim(phone)) > 0),
  is_active   boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index facilitators_email_key on public.facilitators (lower(trim(email)));

create trigger trg_facilitators_set_updated_at
before update on public.facilitators
for each row
execute procedure public.set_updated_at();

alter table public.facilitators enable row level security;

create policy "active_members_all_facilitators"
on public.facilitators
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Visits -> facilitator. RESTRICT: a facilitator with visits is deactivated,
-- never deleted, so history keeps pointing at a real person.
-- ---------------------------------------------------------------------------
alter table public.visits
  add column facilitator_id uuid references public.facilitators (id) on delete restrict;

create index visits_facilitator_id_idx on public.visits (facilitator_id) where facilitator_id is not null;

-- Copies the chosen facilitator's name and phone onto the visit. Visits that
-- predate facilitators (no facilitator_id, hand-typed poc_name/poc_phone) are
-- left as they are until someone picks a facilitator for them.
create function public.visits_sync_facilitator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.facilitator_id is not null then
    select f.name, f.phone into new.poc_name, new.poc_phone
    from public.facilitators f
    where f.id = new.facilitator_id;
  elsif tg_op = 'UPDATE' and old.facilitator_id is not null then
    -- The facilitator was removed from the visit.
    new.poc_name := null;
    new.poc_phone := null;
  end if;
  return new;
end;
$$;

create trigger trg_visits_sync_facilitator
before insert or update of facilitator_id on public.visits
for each row
execute procedure public.visits_sync_facilitator();

-- Editing a facilitator's name or phone updates the copy on their visits.
create function public.facilitators_sync_visits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.visits
  set poc_name = new.name, poc_phone = new.phone
  where facilitator_id = new.id;
  return new;
end;
$$;

create trigger trg_facilitators_sync_visits
after update of name, phone on public.facilitators
for each row
when (old.name is distinct from new.name or old.phone is distinct from new.phone)
execute procedure public.facilitators_sync_visits();
