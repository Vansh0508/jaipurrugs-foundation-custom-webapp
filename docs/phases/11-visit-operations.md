# Phase 11 — Visit Operations (Calendar, Trips, Villages, Partners) and Scheduled Guest Messaging

Builds on [phase 8](08-ai-agent.md), [phase 9](09-leads-templates.md) and [phase 10](10-whatsapp-inbox.md). Extends the admin portal with the data a Rural Experience programme runs on — villages, the experiences offered in each, partners, and visits with their guests — and makes that data available to the WhatsApp agent. After a visit, the system sends each guest an approved WhatsApp template (thank-you, feedback link) on a schedule.

**There is no visitor portal, guest login or login code.** The WhatsApp agent is the only guest-facing surface. A guest is a **lead** (phone-keyed) attached to a visit; email and other details live in the existing custom lead attributes.

## Milestones

| # | Scope | Status |
|---|---|---|
| M0 | Route gating fixed (`/agents /leads /templates /inbox` were missing from `ADMIN_PATH_PREFIXES`), nav groups, `.env.example`, AGENTS.md | Done |
| M1 | `villages`, `experiences` (with itinerary steps), `partners`; `/villages`, `/partners` | Done |
| M2 | `visits`, `visit_villages`, `visit_experiences`, `visit_guests`, `visit_settings`, `leads.whatsapp_opt_out`; `/calendar`, `/trips`, guest management, visits on the inbox contact panel | Done |
| M3 | Phone-scoped agent RPCs and tools (`getMyVisits`, `getVisitItinerary`, `getExperiences`, `getVillages`), visit context in the agent prompt | Done |
| M4 | Dashboard (`public.dashboard_stats`) with BKLit charts | Done |
| M5 | Per-guest feedback link (`/fb/[token]`), anon policy tightening for guest-linked submissions, satisfaction score | Done (see "not yet exercised" below) |
| M6 | Rule sets, scheduled-send queue, dispatch route, `visit:` template bindings, `/messaging` | Done (live sending not yet exercised) |
| M7 | pg_cron + pg_net wiring, auto-complete job, monitoring | Done (needs the manual steps below) |

## Agent access (M3)

- `public.agent_visits_for_phone(p_phone, p_scope, p_limit)` and `public.agent_visit_itinerary_for_phone(p_phone, p_visit_id)` are `security invoker`, revoked from `public, anon`, and match the conversation's phone through `normalize_phone()`. The itinerary RPC returns null unless the contact is a guest on that visit, so the model can't read an arbitrary visit id.
- Allowlisted columns only: date, times, status, the guest's own status, coordinator name and phone, host, villages, experiences and their itineraries. **Never** amounts, notes, booking channel, partner, headcount or other guests.
- Tools (`src/lib/mastra/tools/visits-tool.ts`): `getMyVisits`, `getVisitItinerary` (phone-scoped, no identity argument), and `getExperiences`, `getVillages` (the same for everyone; active rows only). Raw database errors never reach the model.
- `createVisitLoader` (`src/lib/mastra/visit-context.ts`) puts the contact's next and most recent visits into the prompt each turn, so a reply to a thank-you or reminder is understood as being about that visit.
- Structured visit facts live in these tables; the knowledge base keeps prose (FAQs, prices, policies). Don't duplicate visit facts into KB articles — they go stale.

## Dashboard and charts (M4)

