# AGENTS.md — Jaipur Rugs Foundation Forms & Admin Panel

This file is the contract for anyone (human or AI agent) contributing to this codebase. Read it before writing code. Phase-specific scope, do's, and don'ts live under [docs/phases/](docs/phases/) — this file covers what applies across the whole project.

Full architectural rationale (data model, RLS design, UX decisions) lives in the approved project plan; this document is the operational summary of it.

## 1. Project Purpose & Scope

An internal tool for Jaipur Rugs Foundation staff to:
- Build forms (a Tally/Typeform-like builder) with a fixed, non-customizable visual style shared across all forms.
- Share each form via a unique public link.
- Collect submissions in real time, including from field workers on mobile devices with unreliable connectivity.
- Review submissions and per-field metrics from a central admin panel.

The app has exactly two surfaces:
- **Public** — anonymous form-filling pages (`app/(public)/f/[shareToken]`). No auth, no whitelist logic, no admin code ever runs here.
- **Admin** — authenticated panel (`app/(admin)/...`), restricted to team members explicitly whitelisted in the `team_members` table.

**There is no *open* self-serve signup and there never should be.** `/auth/login` does let a whitelisted email create its own password on first use (see §7) — that is not open registration, since account creation is rejected outright for any email not already `active` in `team_members`. Never add a signup path that skips the whitelist check.

**Team management is single-tier — there are no roles.** Every row in `team_members` is equal: any `active` whitelisted user has full access to the entire admin panel, including adding, deactivating, reactivating, and permanently removing other team members. There is no `super_admin`/`editor`/`viewer` distinction. Do not reintroduce a role column or role-gated UI without an explicit product decision to do so.

## 2. Tech Stack

