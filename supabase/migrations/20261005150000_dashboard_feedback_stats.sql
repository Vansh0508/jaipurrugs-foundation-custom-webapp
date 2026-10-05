-- Phase 11 / M5: the satisfaction score for the dashboard, from feedback guests
-- gave through their personal link. Kept separate from dashboard_stats() so that
-- function didn't have to be re-sent in full.
--
-- Counts COMPLETED guest-feedback submissions for completed Rural Experience
-- visits in [p_from, p_to] (the same visits the reach numbers count). A response's
-- score is the average of its rating-type answers, each rescaled to 0-5 using that
-- field's configured maximum (default 5), so a 1-10 rating and a 1-5 rating compare.
-- Runs as the caller (security invoker): RLS applies.

create function public.dashboard_feedback_stats(p_from date, p_to date)
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
      and v.program_category = 'rural_experience'
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

revoke execute on function public.dashboard_feedback_stats(date, date) from public, anon;
