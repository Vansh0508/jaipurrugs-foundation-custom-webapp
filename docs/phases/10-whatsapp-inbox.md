# Phase 10 — WhatsApp Inbox, Auto-replies & Per-contact Memory

Builds on [phase 8](08-ai-agent.md) and [phase 9](09-leads-templates.md). Adds `/inbox`: real WhatsApp conversations between the foundation's number and its contacts. It includes the 24-hour window, AI auto-replies with staff takeover, a contact profile panel, and memory notes the agent keeps for each contact.

## Scope

- Schema (`supabase/migrations/20261002180000_whatsapp_inbox.sql`):
  - `whatsapp_conversations`: one row per Zernio conversation. Holds the contact's phone (or BSUID), the linked lead, `last_inbound_at` (the window anchor), unread count, `ai_enabled`, and `needs_human` + `handoff_reason`.
  - `whatsapp_messages`: unique on `platform_message_id` (Meta's wamid), so retries and send echoes collapse into one row. Columns include `sender_type` (`contact | agent | staff | external`), status (`received | pending | sent | delivered | read | failed`) and the agent's `tool_trace`.
  - `lead_memories`: the agent's notes list per contact, each with `source` (`agent | staff`).
  - `zernio_webhook_events`: event-id de-duplication (service role only, no policies).
  - `inbox_settings`: one row holding the global auto-reply switch.
  - The three inbox tables are added to the `supabase_realtime` publication.
- Webhook: `app/api/webhooks/zernio/route.ts` verifies `X-Zernio-Signature` (HMAC-SHA256 of the raw body, constant-time compare), de-duplicates, ingests, and returns `200` well inside Zernio's 5 s limit. The agent reply runs afterwards via Next.js `after()`.
- Ingestion (`src/lib/inbox/ingest.ts`): handles `message.received`, `message.sent`, `message.delivered`, `message.read` and `message.failed`. Statuses never move backwards. Standby messages (Meta Business Agent) are stored but never auto-replied.
- Agent replies (`src/lib/inbox/agent-reply.ts`): see the flow below.
- Server actions (`src/lib/actions/inbox.ts`): thread loading, staff replies, template sends, AI/handoff toggles, memory CRUD, and webhook status/registration.
- UI (`/inbox`): conversation list (filters: unread, needs a person, AI paused), thread, and the contact profile panel (details, custom attributes, lists, memory notes). Live updates use Supabase Realtime plus `router.refresh()`.

## The 24-hour window

`src/lib/whatsapp/window.ts` mirrors Meta's rule. Free-form messages are allowed until `last_inbound_at + 24h`; after that, or before the contact has ever written, only an approved template can be sent.

- The **staff composer** shows a text box only while the window is open. Otherwise it offers "Send a template". The server re-checks the window before every free-form send.
- **Agent replies** only run while the window is open. They are always triggered by an inbound message, which reopens the window.
- **Templates** can be sent at any time. The inbox template dialog pre-fills variables from the lead (the phase 9 bindings), and a team member may fill or override them per send. Templates go through `POST /v1/inbox/conversations`, which lands in the existing thread.

## Auto-reply flow

1. An inbound message arrives. It's stored, the lead is matched or created by normalised phone, and the reply is scheduled with `after()`.
2. After a 4 s debounce, only the **newest** inbound message in a burst gets a reply.
3. Checks before generating: the global switch is on, `ai_enabled` is set, `needs_human` isn't set, the contact has a phone number, and the window is open.
4. The agent generates a reply with up to 30 recent messages plus the contact's memory notes.
5. Checks again before sending: still the newest inbound, and no staff takeover or handoff during the run.
6. Sent with `Idempotency-Key: agent-reply-<inbound id>`, then stored with its tool trace.

**Staff takeover:** a staff free-form reply sets `ai_enabled = false` for that chat. The per-chat switch turns it back on, which also clears `needs_human`.

**Handoff:** the agent's `requestHumanHelp` tool sets `needs_human` and a reason. The agent tells the contact a person will reply, and auto-replies stop for that chat until it's marked handled.

## The agent never sees the phone number

Identity is resolved **deterministically**. `normalize_phone()` reduces any spelling of the number to its last 10 digits, which match a lead and conversation, and the result is captured in the tools' closures (`AgentToolContext.phone`). There is no AI search or matching step. The model never receives the number:

- The instructions contain the contact's name and memory notes, never the number. The agent is told it can't see phone numbers.
- Chat history, memory notes and the contact's name go through `redactPhone()`, which replaces any spelling of the contact's own number with `[contact's number]`.
- `getUserSubmissions` returns `[hidden]` for phone-type answers and redacts free text.
- `sendWhatsAppTemplate` uses `toModelOutput`: the model gets success, template name and errors only. The raw result (recipient, filled values, preview) stays in the staff-visible trace.
- New memory notes are redacted before they're saved.
- None of the tools takes a phone or identity argument.

The inbox test suite checks this across every model call: the number appears in no instruction, history message, memory note or tool result.

## Memory

- Notes live in `lead_memories`, attached to the contact's lead. They're shown in order in the agent's instructions on every reply and listed in the inbox profile panel.
- The agent adds notes with `rememberAboutContact` and removes outdated ones with `forgetAboutContact` (by number). Staff can add, edit and delete any note.
- At most 50 notes per contact.

## Setup

1. Set `NEXT_PUBLIC_SITE_URL` (public `https://` address) and `ZERNIO_WEBHOOK_SECRET` (a long random string) on the server.
2. Click **Connect webhook** in the inbox toolbar. It registers `${NEXT_PUBLIC_SITE_URL}/api/webhooks/zernio` with Zernio for the inbox events, scoped to the configured profile.
3. `OPENAI_API_KEY` must be set for auto-replies. Without it the inbox still works, without AI.
4. Local development needs a tunnel (e.g. a public https URL forwarding to `localhost:3000`) for Zernio to reach the webhook.

## Known limits

- **Username-only WhatsApp users (BSUID, April 2026+)** don't share a number. Their conversation is stored, but there's no lead, memory, AI reply or template send (templates need a number). Staff reply manually inside the window.
- **Attachments:** only type/mime are stored. WhatsApp media URLs require the Zernio API key and expire, so media isn't downloaded or previewed yet.
- **History:** only messages that arrive after the webhook is connected appear. Earlier Zernio history isn't imported.
- **Concurrency:** two messages from the same contact a few seconds apart get one reply (debounce). Two app instances could each run the agent for different messages in the same burst; only the newest inbound would send.
