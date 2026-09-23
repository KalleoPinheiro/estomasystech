---
title: "Planning docs"
status: living
audience: [agent, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Planning docs

How phase and initiative planning is organized in `docs/`, and how it relates to `.specs/features/` and the two decision logs. Read this before writing a new PRD, audit, or roadmap entry.

## What lives where

- **`docs/plano-evolucao-faseado.md`** — the master roadmap: a `## Roadmap` section (Now/Next/Later/Entregue, one `RM-NN` row per item, mirrored in the GitHub Project) followed by the per-phase detail. One row per item, links out to each phase's PRD and `.specs/` execution folder. This is the entry point: start here to see what's delivered, specified, or still backlog.
- **`docs/product/`** — one PRD per phase (`prd-fase-N.md`), written **only when a phase requires an explicit product/business decision** (scope, priority, a trade-off the user made, not the engineering team). See "When a phase does NOT get a PRD" below.
- **`docs/audits/`** — raw audit/analysis findings (security, UX, design-system gaps). These are **input** to planning, not a work request by themselves: an audit's findings get triaged into a phase (with a PRD) or a standalone `.specs/features/` entry, never executed directly off the audit doc.
- **`docs/adr/`** — durable architecture/domain decisions. Owned by the `domain-modeling` skill. See "Two decision logs" below.
- **`docs/domains/<slug>/`** — the *living* description of how each business domain behaves today: a README per domain plus `features/<feature>.md` specs from `docs/templates/feature-spec.md`. Updated in the same PR that changes behaviour. Not to be confused with `.specs/`, which is frozen execution history.
- **`.specs/features/<slug>/`** — execution-level spec/design/tasks/validation for one feature or initiative. Owned by the `tlc-spec-driven` skill; naming and structure there are fixed by that skill's tooling — don't reorganize it from here.

## When a phase does NOT get a PRD

Not every unit of work is a numbered "Fase N" with a product decision behind it. Technical initiatives — dependency/security cleanup, a design-system library migration, scanner noise triage — go straight into `.specs/features/<slug>/spec.md` with no matching `docs/product/` file. Examples already in this repo: `still-void-v2-migration`, `still-void-v3.3-adoption`, `ruido-scanners-seguranca`, `auditoria-seguranca-dependencias`.

Write a `docs/product/prd-fase-N.md` only when the initiative involves a genuine product/business choice (pricing, RBAC matrix, what a role can do, a UX trade-off affecting patients or staff) — the kind of decision `.specs/STATE.md`'s AD-003 already commits to never inventing on the team's own authority.

## Two decision logs — don't confuse them

The `AD-NNN` prefix appears in two different files with two different scopes:

- **`docs/adr/NNN-slug.md`** — durable, domain-level architecture decisions (multi-tenancy strategy, authorization model). Created by the `domain-modeling` skill, offered sparingly (hard to reverse + surprising + real trade-off). Long-lived; referenced from `CONTEXT.md`.
- **`.specs/STATE.md` → `### AD-NNN`** — decisions made *during the execution* of one or more features (e.g. "esbuild vulnerabilities accepted, not fixed", "build heap flag pinned at 4096MB"). Owned by `tlc-spec-driven`, scoped to the spec-driven cycle that produced them. Not architecture in the ADR sense — process/implementation calls that would otherwise be re-litigated by the next agent.

If you're about to write a new decision and unsure which log it belongs in: does it change how the *domain/system* is modeled going forward (→ `docs/adr/`), or does it explain a call made *while shipping a specific feature* (→ `.specs/STATE.md`)?

## Naming

- `docs/product/`, `docs/audits/`, `docs/adr/`, `docs/agents/` — `lower-kebab-case.md`.
- Audits keep a date suffix (`auditoria-ux-2026-08.md`) — the name signals "snapshot as of," not a document updated in place.
- `docs/plano-evolucao-faseado.md` is the one file agents should treat as living/updated as phases progress; everything under `docs/audits/` is a frozen snapshot once written.