- **Next.js (App Router) + TypeScript**
- **Supabase**: Postgres, Auth (email + password only — no magic link, no OAuth; the org's email is on Outlook/Microsoft, not Gmail, so Google OAuth's domain-restriction hint wouldn't even apply), Storage, Realtime
- **HeroUI v3** for all UI — built on Tailwind CSS v4 and React Aria Components, requires React 19+. Verified via the HeroUI MCP server: **v3 does not require a provider** (unlike v2) — components work directly after `npm i @heroui/styles @heroui/react` and adding `@import "@heroui/styles";` (after `@import "tailwindcss";`) to `globals.css`. Use `list_components`/`get_component_docs` from the HeroUI MCP before using any component — v3 is beta and uses compound patterns (e.g. `Card.Header`) different from v2's flat props.
- **Light mode only.** The entire app (admin panel and public form UI) is locked to HeroUI's default light theme — there is no dark theme and no theme toggle. `app/layout.tsx` pins this explicitly (`<html class="light" data-theme="light">`, body using `bg-background text-foreground`) rather than leaving it to `prefers-color-scheme`, because HeroUI's own docs note its theming system otherwise "automatically switches between light and dark themes." `globals.css` must never reintroduce a `prefers-color-scheme: dark` override or redefine `--background`/`--foreground` — those regressed once already when carried over from the default `create-next-app` template (its media-query dark override fought with HeroUI's token system) and were removed for exactly this reason.
- Node.js backend via Next.js **Server Actions** (default mutation path) and route handlers (only for things Server Actions can't do, e.g. webhooks)
- **Self-hosted** deployment on the foundation's own server (Docker/PM2 + Nginx + Let's Encrypt), as a subdomain of `jaipurrugs.org` — not Vercel
- Schema managed via Supabase MCP connector + SQL files committed under `supabase/migrations/`

## 3. Folder Structure

```
src/
  app/
    (public)/f/[shareToken]/page.tsx       # anonymous form fill, no auth
    (admin)/{dashboard,forms,team}/...      # gated by proxy.ts + RLS, shares one nav-shell layout
    auth/{login,callback,blocked}/          # email+password sign in/up (single flow), confirmation callback, deny wall
  components/{ui,admin,public-form,providers}/  # providers/ is for app-wide client providers we add later
                                                  # (e.g. React Query) — HeroUI v3 itself needs no provider
  lib/
    supabase/{server,client,admin,proxy}.ts  # 4 factories; admin.ts is server-only, service-role;
                                              # proxy.ts holds the updateSession() helper proxy.ts calls
    auth/session.ts                          # getCurrentUser() / requireActiveTeamMember() server helpers
    actions/{forms,submissions,team,auth}.ts # server actions, grouped by domain
    forms/field-types.ts                     # single source of truth: field-type registry
  proxy.ts                                   # (admin)-only session + whitelist gate (Next.js 16: renamed from middleware.ts)
supabase/
  migrations/                                # one .sql file per schema change, incl. RLS
docs/phases/                                 # phase-by-phase scope, do's, don'ts
```

- The before-user-created Auth Hook (see §7) is a Postgres function created by migration, but **enabling** it as the active hook is a manual step in the Supabase Dashboard (Authentication → Hooks) — there is no CLI/MCP/config.toml way to do this, so `supabase/config.toml` isn't used for it here.
- **Email confirmation must be disabled** (Dashboard → Authentication → Providers → Email → "Confirm email" off) for the single sign-in-creates-account flow in §7 to work — otherwise a whitelisted email's first visit gets stuck waiting on a confirmation email instead of signing straight in. Also not settable via CLI/MCP.

- New admin pages go under `app/(admin)/<feature>/page.tsx` — never outside the `(admin)` group, or the whitelist middleware guard is bypassed.
- New public-facing routes go under `app/(public)/` only, and must never import from `lib/actions/team.ts` or any other whitelist/admin-only server action.

## 4. Naming Conventions

- Tables: `snake_case`, plural domain nouns (`forms`, `form_fields`, `form_submissions`, `form_answers`, `team_members`).
- Server actions: `verbNoun`, colocated by domain in `lib/actions/<domain>.ts` (e.g. `createForm`, `publishForm`, `addTeamMember`, `removeTeamMember`, `signIn`, `signUp`, `signOut`).
- Components: PascalCase files matching the export name; HeroUI wrappers live in `components/ui/` named the same as the HeroUI primitive they wrap.
- Route handlers only under `app/api/`, named by the external system they serve (e.g. `app/api/webhooks/resend/route.ts`).

## 5. Do's

- **Do** use Server Actions for every mutation that touches Supabase. Route handlers are reserved for webhooks/third-party callbacks only.
- **Do** use HeroUI components for anything HeroUI already provides (inputs, modals, tables, dropdowns, toasts) instead of hand-rolling equivalents.
- **Do** put all Supabase client creation behind `lib/supabase/{server,client,admin}.ts` — never call `createClient` ad hoc in a component or action.
- **Do** enforce `team_members.status = 'active'` via RLS (`public.is_active_team_member()`) on every admin-owned table, not just in `proxy.ts` — `proxy.ts` is a UX guard, RLS is the real boundary.
- **Do** write one migration per schema change under `supabase/migrations/`, applied via the Supabase MCP connection, and commit the corresponding SQL for version history regardless of how it was applied.
- **Do** keep all field-type rendering/validation/config logic in the single shared registry (`lib/forms/field-types.ts`), imported by the editor, the public renderer, and the metrics dashboard.
- **Do** use short-lived signed URLs for any admin access to files in the private `form-uploads` / `admin-assets` buckets — never make those buckets public. (`form-assets`, holding logos/cover/section images, is the intentional exception — see §7.)
- **Do** treat every field's `position` as a fractional index — reordering updates exactly one row, never a full renumbering pass.
- **Do** save historical answers with a `field_snapshot` so metrics and exports stay correct even after a field's label/type is edited later.
- **Do** keep the app pinned to light mode only (`<html class="light" data-theme="light">` in `app/layout.tsx`) — see §2.

## 6. Don'ts

- **Don't** use the Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY`) in any file importable from a Client Component or from anything under `app/(public)/`. It only belongs in narrowly-scoped server-only modules (`lib/supabase/admin.ts`) for specific privileged operations (anonymous-submission file-upload proxying, whitelist seeding).
- **Don't** bypass RLS "because `proxy.ts` already checked it." Every new admin-owned table needs its own RLS policy gated on `public.is_active_team_member()` — don't assume an existing table's policy covers a new one.
- **Don't** build a second whitelist-adjacent mechanism (hardcoded email lists, `.env` allowlists). `team_members` is the single source of truth.
- **Don't** introduce a second client-side data-fetching library alongside React Query (no SWR, no ad hoc `useEffect` + `fetch` for admin data).
- **Don't** hand-edit the live Supabase schema via the dashboard for anything that ships — every schema change is a migration file, reviewed like code.
- **Don't** normalize field config into per-type tables. Config is JSONB on `form_fields`, validated in the app layer by the field-type registry, specifically so new field types are a TypeScript addition, not a migration.
- **Don't** add a side panel/drawer for field configuration in the form editor. Field settings render inline, in the field's own card, by design.
- **Don't** add any Vercel-specific configuration or assume a Vercel-only feature is available — this app is self-hosted.
- **Don't** add dark mode, a theme toggle, `next-themes`, or a `prefers-color-scheme` media query anywhere in the app — it is light-mode only, by design, everywhere (admin and public surfaces alike).

## 7. Security Rules — Auth & Whitelist

- **Auth method: Supabase Auth email + password only.** No magic link, no OAuth provider, and **no separate sign-up UI** — `/auth/login` has one form (email + password, one button). The `signIn` server action tries `signInWithPassword` first; if that fails, it tries `signUp` with the same credentials, which only succeeds when no account exists yet (Supabase's `signUp` on an already-registered email fails distinctly) — so a whitelisted email's first-ever visit creates its account with whatever password it enters, and every visit after that just signs in. This depends on the project having **email confirmation disabled** (see the manual Dashboard step below) — with it enabled, a first-time visit would get stuck on "check your email" instead of signing straight in.
- Whitelist enforcement is layered, and all layers must exist before auth is considered done:
  1. A Postgres "before user created" Auth Hook (`public.hook_restrict_signup_to_active_team_members`) rejects account creation (`supabase.auth.signUp`) outright with HTTP 403 unless `team_members.status = 'active'` for that email. An unauthorized email never gets an `auth.users` row. **This hook must be manually enabled once** in the Supabase Dashboard (Authentication → Hooks → Before User Created → select the function) — there is no CLI/MCP call that does this.
  2. `proxy.ts` re-validates the session via `supabase.auth.getClaims()` (never `getSession()` — it doesn't guarantee JWT revalidation) on every request under the real admin paths (`/dashboard`, `/forms`, `/team` — **not** the `(admin)` route-group syntax, which doesn't appear in the actual URL and would never match). It then queries `team_members` for that email; RLS means this query naturally returns zero rows for anyone not an active member, so "no row back" is sufficient to redirect to `/auth/blocked` and sign the user out. This is what catches a user deactivated after their session was already issued (the hook only fires once, at account creation).
  3. RLS on every admin-owned table via `public.is_active_team_member()`, so even a valid session for a since-deactivated user is refused at the query level, independent of proxy.ts.
- `team_members` has **no roles**. Any row with `status = 'active'` can read and write the entire `team_members` table (add, reactivate, deactivate, or permanently delete any row, including in principle its own) — see the single-tier decision in §1.
- **"Remove" is a hard delete**, not a status toggle — `removeTeamMember` issues a real `DELETE`. This is a deliberate simplicity trade-off (no audit trail for removed rows) confirmed for this project; deactivating (status → `inactive`) remains available as the separate, reversible action for temporarily revoking access.

## 8. Schema Migrations

- All schema changes live in `supabase/migrations/*.sql`. Apply via the Supabase MCP connection; commit the SQL in the same PR regardless.
- RLS policy changes are migrations too — never applied ad hoc via the dashboard SQL editor for anything beyond throwaway local testing.
- Regenerate `lib/types/supabase.ts` (`supabase gen types typescript`) after every migration that changes a table shape, and commit it in the same PR as the migration.

## 9. Phase Overview

Detailed scope, do's, and don'ts for each phase live in `docs/phases/`. This table is the map.

| Phase | Scope | Touches | Doc |
|---|---|---|---|
| 0 | Scaffold Next.js/TS/Tailwind/HeroUI v3, connect Supabase via MCP, base folders | Repo setup, build config | [docs/phases/00-scaffold.md](docs/phases/00-scaffold.md) |
| 1 | Whitelist table (single-tier), auth hook, `proxy.ts`, RLS, email+password auth, admin nav shell + `/team` UI | Auth, admin gate, nav shell | [docs/phases/01-auth-whitelist.md](docs/phases/01-auth-whitelist.md) |
| 2 | `forms`/`form_fields` schema + RLS, forms list, blank-form creation | Admin — Forms list, DB core | [docs/phases/02-forms-schema-admin-crud.md](docs/phases/02-forms-schema-admin-crud.md) |
| 3 | Field-type registry, inline no-side-panel editor canvas, autosave | Admin — Form editor | [docs/phases/03-field-registry-editor.md](docs/phases/03-field-registry-editor.md) |
| 4 | Logo/cover image, per-section background + form-wide default, `form-assets` bucket | Admin — Form editor, Storage | [docs/phases/04-visual-asset-management.md](docs/phases/04-visual-asset-management.md) |
| 5 | `form_submissions`/`form_answers` schema + RLS, public renderer, progressive save | Public form-fill surface | [docs/phases/05-public-renderer-submissions.md](docs/phases/05-public-renderer-submissions.md) |
| 6 | Submissions table + CSV export + Realtime, per-field metrics dashboard | Admin — Submissions, Metrics | [docs/phases/06-submissions-metrics.md](docs/phases/06-submissions-metrics.md) |
| 7 | Publish flow, form settings, signed URLs, Docker/Nginx/DNS, CI/CD | Deployment, polish | [docs/phases/07-polish-deploy.md](docs/phases/07-polish-deploy.md) |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
