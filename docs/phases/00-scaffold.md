# Phase 0 — Scaffold

See [AGENTS.md](../../AGENTS.md) for project-wide conventions this phase establishes the foundation for.

## Scope

- Scaffold Next.js (App Router) + TypeScript + Tailwind CSS v4 via `create-next-app` (`src/` directory, `@/*` import alias, ESLint enabled).
- Install and wire HeroUI v3: `npm i @heroui/styles @heroui/react`, then add `@import "@heroui/styles";` to `globals.css` immediately after `@import "tailwindcss";` (import order matters). **No provider component is needed** — this was corrected after verifying against the HeroUI v3 MCP docs (v3 dropped the provider requirement that v2 had); components work directly once installed and the stylesheet is imported.
- Pin the app to **light mode only**: `<html class="light" data-theme="light">` and `<body className="bg-background text-foreground">` in `app/layout.tsx`, per HeroUI's documented theming Quick Start. Remove the `create-next-app` template's own `:root`/`--background`/`--foreground` redefinition and its `prefers-color-scheme: dark` media query from `globals.css` entirely — left in place, it fights with HeroUI's token system and flips the raw page background dark under an OS dark preference even though HeroUI components stay light, since HeroUI itself only switches theme via the `.dark`/`[data-theme="dark"]` class, not automatically via `prefers-color-scheme`. There is no dark theme and no theme toggle anywhere in this app — not deferred, not planned.
- Connect the project's Supabase instance via the Supabase MCP connector.
- Lay down the base folder structure (`app/(public)`, `app/(admin)`, `components/`, `lib/supabase`, `lib/auth`, `lib/actions`, `lib/forms`, `proxy.ts`) with placeholder files only — no feature logic yet. Note: Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (function renamed `middleware` → `proxy`); this project uses the new name throughout.
- Configure `next.config.ts` with `output: 'standalone'` for self-hosted deployment (see Phase 7).
- Create root `AGENTS.md` and `docs/phases/` (this phase produces the documentation set, not application code).

## Do's

- Verify HeroUI v3's current documentation/component list directly via its MCP server (`get_docs`, `list_components`, `get_component_docs`) before using any component — it's beta, uses compound patterns (e.g. `Card.Header`) different from v2's flat props, and its own docs are the only authoritative source (don't rely on v2-era knowledge).
- Import `@heroui/react` components directly — the package is the single source; there is no per-component CLI "add" step in v3 (that's a v2 pattern). The v3 CLI (`heroui-cli`) is for project init/install/upgrade/doctor, not per-component installation.
- Settle the folder structure and naming conventions (per AGENTS.md §3–4) before any feature route is written.
- Set `output: 'standalone'` from the start so the self-hosting path (Phase 7) isn't a retrofit.
- Verify the light-mode lock actually holds by emulating a dark OS/browser color-scheme preference (e.g. Playwright `colorScheme: 'dark'`) and confirming the rendered background stays light — don't just eyeball it once under your own (possibly light) OS setting.

## Don'ts

- Don't add a `HeroUIProvider` (or any wrapper) under the assumption v3 needs one — it doesn't. Confirm against current docs if this ever seems to be causing an issue rather than re-adding one reflexively.
- Don't add any Vercel-specific configuration (this app is self-hosted — see Phase 7).
- Don't start writing feature routes/pages before the folder and naming conventions are settled.
- Don't leave the `create-next-app` template's default dark-mode CSS in place "since it's just boilerplate" — it silently reintroduces exactly the dark-mode behavior this project explicitly rejects.

## Definition of Done

`npm run dev` runs cleanly; a HeroUI component renders correctly from both a Server Component page and a Client Component (verified via `src/app/page.tsx` + `src/components/ui/heroui-smoke-test.tsx`); the app stays visibly light-themed even when the browser/OS is emulated with a dark color-scheme preference; the Supabase MCP connection is verified working; the base folder tree and root `AGENTS.md` exist in the repo.
