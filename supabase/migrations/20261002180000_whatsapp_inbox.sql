-- Phase 10: WhatsApp inbox — conversations and messages mirrored from Zernio
-- webhooks, per-contact agent memory, and webhook de-duplication.
-- See docs/phases/10-whatsapp-inbox.md and AGENTS.md §5-§7.
--
-- Writes from Zernio arrive through app/api/webhooks/zernio with the
-- service-role client (no user session); staff reads/writes go through RLS.

-- ---------------------------------------------------------------------------
-- Conversations (one per Zernio conversation)
-- ---------------------------------------------------------------------------
create table public.whatsapp_conversations (
  id                       uuid primary key default gen_random_uuid(),
  zernio_conversation_id   text not null unique,
  zernio_account_id        text not null,
  -- E.164 as Zernio reports it. NULL for users who message via a WhatsApp
  -- username without exposing their number (BSUID rollout, April 2026+).
  contact_phone            text,
  contact_phone_normalized text generated always as (public.normalize_phone(contact_phone)) stored,
  contact_bsuid            text,
  contact_name             text,
  lead_id                  uuid references public.leads(id) on delete set null,
  -- The 24-hour customer-service window is anchored here: free-form messages
  -- are allowed until last_inbound_at + 24h, templates only after that.
  last_inbound_at          timestamptz,
  last_message_at          timestamptz,
  last_message_preview     text,
  unread_count             integer not null default 0 check (unread_count >= 0),
  ai_enabled               boolean not null default true,
  needs_human              boolean not null default false,
  handoff_reason           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index whatsapp_conversations_last_message_idx
on public.whatsapp_conversations (last_message_at desc nulls last);
create index whatsapp_conversations_phone_idx
on public.whatsapp_conversations (contact_phone_normalized);
create index whatsapp_conversations_lead_idx
on public.whatsapp_conversations (lead_id);

create trigger trg_whatsapp_conversations_set_updated_at
before update on public.whatsapp_conversations
for each row
execute procedure public.set_updated_at();

alter table public.whatsapp_conversations enable row level security;

create policy "active_members_all_whatsapp_conversations"
on public.whatsapp_conversations
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.whatsapp_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.whatsapp_conversations(id) on delete cascade,
  -- Meta's wamid. Unique so webhook retries and our own send echoes
  -- (message.sent) collapse into one row.
  platform_message_id text unique,
  zernio_message_id   text,
  direction           text not null check (direction in ('inbound', 'outbound')),
  -- contact: the WhatsApp user. agent/staff: sent from this app.
  -- external: outbound sent elsewhere (Zernio dashboard, WhatsApp Business app).
  sender_type         text not null check (sender_type in ('contact', 'agent', 'staff', 'external')),
  sent_by             text,
  kind                text not null default 'text' check (kind in ('text', 'template', 'media', 'interactive', 'other')),
  body                text,
  template_name       text,
  template_language   text,
  attachments         jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  status              text not null default 'sent'
                      check (status in ('received', 'pending', 'sent', 'delivered', 'read', 'failed')),
  error               text,
  tool_trace          jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_trace) = 'array'),
  sent_at             timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index whatsapp_messages_conversation_sent_idx
on public.whatsapp_messages (conversation_id, sent_at);

alter table public.whatsapp_messages enable row level security;

create policy "active_members_all_whatsapp_messages"
on public.whatsapp_messages
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Per-contact agent memory (notes list)
-- ---------------------------------------------------------------------------
create table public.lead_memories (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  content    text not null check (length(trim(content)) between 1 and 500),
  source     text not null check (source in ('agent', 'staff')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_memories_lead_idx on public.lead_memories (lead_id, created_at);

create trigger trg_lead_memories_set_updated_at
before update on public.lead_memories
for each row
execute procedure public.set_updated_at();

alter table public.lead_memories enable row level security;

create policy "active_members_all_lead_memories"
on public.lead_memories
for all
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Webhook de-duplication (Zernio retries with the same event id)
-- ---------------------------------------------------------------------------
create table public.zernio_webhook_events (
  event_id     text primary key,
  event        text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

-- Service role only: no policies, so authenticated/anon see nothing.
alter table public.zernio_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- Inbox-wide settings (single row)
-- ---------------------------------------------------------------------------
create table public.inbox_settings (
  id                  boolean primary key default true check (id),
  auto_reply_enabled  boolean not null default true,
  updated_by          text,
  updated_at          timestamptz not null default now()
);

insert into public.inbox_settings (id) values (true) on conflict do nothing;

create trigger trg_inbox_settings_set_updated_at
before update on public.inbox_settings
for each row
execute procedure public.set_updated_at();

alter table public.inbox_settings enable row level security;

create policy "active_members_select_inbox_settings"
on public.inbox_settings
for select
to authenticated
using ( (select public.is_active_team_member()) );

create policy "active_members_update_inbox_settings"
on public.inbox_settings
for update
to authenticated
using ( (select public.is_active_team_member()) )
with check ( (select public.is_active_team_member()) );

-- ---------------------------------------------------------------------------
-- Realtime: the inbox UI subscribes to these (RLS still filters events)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.whatsapp_conversations;
alter publication supabase_realtime add table public.whatsapp_messages;
alter publication supabase_realtime add table public.lead_memories;
