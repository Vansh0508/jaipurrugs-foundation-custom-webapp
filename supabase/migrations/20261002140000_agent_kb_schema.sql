-- Phase 8: AI agent workbench — knowledge base, simulator chat history, and the
-- phone-scoped submission lookup the agent's tools call.
-- See docs/phases/08-ai-agent.md and AGENTS.md §5-§7.

-- ---------------------------------------------------------------------------
-- Phone normalization
-- ---------------------------------------------------------------------------
-- Phone answers are stored exactly as typed ("98765 43210", "+91-9876543210",
-- "09876543210"). Compare on the last 10 digits so every spelling of the same
-- Indian mobile number matches. Anything under 8 digits normalizes to NULL, so
-- an empty or junk input can never match (NULL = NULL is not true).
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when length(d) >= 8 then right(d, 10)
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) as digits;
$$;

create index form_answers_phone_normalized_idx
on public.form_answers (public.normalize_phone(value #>> '{}'))
where field_snapshot ->> 'type' = 'phone';

-- The agent's only path to submission data. The phone is a parameter bound by
-- the server (never chosen by the model), and the filter lives here rather than
-- in TypeScript so no caller can forget it. SECURITY INVOKER: RLS on
-- form_submissions/form_answers still applies to whoever calls it.
create or replace function public.agent_submissions_for_phone(
  p_phone text,
  p_limit integer default 20
)
returns table (
  submission_id uuid,
  form_id       uuid,
  form_title    text,
  status        public.submission_status,
  created_at    timestamptz,
  completed_at  timestamptz,
  answers       jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select distinct fa.submission_id
    from public.form_answers fa
    where fa.field_snapshot ->> 'type' = 'phone'
      and public.normalize_phone(fa.value #>> '{}') = public.normalize_phone(p_phone)
  )
  select
    s.id,
    s.form_id,
    f.title,
    s.status,
    s.created_at,
    s.completed_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', a.field_snapshot ->> 'label',
            'type',  a.field_snapshot ->> 'type',
            'value', a.value
          )
          order by (a.field_snapshot ->> 'position')::numeric
        )
        from public.form_answers a
        where a.submission_id = s.id
      ),
      '[]'::jsonb
    )
  from matched m
  join public.form_submissions s on s.id = m.submission_id
  join public.forms f on f.id = s.form_id
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function public.agent_submissions_for_phone(text, integer) from public, anon;

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------
-- array_to_string is only STABLE (element output functions could in theory
-- vary), which generated columns reject. For text[] the output is fixed, so
-- this wrapper is safely IMMUTABLE.
create or replace function public.kb_tags_to_text(p_tags text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_to_string(p_tags, ' '), '');
$$;

create table public.knowledge_base_articles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  category      text not null default 'general',
  content       text not null,
  tags          text[] not null default '{}',
  metadata      jsonb not null default '{}'::jsonb,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', public.kb_tags_to_text(tags)), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) stored
);

create index knowledge_base_articles_search_idx
on public.knowledge_base_articles using gin (search_vector);

create index knowledge_base_articles_category_idx
on public.knowledge_base_articles (category);

create trigger trg_knowledge_base_articles_set_updated_at
before update on public.knowledge_base_articles
for each row
execute procedure public.set_updated_at();

alter table public.knowledge_base_articles enable row level security;

create policy "active_members_select_kb_articles"
on public.knowledge_base_articles
for select
to authenticated
using ( (select public.is_active_team_member()) );

create policy "active_members_insert_kb_articles"
on public.knowledge_base_articles
for insert
to authenticated
with check ( (select public.is_active_team_member()) );

create policy "active_members_update_kb_articles"
on public.knowledge_base_articles
for update
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

create policy "active_members_delete_kb_articles"
on public.knowledge_base_articles
for delete
to authenticated
using ( (select public.is_active_team_member()) );

-- Keyword search for the agent's searchKnowledgeBase tool. Terms are OR'ed
-- (plainto_tsquery ANDs them) because users ask full natural-language
-- questions — "how do I apply for the loom scheme?" should still hit an
-- article that only mentions "loom" and "scheme". ts_rank_cd orders by how
-- many terms matched and how close together they are.
create or replace function public.search_knowledge_base(
  p_query text,
  p_limit integer default 5
)
returns table (
  id       uuid,
  title    text,
  category text,
  tags     text[],
  excerpt  text,
  rank     real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select nullif(
      replace(plainto_tsquery('english', coalesce(p_query, ''))::text, '&', '|'),
      ''
    )::tsquery as query
  )
  select
    a.id,
    a.title,
    a.category,
    a.tags,
    ts_headline(
      'english',
      a.content,
      q.query,
      'MaxFragments=2, MaxWords=40, MinWords=15, FragmentDelimiter=" … ", StartSel="", StopSel=""'
    ),
    ts_rank_cd(a.search_vector, q.query)
  from public.knowledge_base_articles a, q
  where q.query is not null
    and a.search_vector @@ q.query
  order by ts_rank_cd(a.search_vector, q.query) desc
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

revoke execute on function public.search_knowledge_base(text, integer) from public, anon;

-- ---------------------------------------------------------------------------
-- Workbench chat history (simulator sessions + tool traces, for audit)
-- ---------------------------------------------------------------------------
create table public.agent_chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  phone_number text not null check (public.normalize_phone(phone_number) is not null),
  title        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index agent_chat_sessions_updated_at_idx
on public.agent_chat_sessions (updated_at desc);

create trigger trg_agent_chat_sessions_set_updated_at
before update on public.agent_chat_sessions
for each row
execute procedure public.set_updated_at();

alter table public.agent_chat_sessions enable row level security;

create policy "active_members_select_agent_sessions"
on public.agent_chat_sessions
for select
to authenticated
using ( (select public.is_active_team_member()) );

create policy "active_members_insert_agent_sessions"
on public.agent_chat_sessions
for insert
to authenticated
with check ( (select public.is_active_team_member()) );

create policy "active_members_update_agent_sessions"
on public.agent_chat_sessions
for update
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

create policy "active_members_delete_agent_sessions"
on public.agent_chat_sessions
for delete
to authenticated
using ( (select public.is_active_team_member()) );

create table public.agent_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- [{ toolCallId, toolName, args, result, isError }] for the assistant turn
  tool_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index agent_chat_messages_session_created_idx
on public.agent_chat_messages (session_id, created_at);

alter table public.agent_chat_messages enable row level security;

create policy "active_members_select_agent_messages"
on public.agent_chat_messages
for select
to authenticated
using ( (select public.is_active_team_member()) );

create policy "active_members_insert_agent_messages"
on public.agent_chat_messages
for insert
to authenticated
with check ( (select public.is_active_team_member()) );

create policy "active_members_delete_agent_messages"
on public.agent_chat_messages
for delete
to authenticated
using ( (select public.is_active_team_member()) );
