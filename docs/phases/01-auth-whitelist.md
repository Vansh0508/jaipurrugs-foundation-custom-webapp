# Phase 1 — Auth & Whitelist

See [AGENTS.md](../../AGENTS.md) §7 for the security rules this phase implements, and §1/§5–6 for related do's/don'ts.

## Scope

- `team_members` table: `email` (unique, case-insensitive), `status` (`active`/`inactive`), timestamps. **No role column** — single tier, every active row has full access (see AGENTS.md §1).
- `public.is_active_team_member()` — a `security definer` SQL function (`set search_path = ''`) that checks `team_members` for `lower(email) = lower(auth.jwt()->>'email')` and `status = 'active'`, returning boolean. This is the one function every RLS policy on admin-owned tables gates on.
- RLS enabled on `team_members` itself: any row where `is_active_team_member()` is true can `select`/`insert`/`update`/`delete` — full CRUD, no special-cased owner/admin role.
- `public.hook_restrict_signup_to_active_team_members(event jsonb)` — the Postgres function for Supabase's "Before User Created" Auth Hook. Rejects account creation (HTTP 403) unless the signing-up email is `active` in `team_members`. Granted to `supabase_auth_admin`, revoked from `authenticated`/`anon`/`public` (the documented Supabase pattern). **Enabling it as the active hook is a manual one-time step in the Supabase Dashboard** (Authentication → Hooks (Beta) → Before User Created → select this function) — there is no CLI/MCP/migration way to flip that switch.
- A seed row inserting the first active team member directly (migrations run outside RLS, so this is the one place a whitelist row can be created before anyone is active) — otherwise nobody could ever pass the RLS check to add the first row.
- `@supabase/ssr` + `@supabase/supabase-js` wired per Supabase's current official Next.js pattern: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (Server Components/Actions, cookie-based), `lib/supabase/admin.ts` (service-role, server-only), `lib/supabase/proxy.ts` (the `updateSession()` helper `proxy.ts` calls).
- `src/proxy.ts` — refreshes the session via `supabase.auth.getClaims()` (**not** `getSession()`, which Supabase's own docs warn is not guaranteed to revalidate the JWT) and, for requests under the real admin paths (`/dashboard`, `/forms`, `/team` — route groups like `(admin)` don't appear in the actual URL, so the matcher must list real paths), checks `team_members` status and redirects to `/auth/blocked` (signing the user out first) if the row is missing/inactive.
- `app/auth/login/page.tsx` — **one form, one button, no sign-up UI.** Email + password only. The `signIn` server action (`lib/actions/auth.ts`) tries `signInWithPassword` first, and only on failure tries `signUp` with the same credentials — which succeeds only when the account doesn't exist yet, i.e. a whitelisted email's first-ever visit. Password field uses HeroUI's documented `InputGroup` "Password Toggle" pattern (an eye/eye-slash icon button in the suffix flipping `type="password"` ↔ `type="text"`).
- `app/auth/callback/route.ts` — exchanges a confirmation-link code for a session (PKCE `exchangeCodeForSession`), kept as a fallback in case email confirmation is ever re-enabled; unused in the normal flow once confirmation is off (see Do's).
- `app/auth/blocked/page.tsx` — deny wall.
- **Admin nav shell**: `app/(admin)/layout.tsx` becomes a real layout (sidebar with the org logo, Dashboard/Forms/Team links, current user's email, a Sign out button) wrapping every admin page — not the placeholder passthrough from Phase 0. `components/ui/org-logo.tsx` renders the Jaipur Rugs Foundation logo (a plain `<img>` from `https://www.jaipurrugs.org/svg/Logo.svg` — external SVG, no local optimization to gain from `next/image`), reused on both `/auth/login` and the admin shell.
- `app/(admin)/team/page.tsx` — the whitelist management UI: a table of members (email, status, remove button) plus an add-member form (email + initial status). Server actions in `lib/actions/team.ts`: `addTeamMember`, `setTeamMemberStatus`, `removeTeamMember` (hard delete — see below). Auth actions (`signIn`, `signOut`) live in `lib/actions/auth.ts`.

## Do's

- Implement all three enforcement layers — hook, `proxy.ts`, RLS — before considering this phase done, and test with a non-whitelisted email before building anything downstream of auth.
- Use `supabase.auth.getClaims()` in `proxy.ts`/server code to validate the session — it checks the JWT signature every time. Never trust `getSession()` for authorization decisions in server code.
- Use real URL paths in the `proxy.ts` matcher (`/dashboard/:path*`, `/forms/:path*`, `/team/:path*`), not the `(admin)` route-group syntax — route groups are a file-organization concept and never appear in the actual request path.
- Keep `team_members` as the single source of truth for both "can sign up at all" (the hook) and "can currently use the app" (RLS + `proxy.ts`).
- Remember `removeTeamMember` is a real `DELETE` per the confirmed design (see AGENTS.md §7) — build the UI's confirmation dialog (HeroUI `AlertDialog`, danger status) accordingly, since this action is irreversible.
- **Disable "Confirm email" in the Supabase Dashboard** (Authentication → Providers → Email). Without this, a whitelisted email's first-ever sign-in attempt creates the account but comes back with "check your email" instead of a session — the single-flow UX depends on confirmation being off.

## Don'ts

- Don't add magic link or any OAuth provider (Google, etc.) — email + password only, per the confirmed design.
- Don't add a separate "Create account" tab, button, or page — there is exactly one form and one action (`signIn`); it decides internally whether to sign in or create the account, so the user never has to choose.
- Don't add a role column, a `super_admin` concept, or any role-gated UI — every active team member has equal, full access, including to team management itself.
- Don't treat `proxy.ts` as the security boundary — it's a UX redirect. A deactivated user's still-valid JWT can still call a server action directly; RLS is what actually stops that.
- Don't build a separate "invite" step distinct from adding the row as `active` — the row being `active` is what lets the person create their own password on next visit to `/auth/login`; there's no separate invitation email to send in v1.
- Don't assume the before-user-created hook is live just because the migration ran — it still needs the manual Dashboard step to actually be selected as the active hook.

## Definition of Done

Attempting to sign in with a non-whitelisted email at `/auth/login` (which internally attempts account creation, since no account exists yet) is hard-blocked (via the hook once enabled in the Dashboard) with no `auth.users` row created. A whitelisted email's first visit creates the account and lands directly in the admin nav shell (no email round-trip, given confirmation is disabled per the Do's above); every visit after that signs in with the same form. Deactivating an already-logged-in user causes their very next admin request (not just their next login) to redirect to `/auth/blocked`. Removing a team member deletes the row outright (verified via direct query). A direct RLS spot-check (a non-whitelisted test JWT) confirms `team_members` access is denied independent of the UI. The admin nav shell renders the org logo, Dashboard/Forms/Team links, and a working sign-out on every admin page.
