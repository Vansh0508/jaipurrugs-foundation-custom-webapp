-- Single-tier team member whitelist (no roles): any active row has full
-- read/write access to the whitelist itself and to every admin-owned table
-- gated on public.is_active_team_member(). See AGENTS.md §1 and §7.

create type public.team_member_status as enum ('active', 'inactive');

create table public.team_members (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  status     public.team_member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index team_members_email_lower_idx on public.team_members (lower(email));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_team_members_set_updated_at
before update on public.team_members
for each row
execute procedure public.set_updated_at();

-- Security-definer lookup: must bypass RLS on team_members itself, otherwise
-- no one (including the first active member) could ever pass the RLS check
-- that depends on calling this very function. Returns a plain boolean about
-- the caller's own status, so it is safe to expose even though functions in
-- `public` are callable by any authenticated role by default.
create or replace function public.is_active_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members
    where lower(email) = lower((select auth.jwt() ->> 'email'))
      and status = 'active'
  );
$$;

revoke all on function public.is_active_team_member() from public;
grant execute on function public.is_active_team_member() to authenticated;

alter table public.team_members enable row level security;

create policy "active_members_can_select_team_members"
on public.team_members
for select
to authenticated
using ( public.is_active_team_member() );

create policy "active_members_can_insert_team_members"
on public.team_members
for insert
to authenticated
with check ( public.is_active_team_member() );

create policy "active_members_can_update_team_members"
on public.team_members
for update
to authenticated
using ( public.is_active_team_member() )
with check ( public.is_active_team_member() );

create policy "active_members_can_delete_team_members"
on public.team_members
for delete
to authenticated
using ( public.is_active_team_member() );

-- Before User Created Auth Hook function. Must be manually selected as the
-- active hook in Supabase Dashboard > Authentication > Hooks (Beta) — no
-- CLI/MCP/migration can flip that switch.
create or replace function public.hook_restrict_signup_to_active_team_members(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(event->'user'->>'email');
  v_is_active boolean;
begin
  select exists (
    select 1 from public.team_members
    where lower(email) = v_email and status = 'active'
  ) into v_is_active;

  if v_is_active then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not authorized for the Jaipur Rugs Foundation admin panel. Contact your administrator.'
    )
  );
end;
$$;

grant execute on function public.hook_restrict_signup_to_active_team_members to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_to_active_team_members from authenticated, anon, public;

-- Bootstrap seed: this insert runs as the migration role, outside of RLS, so
-- it's the one place a whitelist row can be created before anyone is active.
insert into public.team_members (email, status)
values ('claude8@jaipurrugs.org', 'active');
