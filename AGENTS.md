# AGENTS.md

This file documents Agent skills and how domain documentation should be consumed when working with code in this repository.

## Context

Read @CONTEXT.md.

## Stack

Next.js 16 (App Router), React 19, TypeScript 5, Drizzle ORM + Postgres 16, Tailwind v4. npm, no workspaces.

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `biome check`
- `npm run format` — `biome format --write .`
- `npm run test` / `test:coverage` — vitest, **90% coverage minimum enforced**
- `npm run test:changed` — vitest `--changed` (só testes afetados por diff não commitado; passe um ref, ex. `npm run test:changed -- origin/main`, pra comparar contra outra base); loop local rápido, **não substitui** `test:coverage` como gate — CI sempre roda suite completa
- `npm run test:e2e` — Playwright
- `npm run check:sv` — gate enforcing `@still-void/ui` adoption (see below)
- `npm run db:migrate` — drizzle-kit migrate
- `npm run build` runs with `--max-old-space-size=4096`; don't strip that flag, default heap crashes the build (peaks ~2.5GB)

## Code style

- Biome (`biome.json`) is the single lint + format tool (issue #107, migrated off ESLint): cognitive complexity max 10 (`complexity/noExcessiveCognitiveComplexity`), `max-lines-per-function` 120 (`complexity/noExcessiveLinesPerFunction`, 320 for `.tsx`, off in `tests/**`)
- Gap vs old ESLint config: Biome's complexity rule measures *cognitive* complexity, not cyclomatic — thresholds are comparable but not identical. There is no Biome equivalent of ESLint's `max-depth`; nesting depth is unenforced by the linter
- Unused vars must be prefixed with `_` (Biome ignores `_`-prefixed identifiers by default)
- Suppress a rule inline with `// biome-ignore lint/<category>/<rule>: <reason>`

## @still-void/ui adoption (in progress)

Raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>`, and raw Tailwind color utilities are banned — use `@still-void/ui` components instead. `npm run check:sv` enforces this. A deliberate exception needs a `// sv-gap: <slug>` comment matched by an entry in `docs/still-void-gaps.md`. Migration status/history: `.specs/features/still-void-*-migration/`, `docs/backlog-design-system.md`.

## Tenant scope

Never build `{ clinicId }` by hand for `getRepositories` — it won't compile. Use `sessionScope(guard.session)` for reads, `writeScope(guard.session)` (or `writeClinicId` when you need the id) for writes, `clinicScope(id)` for an explicit clinic. `systemScope()` (cross-clinic) is allowlisted per file in `tests/lib/tenant-scope.test.ts`; adding a use means justifying it there.

## Auth (fails closed)

Every account authenticates with email + its own password (ADR-004) — there is no master password, no email allowlist and no Google login. Without `AUTH_SECRET` the app returns 503 everywhere; `VITTA_ALLOW_OPEN_MODE=true` bypasses this in dev only (ignored in production).

First access is always self-served: creating an account emails an invite link (`/definir-senha?token=…`, 24 h, single use), and `POST /api/auth/forgot-password` issues a 1 h reset link through the same primitive. A fresh install creates its first Super Admin via `POST /api/auth/bootstrap`, guarded by the `VITTA_BOOTSTRAP_TOKEN` header **and** by there being zero accounts.

In production, missing `RESEND_API_KEY`/`EMAIL_FROM` fails at gateway construction with an explicit error — outside production the null gateway logs the link instead of sending (dry-run).

Google Calendar sync is an integration, not a login: `/api/integrations/google-calendar` starts a dedicated OAuth flow from an already-authenticated staff session and never touches the session cookie.

## Env vars

`DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`, `VITTA_BOOTSTRAP_TOKEN`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Calendar OAuth only), `TZ` (business hours validated in local time), `CRON_SECRET`, `API_RATE_LIMIT_MAX`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`PRIVATE_KEY`/`CALENDAR_ID`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `KalleoPinheiro/vitta-flow`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Planning docs

Where phase/product/audit planning lives in `docs/`, and how it relates to `.specs/features/` and the two decision logs (`docs/adr/` vs `.specs/STATE.md`). See `docs/agents/planning.md`.

### Fixing a subset of audit issues end-to-end

Repeatable pipeline for "specify and fix only issues N and M [from an audit/plan phase]": spec → branch from updated main → implement → update living docs → PR → track CodeRabbit → squash merge → close issues linking the fix → record in `.specs/STATE.md`. See `docs/agents/fix-audit-issues.md`.
