---
title: Validation — Auditoria transacional na criação de clínica e no convite de admin (#243)
status: verified
issue: 243
verified_by: independent verifier (author != verifier)
commit: cdbbf1e387aa9756345ac1f8e43ecc2a31172474
branch: fix/243-audit-write-ahead-clinics (base: origin/main)
date: 2026-09-28
---

# Validation Report — fix-243-audit-write-ahead-clinics

## Verdict: PASS ✅

Single commit `cdbbf1e` on `fix/243-audit-write-ahead-clinics`, branched from
`origin/main`. Diff scope: `src/app/api/platform/clinics/route.ts`,
`src/app/api/platform/clinics/[id]/admins/route.ts`,
`src/application/platform/create-clinic.ts`,
`src/application/platform/manage-clinic-admins.ts`,
`src/application/ports/clinic-provisioning.ts`,
`src/application/ports/transaction-manager.ts`,
`src/infrastructure/persistence/drizzle/drizzle-clinic-provisioning.ts`,
`src/infrastructure/persistence/drizzle/drizzle-transaction-manager.ts`,
plus `tests/api/platform-clinics.test.ts`,
`tests/api/platform-clinic-admins.test.ts`,
`tests/application/sell-session-package.test.ts` (port-scope update only).

---

## A. Spec-anchored coverage check

All 8 acceptance criteria (AUD243-01..08) have an exact test whose assertion
matches the spec-defined expected outcome — not just proximity.

| AC | Story | file:line | Assertion | Spec outcome | Status |
| --- | --- | --- | --- | --- | --- |
| AUD243-01 | P1 Clínica: mesma transação clínica+admin+auditoria | `tests/api/platform-clinics.test.ts:330-357` ("registrar a auditoria da criação") + code inspection of `create-clinic.ts:56-71` (`recordAudit` invoked **inside** `provisioning.run` callback, before it resolves) | After a successful `POST`, both `create/clinic` and `create/account` audit events exist with the right `resourceId`/`clinicId` | Clinic, admin, and both audit events land in the same DB transaction | Met |
| AUD243-02 | P1 Clínica: auditoria falha → 500, nada persistido | `tests/api/platform-clinics.test.ts:284-306` | Mocks `DrizzleAuditEventRepository.prototype.save` to reject; asserts `response.status === 500`, `clinicCount()` unchanged, `clinics.findByCnpj(cnpj) === null`, `accountsAnywhere(email) === []`, and `emails.bodies` has length 0 | 500, no clinic by CNPJ, no account by email | Met — assertion checks persisted state via real repositories, not just status code |
| AUD243-03 | P1 Clínica: invite only after commit; send failure → 200/delivered:false | `tests/api/platform-clinics.test.ts:308-328` | `response.status === 200`, `admin.delivered === false`, clinic and account **are** persisted despite send failure | Invite dispatched post-commit; send failure doesn't roll back, still 200 | Met |
| AUD243-04 | P1 Clínica: events carry `clinicId`, appear in clinic trail (and platform trail, same table) | `tests/api/platform-clinics.test.ts:330-357` | Both events assert `clinicId: clinicId` via `expect.objectContaining` | clinicId set correctly on both events | Met. Note: "platform trail" (B6) is the same `audit_events` table read cross-clinic elsewhere — this fix doesn't touch that read path, so verifying `clinicId` correctness here is sufficient; no separate platform-trail query test exists or is needed |
| AUD243-05 | P1 Admin invite: account + event durable in same tx | `tests/api/platform-clinic-admins.test.ts:265-285` ("registrar auditoria") + code inspection of `manage-clinic-admins.ts:104-123` (`recordAudit` invoked inside `transactions.run` callback) | Audit event for the created account exists with correct `resourceId`/`clinicId`/`actorId` | Account + `create/account` event durable and atomic | Met |
| AUD243-06 | P1 Admin invite: auditoria falha → 500, no account | `tests/api/platform-clinic-admins.test.ts:287-306` | Mocks `DrizzleAuditEventRepository.prototype.save` to reject; asserts `response.status === 500`, `accountsWithEmail(...) === []`, `emails.bodies` length 0 | 500, no account with that email | Met — checks persisted state via repository query, not just status |
| AUD243-07 | P1 Admin invite: send only after persist; send failure → 200/delivered:false | `tests/api/platform-clinic-admins.test.ts:229-263` | `response.status === 200`, `delivered === false`, account **is** persisted (`isActive`, `passwordHash`), and resend flow still works | Send dispatched post-commit; send failure doesn't roll back | Met |
| AUD243-08 | P1 Admin invite: event carries `clinicId`, appears in both trails | `tests/api/platform-clinic-admins.test.ts:265-285` | Event `clinicId: CLINIC_B_ID` asserted | clinicId set correctly | Met, same note as AUD243-04 |

**Spec-precision gap (non-blocking):** the spec's "Independent Test" for the
second user story names `tests/api/platform-clinic-admin-actions.test.ts` as
the target file for the new failure-injection test
(`.specs/features/fix-243-audit-write-ahead-clinics/spec.md`, "Independent
Test" under "P1: Convite de admin adicional"). The author instead added it to
`tests/api/platform-clinic-admins.test.ts`, which is the file that actually
exercises `POST /api/platform/clinics/[id]/admins` (invite) end-to-end;
`platform-clinic-admin-actions.test.ts` covers the other admin actions
(deactivate/reactivate/resend-invite), not invite. This is a naming slip in
the spec, not a coverage gap — the correct route and behavior are tested, and
the Success Criteria checklist (which names both files as "gate" targets, not
as the required home for the new test) is satisfied.

**Coverage: 8/8 ACs matched spec outcome; 1 spec-precision gap flagged (spec
names the wrong test file for the admin-invite story; actual test coverage is
correct and complete).**

---

## B. Discrimination sensor (mutation testing)

All mutations applied to a temporary copy of the working tree, run, observed,
then reverted and re-verified green (byte-identical to `git show HEAD`)
before moving to the next. Working tree is clean of implementation changes at
the end of this exercise (`git status --short` empty for src/).

| # | Mutation | File | Target test | Result |
| --- | --- | --- | --- | --- |
| 1 | Move `recordAudit` invocation for the admin-invite account outside `transactions.run(...)` (mirrors the pre-fix bug: audit after commit, no rollback tie) | `src/application/platform/manage-clinic-admins.ts` (`invite()`) | "Dada a auditoria falhou, Quando convidar, Então nada é gravado — nem a conta, nem o convite sai (#243)" (`tests/api/platform-clinic-admins.test.ts:287`) | **Killed** — test failed (`status: "failed"`) under the mutation; passed again after revert (19/19 green) |
| 2 | Move `recordAudit` invocation for clinic+admin creation outside `this.provisioning.run(...)` (same bug pattern) | `src/application/platform/create-clinic.ts` (`execute()`) | "Dada falha ao gravar a auditoria, Quando criar, Então a falha desfaz clínica e conta juntas (#243)" (`tests/api/platform-clinics.test.ts:284`) | **Killed** — test failed (`expected 8 to be 7`, i.e. clinic count incremented) under the mutation; passed again after revert (20/20 green) |

A first attempt at mutation 1 (wrapping the transaction call in a
try/catch that swallows the audit error and fabricates a return value) did
**not** cleanly kill the target test on its own — a downstream FK-shaped
failure in `sendInvite`/`IssueAuthToken` against the rolled-back (uncommitted)
account happened to also produce a 500, masking the specific defect being
probed. It was discarded in favor of the write-ahead-vs-in-transaction
mutation above, which is a more faithful reproduction of the actual bug this
issue fixes (audit call outside the transaction boundary) and killed the test
unambiguously. Not counted in the final tally; noted here for transparency.

A third mutation (flipping `assertNotSuspended`/scope of the admin audit
event) was skipped as optional — the two required mutations already exercise
the atomicity guarantee end to end for both routes, and the codebase's
existing tests (unchanged by this fix) already cover suspension/incomplete-
registration edge cases separately.

**Sensor: 2/2 mutations killed by the new failure-injection tests.**

---

## C. Payload/conjunction check

Both new failure-injection tests assert on real persisted state, not just
HTTP status:

- `tests/api/platform-clinics.test.ts:284-306` — asserts `response.status`,
  `clinicCount()` (unchanged), `clinics.findByCnpj(cnpj)` (null, via the real
  `DrizzleClinicRepository`), `accountsAnywhere(email)` (empty array, via
  real repository query), and `emails.bodies` (length 0 — invite never sent).
- `tests/api/platform-clinic-admins.test.ts:287-306` — asserts
  `response.status`, `accountsWithEmail(clinicId, email)` (empty array via
  real `UserAccountRepository.findAllByEmail`), and `emails.bodies` (length
  0).

Both go beyond the spec's minimum ("confirmar, via repositórios reais, que
não há clínica com o CNPJ nem conta com o e-mail") by also checking the email
gateway was never invoked, which corroborates that the transaction rolled
back before the post-commit invite step ever ran.

---

## D. Real gate results

Run from `/home/kalleopinheiro/projects/estomasystech/.claude/worktrees/agent-a77ed516786d90a8f`
(no mutations in place; clean tree matching `HEAD`).

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS (no output, `tsc --noEmit` clean) |
| `node_modules/.bin/biome check` | PASS (exit 0) — 2 warnings + 1 info, all in unrelated pre-existing files (`tests/docs/structure.test.ts`, `tests/infrastructure/deploy-config.test.ts`, `tests/infrastructure/drizzle-clinical-inventory.test.ts`), none in the diff |
| `npm run check:sv` | PASS — "OK — adoção do @still-void/ui v2 completa." |
| `npx vitest run tests/api/platform-clinics.test.ts tests/api/platform-clinic-admins.test.ts tests/api/platform-clinic-admin-actions.test.ts tests/application/sell-session-package.test.ts` | PASS — 55/55 tests, 0 failed |

Full `test:coverage` was run by the author (not re-run here per task scope)
and reported 96.5% / 91.55% / 96.03% / 96.86%, all ≥ the 90% gate.

**Gate: 4 checks passed, 0 failed.**

---

## E. Working tree integrity

`git status --short` (run via `/usr/bin/git -C <worktree>`) was empty
throughout, confirmed again after all mutation revert/re-verify cycles. Only
this new file (`validation.md`) is added by this verification pass; no
implementation or test file was left modified.

---

## Summary

The implementation satisfies all 8 acceptance criteria with assertions that
match the spec's expected outcomes at the correct precision (persisted-state
checks, not just status codes). Two independent behavior-level mutations
reproducing the exact pre-fix bug pattern (audit call outside the DB
transaction) were both caught by the new failure-injection tests. All
requested gate checks pass cleanly. One non-blocking spec-precision issue was
found (spec names the wrong test file for the admin-invite story's
Independent Test) — recorded for spec hygiene, not a code or test defect.
