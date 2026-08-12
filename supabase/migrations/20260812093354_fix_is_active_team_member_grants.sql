-- Supabase's default privileges grant EXECUTE on new public functions to
-- anon/authenticated/service_role automatically; `revoke ... from public`
-- alone doesn't strip those separately-granted roles. anon never needs to
-- call this (no RLS policy here targets `anon`), so revoke it explicitly.
revoke execute on function public.is_active_team_member() from anon;