- `/dashboard` calls one RPC, `public.dashboard_stats(p_from, p_to)` (`security invoker`, revoked from `public, anon`), and renders the result. The metric definitions are documented at the top of `supabase/migrations/20261005130000_dashboard_stats.sql`: reach and income count **completed** Rural Experience visits in the period; "repeat" means a guest attended 2+ completed Rural Experience visits; partner retention is partners with 2+ such visits over partners with 1+.
- Month-over-month growth compares the last two **complete** months, not the month in progress.
- Charts are **BKLit UI**, vendored into `src/components/charts/` by the shadcn CLI (`components.json` registers `@bklit` at `https://bklit.com/r/{name}.json`). Installed: area, bar, ring. Add more with `npx shadcn@latest add @bklit/<name>`.
- **After any shadcn install, review the `globals.css` diff.** The CLI writes a `@custom-variant dark`, a `.dark` block, a malformed `----chart-*` mapping, and a grayscale palette. All were removed or fixed by hand; only the `--chart-*` tokens remain, mapped to the HeroUI accent. Also delete any `dark:` classes in new vendored files (Tailwind 4's default `dark:` is `prefers-color-scheme`, which this app forbids).
- `src/components/charts/**` is excluded from ESLint (vendored third-party source). Our two local edits: no `dark:` classes in `tooltip/date-ticker.tsx`, and a fixed import path in `chart-loading-label.tsx`.
- Server components can't pass functions to client chart components — map labels on the server first.

## Guest feedback link (M5)

- Each `visit_guests` row has an opaque `feedback_token` (about 140 random bits). The link is `${NEXT_PUBLIC_SITE_URL}/fb/<token>`. A path, not a query string, because Meta's dynamic URL button allows one variable at the end of the URL. The page sends `noindex` and `Referrer-Policy: no-referrer`.
- The token is resolved only inside two `SECURITY DEFINER` RPCs, `feedback_session` and `feedback_save`, which are the only things `anon` can execute. The resolver itself (`private.feedback_resolve`) is not callable from the API. An invalid, expired, cancelled-visit, no-show or unpublished-form token all give the same "not available" result.
- Guest submissions are marked `form_submissions.is_guest_feedback = true` and **every anon policy on `form_submissions` and `form_answers` excludes them**, so a guest can't read or change anyone's answers by calling PostgREST directly. The marker is not nulled by foreign-key actions (unlike `visit_guest_id`), so a submission can't become anon-readable if a guest or visit is removed later.
- `feedback_save` validates every `field_id` against the form, builds the answer snapshot from the field itself, rejects file-upload and section fields, caps sizes, and enforces required questions when completing. Completed submissions are immutable.
- A guest-linked submission updates the guest's own lead (gap-fill only for name and attributes). It never reads the form's phone field.
- `agent_submissions_for_phone` also returns feedback a contact gave through a visit link. `dashboard_feedback_stats` rescales rating answers to 0-5 (using each field's configured max) for the Satisfaction card.
- **Known, pre-existing, not changed:** for ordinary public forms the anon select/update policies only check that the form is published; the submitter-token check lives in the server actions. Fixing that is a separate piece of work.
- **Not yet exercised end to end:** the happy-path RPC flow (save, required-field enforcement, complete, lead sync) was written and reviewed but not run against test data in the live database. Run it once on a throwaway visit before relying on it: create a published form with a required rating, a visit with that feedback form and two guests, open `/fb/<token>` for each, and confirm each only sees and writes their own answers.

## Scheduled messaging (M6)

- **Rules.** `message_rule_sets` / `message_rule_set_items` are reusable sequences (a set with a `visit_type` is applied automatically to new visits of that type). They are *copied* into `visit_message_rules` per visit, so editing a sequence never changes messages already scheduled. A rule is `anchor` (`on_complete`, `before_start`, `after_start`) + `offset_minutes` + an approved template.
- **Queue.** `scheduled_whatsapp_sends` holds one row per (rule, guest). `private.materialize_visit_sends(visit_id)` keeps it in step, and is called from triggers on visits, guests, rules and a lead's opt-out. It only touches `queued` / `cancelled` / `skipped` rows, so a message in flight, delivered or of unknown outcome is never duplicated. Opted-out and no-show guests get nothing. A reminder whose time has passed is `skipped (missed_window)`, never sent late. After-visit messages expire after `expiry_days` so a late "mark completed" can't flood guests.
- **Dispatch.** `POST /api/cron/dispatch` (Bearer `CRON_SECRET`) answers 202 and, in `after()`, calls `lib/scheduler/dispatch.ts`. It checks the kill switch (`visit_settings.sends_enabled`), claims due rows with `public.claim_scheduled_sends()` (`FOR UPDATE SKIP LOCKED`, `service_role` only), re-checks everything at send time (visit cancelled, guest removed, opted out, template still approved, values resolvable), then sends. Quiet hours (default 23:00–08:00 IST) are enforced inside the claim function: due rows wait for the window to end, or are dropped if they'd expire first.
- **At most once.** The row is stamped `send_started_at` just before WhatsApp is called. A timeout or 5xx is *ambiguous* → `unknown`, never retried automatically; the claim function reconciles `processing` rows against the inbox (the webhook echo records a message even if our write failed) and otherwise parks them as `unknown` for a person ("Send again" warns it may already be delivered). Only a 429 is retried (backoff, max 4 attempts). The Zernio template endpoint isn't known to honour `Idempotency-Key`; it is sent anyway but never relied on.
- **Dry run.** `visit_settings` defaults to `sends_enabled = false` and `dry_run = true`. With dry run on, rows finish as `dry_run` with the filled values recorded. Turning dry run off re-queues unexpired dry-run rows.
- **Template variables.** `visit:<field>` binding sources (visit date, start time, coordinator, villages, experiences, `feedback_token`) resolve only in scheduler sends. A template that uses one is **scheduled-only**: the agent's `getWhatsAppTemplates` lists it as not sendable and `sendWhatsAppTemplate` refuses it, so the agent can never send someone's feedback link on its own. Put only the **token** in a URL-button variable (button URL `https://<site>/fb/{{1}}`). Use Utility templates for reminders and feedback; Marketing templates need opt-in and are frequency-capped.
- **Inbox.** Scheduler sends are mirrored into `whatsapp_messages` with `sender_type = 'system'` (matched on the wamid, never downgrading a delivery status). The agent's prompt includes the last automatic message sent in the previous 48 hours, so a reply is understood in context.

## The clock (M7) and the manual steps to go live

Migration `20261005170000_visit_scheduler_cron.sql` enables `pg_cron` and `pg_net` and schedules two jobs: `visit-auto-complete` (every 10 min, pure SQL; only `confirmed` / `booking_done` visits, N hours after they end, `completed_by = 'auto'`) and `visit-dispatch` (every 5 min; `pg_net` POSTs to the dispatch route). The dispatch job reads its URL and secret from Vault and **does nothing until both exist**, so applying the migration sent nothing.

To turn it on (all manual, one-off):

1. Set `CRON_SECRET` (a long random string) in the app's environment on the server, and make sure `NEXT_PUBLIC_SITE_URL` is the public HTTPS origin. Restart the app.
2. Confirm Supabase can reach that origin over public HTTPS (Nginx / firewall). `pg_net` can't reach localhost or a private address, and can't be exercised from local development — test the route with `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/dispatch` (expect `202`).
3. In the Supabase SQL editor: `select vault.create_secret('https://<site>/api/cron/dispatch', 'visit_dispatch_url');` and `select vault.create_secret('<the same CRON_SECRET>', 'visit_cron_secret');`
4. Get the templates approved in Templates (Utility category; a URL button `https://<site>/fb/{{1}}` bound to **Visit: Feedback link token**), create a sequence on `/messaging`, and attach a feedback form to the visit.
5. Leave **dry run on** and switch **Scheduled messaging** on in `/messaging` → Settings. Mark a test visit (with only your own number as a guest) completed and check the rows appear as "Dry run" with the right values.
6. Switch dry run off. Going live re-queues unexpired dry-run rows.

Monitoring: `select * from cron.job_run_details order by start_time desc limit 20;` and `select * from net._http_response order by created desc limit 20;`. The route logs one `[cron/dispatch] {...}` summary line per tick. The kill switch (`sends_enabled`) stops all sending within one tick.

## Data model rules

- **Times are Asia/Kolkata wall-clock.** Staff enter `visit_date`, `start_time`, `end_time`; the `visits_before_write` trigger derives `start_at`/`end_at` (a visit ending after midnight rolls to the next day; no end time means end of day). Never compute these in application code.
- **Status is text + check**, not an enum: `tentative | confirmed | booking_done | completed | cancelled`. `completed_at` is maintained by the trigger; `completed_by` is `staff:<email>` or `auto`.
- **Villages and experiences are referenced with `on delete restrict`** from visits. Deactivate (`is_active = false`) instead of deleting anything a past visit used.
- **`headcount` is the group size**, not the number of guests with phones. Don't derive one from the other.
- **Only `program_category = 'rural_experience'` visits feed impact numbers.**
- Every table has its own `active_members_all_<table>` policy; `visit_settings` is select/update only. None of these tables has anon access.

## Do's

- Do add every new admin path to **both** `src/proxy.ts` (matcher) and `ADMIN_PATH_PREFIXES` in `src/lib/supabase/proxy.ts`.
- Do keep validation in `src/lib/visits/schemas.ts` (forms hold strings; `""` means "not set").
- Do load data in server components and mutate with server actions + `router.refresh()`. Load on-demand data (the guest list) in the click handler that opens the modal, not in an effect.

## Don'ts

- Don't expose visit amounts, internal notes, booking channel, partner or other guests to the agent (M3). The agent only ever sees the contacted guest's own visits through phone-scoped RPCs.
- Don't send anything to a lead with `whatsapp_opt_out = true`, and don't rely on `public.is_active_team_member()` inside anything the scheduler or pg_cron runs — it is false under the service role.
- Don't ship the scheduler with `sends_enabled = true` or `dry_run = false`. `visit_settings` defaults to both off.
