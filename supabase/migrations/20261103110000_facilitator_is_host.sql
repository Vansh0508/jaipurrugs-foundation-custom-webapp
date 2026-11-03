-- The facilitator and the host are the same person, so the facilitator's name is
-- also kept in visits.facilitator (the "host" the WhatsApp agent RPCs report).
-- Replaces the sync functions from 20261103100000_facilitators.sql.

create or replace function public.visits_sync_facilitator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.facilitator_id is not null then
    select f.name, f.phone, f.name into new.poc_name, new.poc_phone, new.facilitator
    from public.facilitators f
    where f.id = new.facilitator_id;
  elsif tg_op = 'UPDATE' and old.facilitator_id is not null then
    -- The facilitator was removed from the visit.
    new.poc_name := null;
    new.poc_phone := null;
    new.facilitator := null;
  end if;
  return new;
end;
$$;

create or replace function public.facilitators_sync_visits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.visits
  set poc_name = new.name, poc_phone = new.phone, facilitator = new.name
  where facilitator_id = new.id;
  return new;
end;
$$;
