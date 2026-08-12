# Phase 7 — Polish & Deploy

See [AGENTS.md](../../AGENTS.md) §2 — this phase is where the self-hosted deployment model becomes real.

## Scope

- Publish/unpublish flow: `forms.status` transitions, `published_at`/`closed_at` handling, copy-link UX.
- Form settings: success message, redirect URL, close date, submission limit — all in `forms.settings`.
- Signed-URL file access for admins viewing `form-uploads` attachments in the submissions view, gated by the same role checks as the rest of the admin surface.
- Self-hosted deployment: `next build` with `output: 'standalone'`, running under Docker (preferred) or PM2/systemd, behind Nginx (or the server's existing reverse proxy) terminating TLS via Let's Encrypt/Certbot for the chosen `*.jaipurrugs.org` subdomain, with an A/CNAME record in the `jaipurrugs.org` DNS zone.
- A staging environment: separate Supabase project (or schema) and a staging subdomain (e.g. `staging-forms.jaipurrugs.org`), so schema/UI changes are never tested directly against production submission data.
- A CI/CD pipeline (e.g. GitHub Actions) building the standalone bundle/Docker image on push to `main` and deploying to the target server — exact mechanism depends on the access the foundation's server exposes; confirm with whoever manages it before building the pipeline.

## Do's

- Stand up staging (separate Supabase project/schema + separate subdomain) before touching production DNS or running schema changes against production.
- Verify the standalone build runs correctly behind Nginx/TLS in staging before cutting production DNS over.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and other secrets server-only, injected via environment variables on the host — never bundled into the client build, on any environment.

## Don'ts

- Don't point production DNS at the server before the reverse proxy and TLS cert are verified working end-to-end.
- Don't test schema or UI changes directly against production Supabase data — use staging first.
- Don't introduce Vercel-specific assumptions at this stage either — the standalone build must run as a plain Node process/Docker container.

## Definition of Done

The standalone build (`next build && node .next/standalone/server.js`) starts locally without any Vercel-specific dependency. The same container/process serves correctly behind Nginx on the staging subdomain with a valid TLS certificate. Publish/unpublish, form settings, and signed-URL file access all work end-to-end in staging before production DNS is pointed at the server.
