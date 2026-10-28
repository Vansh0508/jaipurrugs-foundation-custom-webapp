-- Visit form refresh: programs replace free-text visit types in the form, more
-- visitor categories, multi-day visits (a date range), and the standard
-- locations seeded as villages. See src/components/admin/visits/visit-form-modal.tsx.

-- ---------------------------------------------------------------------------
-- Programs. 'other' is retired; no live rows used it, but map any that exist.
-- ---------------------------------------------------------------------------
alter table public.visits drop constraint visits_program_category_check;

update public.visits set program_category = 'village_field_visit' where program_category = 'other';

alter table public.visits
  alter column program_category set default 'rural_experience',
  add constraint visits_program_category_check
    check (program_category in ('rural_experience', 'industrial_visit', 'village_field_visit'));

-- ---------------------------------------------------------------------------
-- Visitor categories (the original five ids are kept as-is).
-- ---------------------------------------------------------------------------
alter table public.visits drop constraint visits_visitor_category_check;

alter table public.visits
  add constraint visits_visitor_category_check
    check (visitor_category in (
      'buyer', 'partner', 'collaborator', 'student', 'entrepreneur', 'designer', 'architect', 'tourist',
      'corporate', 'individual', 'group', 'tour_agency'
    ));

-- ---------------------------------------------------------------------------
-- Multi-day visits. end_date is null for a single-day visit.
-- ---------------------------------------------------------------------------
alter table public.visits
  add column end_date date,
  add constraint visits_end_date_check
    check (end_date is null or (visit_date is not null and end_date >= visit_date));

create or replace function public.visits_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Kolkata';
  last_day date;
begin
  if new.visit_date is null then
    new.start_at := null;
    new.end_at := null;
  else
    last_day := coalesce(new.end_date, new.visit_date);
    new.start_at := (new.visit_date + coalesce(new.start_time, time '09:00')) at time zone tz;
    if new.end_time is null then
      -- No end time recorded: the visit runs to the end of its last day.
      new.end_at := (last_day + time '23:59') at time zone tz;
    elsif last_day = new.visit_date and new.start_time is not null and new.end_time < new.start_time then
      -- Single-day visit that ends after midnight.
      new.end_at := ((last_day + 1) + new.end_time) at time zone tz;
    else
      new.end_at := (last_day + new.end_time) at time zone tz;
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

drop trigger trg_visits_before_write on public.visits;

create trigger trg_visits_before_write
before insert or update of visit_date, end_date, start_time, end_time, status on public.visits
for each row
execute procedure public.visits_before_write();

-- ---------------------------------------------------------------------------
-- Standard locations. Staff can add more straight from the visit form.
-- ---------------------------------------------------------------------------
insert into public.villages (name)
select v.name
from (values ('Manpura'), ('Aspura'), ('Sadwa'), ('Surana'), ('HO')) as v (name)
where not exists (select 1 from public.villages x where lower(trim(x.name)) = lower(v.name));
