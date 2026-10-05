-- Phase 11 / M7: the clock that drives scheduled visit messaging.
--
--   visit-auto-complete  every 10 min  pure SQL: completes confirmed / booked visits nobody
--                                      marked completed, N hours after they end
--   visit-dispatch       every 5 min   pg_net POSTs to /api/cron/dispatch, which sends what is due
--
-- The dispatch job reads its URL and secret from Supabase Vault and does NOTHING until both
-- exist, so applying this migration sends nothing and fails nothing. Setting them is a manual,
-- one-off step (like enabling the Auth Hook) — secrets never belong in a committed migration:
--
--   select vault.create_secret('https://<your-site>/api/cron/dispatch', 'visit_dispatch_url');
--   select vault.create_secret('<the same value as CRON_SECRET in the app environment>', 'visit_cron_secret');
--
-- To rotate: select vault.update_secret(id, 'new value') for the row in vault.secrets.
-- To check the clock:  select * from cron.job_run_details order by start_time desc limit 20;
--                      select * from net._http_response order by created desc limit 20;
-- See docs/phases/11-visit-operations.md.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Auto-complete fallback. Only visits that were confirmed or booked: a tentative
-- visit never completes by itself. completed_at is stamped by visits_before_write();
-- the materializer trigger then queues the after-visit messages.
-- ---------------------------------------------------------------------------
create function public.auto_complete_visits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.visit_settings%rowtype;
  n integer;
begin
  select * into st from public.visit_settings where id;

  update public.visits
  set status = 'completed', completed_by = 'auto'
  where status in ('confirmed', 'booking_done')
    and end_at is not null
    and end_at + make_interval(hours => st.auto_complete_after_hours) < now();

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.auto_complete_visits() from public, anon, authenticated;
grant execute on function public.auto_complete_visits() to service_role;

select cron.schedule(
  'visit-auto-complete',
  '*/10 * * * *',
  $cron$ select public.auto_complete_visits() $cron$
);

select cron.schedule(
  'visit-dispatch',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := s.url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || s.secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )
    from (
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'visit_dispatch_url') as url,
        (select decrypted_secret from vault.decrypted_secrets where name = 'visit_cron_secret') as secret
    ) s
    where s.url is not null and s.secret is not null
  $cron$
);
