# Phase 8 — AI Agent Workbench & Knowledge Base

See [AGENTS.md](../../AGENTS.md) §5–§7. This phase adds a Mastra-powered WhatsApp assistant, a knowledge base it answers from, and an admin workbench (`/agents`) to test it as a given contact before any real WhatsApp traffic reaches it.

## Scope

- Schema (`supabase/migrations/20261002140000_agent_kb_schema.sql`):
  - `knowledge_base_articles` — title, category, content, tags, metadata; generated weighted `tsvector` + GIN index.
  - `agent_chat_sessions` / `agent_chat_messages` — simulator conversations with the per-reply `tool_trace` (JSONB) kept for audit.
  - `public.normalize_phone(text)` — last 10 digits, NULL under 8 digits. Partial expression index on `form_answers` phone answers.
  - `public.agent_submissions_for_phone(phone, limit)` — the agent's only path to submission data. SECURITY INVOKER, so RLS still applies.
  - `public.search_knowledge_base(query, limit)` — OR'ed full-text search (natural-language questions still match), ranked with `ts_rank_cd`.
- Agent (`src/lib/mastra/`): `agent.ts` builds a Mastra `Agent` per turn with model `AGENT_MODEL` (default `openai/gpt-5-mini`) and four tools: `getUserSubmissions`, `searchKnowledgeBase`, `getWhatsAppTemplates`, `sendWhatsAppTemplate`.
- Zernio (`src/lib/zernio/client.ts`): `listWhatsAppTemplates` (`GET /v1/whatsapp/templates`) and `sendWhatsAppTemplate` (`POST /v1/inbox/conversations` with `templateName`/`templateLanguage`/`templateParams`).
- Server actions: `src/lib/actions/agent.ts` (sessions, messages, `sendAgentMessage`) and `src/lib/actions/kb.ts` (article CRUD, sample seeding).
- UI: `src/app/(admin)/agents/page.tsx` + `src/components/admin/agent/` — chat simulator (contact bar, WhatsApp-style chat, template preview cards, tool-trace panel) and knowledge base manager.

## Security model — phone scoping

The model is never trusted to enforce the data boundary:

1. The phone number lives on the `agent_chat_sessions` row. `sendAgentMessage` reads it from there, never from the client payload or the model.
2. Each tool is built per turn by a factory that captures the phone in a closure (`AgentToolContext`). No tool has a phone argument, and zod strips any extra `phone` the model invents.
3. The filter itself is in SQL (`agent_submissions_for_phone`), so no TypeScript caller can forget it. Short or empty input normalizes to NULL and matches nothing.
4. RLS still applies on top: the function is SECURITY INVOKER and `revoke`d from `anon`.

Matching is on the **last 10 digits**, so `+91 98765 43210`, `098765-43210` and `9876543210` are the same contact. Non-Indian numbers whose last 10 digits collide would be treated as the same contact. That's acceptable for the foundation's current footprint, but revisit it if contacts outside India are added.

Phone answers on public forms are self-reported. Whoever typed a number into a form (e.g. a coordinator filling it on an artisan's behalf) makes that submission visible to that number. This is by design: "linked to this number" means "a phone field contains this number."

## Do's

- Keep `normalizePhone` in `src/lib/mastra/phone.ts` in sync with `public.normalize_phone()` — the SQL one is authoritative.
- Add new agent capabilities as tool factories taking `AgentToolContext`, with no identity/phone parameters in `inputSchema`.
- Keep `sendWhatsAppTemplate` preview-only unless the admin explicitly turns on **Live send** for that turn.
- Replace the "Sample:" knowledge-base articles (`metadata.sample = true`) with verified foundation content before connecting real WhatsApp traffic. The agent repeats what the KB says to artisans.

## Don'ts

- Don't give any agent tool a phone/user-id argument, and don't query `form_submissions`/`form_answers` directly from a tool — go through `agent_submissions_for_phone`.
- Don't add a route handler for streaming the trace. Turns go through the `sendAgentMessage` Server Action, and the trace renders when the reply completes (AGENTS.md §5).
- Don't use the service-role client in the workbench path. It runs as the signed-in team member under RLS.

## Next step (not in this phase): real inbound WhatsApp

A Zernio inbound-message webhook (`app/api/webhooks/zernio/route.ts`) would have no user session, so it would need a service-role client. Under AGENTS.md §6 that must be a narrowly scoped server-only module. The phone must come from the verified webhook payload (signature-checked), never from message text. The same tool factories and SQL function apply unchanged.

## Environment

- `OPENAI_API_KEY` — required for agent turns (server-only).
- `AGENT_MODEL` — optional, any Mastra `provider/model` string.
- `ZERNIO_API_KEY` / `ZERNIO_PROFILE_ID` — already used by Settings. Templates use the first active connected WhatsApp account.

## Definition of Done

Migration applied and types regenerated. `/agents` is gated by `proxy.ts`. A session for a number with submissions returns only that number's submissions, and asking for someone else's records returns nothing extra. KB articles can be added, edited, deleted and found by the agent. With Live send off, template sends render a preview and make no Zernio send request. With it on, exactly one request goes to the session's number.
