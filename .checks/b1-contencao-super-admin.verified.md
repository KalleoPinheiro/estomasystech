# B1 — Contenção do super_admin · Verification

> **Situação depois do merge (#234):** a condição de fechamento do achado 1 foi cumprida. O dono
> aceitou o comportamento do C24 em 2026-09-27 e o critério 21 foi reescrito em
> `.tasks/b1-contencao-super-admin.md` (Unresolved 5). O veredito abaixo é o da rodada 2, mantido
> como registro; ver o Adendo no fim.

**Verdict**: FAIL, and it now rests on one owner decision. All 28 checks have green proofs with located assertions at b6bca41 (C28 is still author-reported). C24 still departs from criterion 21 of the binding task, and the owner has not accepted that change.
**Profile**: light (no tlc-implement profile in AGENTS.md). Step 1, the Coverage join, the Test-policy verdicts and fault injection did not run.
**Diff range**: 37d013e (origin/main)..b6bca41 (HEAD, `feat/b1-contencao-super-admin`)
**Round**: 2 - scoped (fix diff 6ac41d3..b6bca41: `.checks/b1-contencao-super-admin.md`, `tests/api/platform-clinic-admins.test.ts`, `tests/api/route-guard-conformance.test.ts`, `tests/proxy.test.ts`. No `src/`, `e2e/` or docs change)
**Verifier**: independent sub-agent (author != verifier)

## Binding sources (carried from 6ac41d3, re-judged for C24)

| Source | Opened | Contradiction | Uncovered |
|---|---|---|---|
| `.tasks/b1-contencao-super-admin.md` (criteria 1–24) | yes, unchanged in the fix diff | **C24 still narrows criterion 21.** The criterion says "quando alguém chama `POST /api/admin/taxonomy/import`, então recebe 404". The checklist now records a Landing row (`.checks/b1-contencao-super-admin.md:36`) giving 401 with no session, 403 to the super_admin and 404 to clinic staff, justified as "o critério 21 fala de quem a chamava". The task itself is not amended, and the task says "If a linked document diverges, ask before building". The coordinator says the owner will be asked in the PR | - |
| `.design/portal-super-admin.md` | not binding for the interface (carried) | - | - |

## Proof runs (verified at b6bca41)

- Unit/API, one invocation over 12 files (the 11 from round 1 plus `tests/api/auth-identity.test.ts`) with a `-t` alternation of **every** named proof, including the 4 new names → exit 0, `Test Files 12 passed (12)`, `Tests 389 passed | 372 skipped (761)`. Every pattern matched at least one passing test and none failed:
  - nenhum ator 12 · nenhum papel 1 · recusa SA 1 · recusa empresa 1 · falha sem alterar 2 · SA handler 403: 68
  - proxy SA 403: 1 · identidade 1 · levado a /plataforma 5 · clinic-info 1 · matriz 36 · família platform 5
  - família negada 142 · paciente 70 · **parceiro 70** · redireciona 5 · sem sessão 1 · título 1 · **encerra a sessão 1**
  - cria 1 · sem link 1 · inexistente 1 · **valida o e-mail 8** · repetido 1 · concorrentes 1 · 23505 1 · falha no envio 1 · auditoria 2
  - importa 1 · rota antiga 1 · **o proxy decide pela família 1** · company_admin 403: 1 · ADR-007 test 1 · operador test 1
- `npm run check:docs`: carried from 6ac41d3 (OK). The fix touched no documentation under `docs/` or `CONTEXT.md`.
- E2E: carried from 6ac41d3. My targeted re-run then gave 17 passed. The fix did not touch `e2e/`, `src/` or the Playwright configs. The full suites (C28) remain author-reported (dev 228, prod 26).

## Checks

Rows marked "verified at b6bca41" were re-judged in this round. All other rows are carried from 6ac41d3 with PASS, and their proofs were re-run green at b6bca41.

| Check | Round-2 note | Evidence | Result |
|---|---|---|---|
| C1–C3, C6–C10, C12, C13, C15–C17, C19–C23, C25–C27 | carried from 6ac41d3; proofs re-run green at b6bca41. Citations in untouched files unchanged. `platform-clinic-admins.test.ts` lines after 139 moved by +6 (C19 `:169-173`, C20 `:186-191` / `:211-216`, C21 `:233-252`, C22 `:268-275`) | as in round 1 | PASS |
| C4 | verified at b6bca41. The identity handler proof was added under **C5** in the checklist (`.checks/…md:65`), not under C4 as the round-2 message says. Either placement covers criterion 4's handler clause for `/api/auth/identity` | `route-guard-conformance.test.ts` 403 + message (lines shifted by +4 → `:328`, `:330-332`); `tests/api/auth-identity.test.ts:73-74` `expect(response.status).toBe(403)`; `expect(body.error).toBe('Seu papel não tem acesso a este recurso')` | PASS |
| C5 | verified at b6bca41 (gained the identity proof) | `tests/proxy.test.ts:352-355` (unchanged) + `auth-identity.test.ts:73-74` | PASS |
| C11 | verified at b6bca41. Round-1 finding 5 closed | `tests/api/route-guard-conformance.test.ts:224` `.toBe(403)` + `:225-228` `expect(body.error, …).toBe('Acesso restrito à equipe da clínica')` (patient); `:249` + `:250-253` same for partner. Platform denial for clinic staff at `:328`, `:330-332` | PASS |
| C14 | verified at b6bca41. The logout proof is now named. Round-1 finding 6 (C14 part) closed | `tests/pages/plataforma.test.tsx:34-38` (title, button, no navigation); `:54-57` `expect(push).toHaveBeenCalledWith('/login')`, `expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })`; E2E `e2e/plataforma.spec.ts:37,40` (carried) | PASS |
| C18 | verified at b6bca41. Round-1 finding 2 closed | `tests/api/platform-clinic-admins.test.ts:138-142` adds `` `${'a'.repeat(195)}@b.com` `` (201 characters, well formed) → 400; `:156` `expect(response.status).toBe(status)`. The paired 200-character case (`'a'.repeat(194)@b.com` → 200) makes this row discriminating: only `.max(200)` at `src/app/api/platform/clinics/[id]/admins/route.ts:18` separates them | PASS |
| C24 | verified at b6bca41. The proofs now cover every clause the check claims | `tests/proxy.test.ts:448` `expect(anonymous.status).toBe(401)`; `:453` `expect(operator.status).toBe(403)` (super_admin); `:459` `expect(isNext(admin)).toBe(true)` (company_admin passes through the proxy); `tests/api/platform-taxonomy-import.test.ts:104-107` no route file; `e2e/plataforma.spec.ts:55` `expect(response.status()).toBe(404)` (carried) | PASS on proof. The binding-source finding stands (see Binding sources) |
| C28 | carried from 6ac41d3 | author-reported; dev global-setup independently exercised in round 1 | AUTHOR-REPORTED |

## Criteria → checks coverage (carried from 6ac41d3, updated)

Every criterion 1–24 has at least one check. What changed this round:
- The rows for criteria 4, 9, 12 and 16 are now fully faithful, because round-1 findings 2, 4, 5 and 6 are closed.
- Criterion 21 → C24 is still narrower than the criterion. The check now proves exactly what it claims, but what it claims (404 only for former callers) is not what criterion 21 says (404 for anyone).

## Remaining findings (ranked)

1. **C24 departs from criterion 21, and the owner has not decided on it.** Behaviour at HEAD: no session → 401, super_admin → 403, clinic staff → 404, all proven.
   - The binding task still says every caller gets 404.
   - The divergence is now recorded openly in the checklist's Landing table (`.checks/b1-contencao-super-admin.md:36`), but a checklist row is the author's record, not the owner's.
   - This closes as PASS when the owner accepts it and criterion 21 in `.tasks/b1-contencao-super-admin.md` is amended (or its decision recorded there), or when the proxy is changed to return 404 for everyone.
2. **C28 is author-reported.** The full dev and prod E2E suites were not re-run by the verifier. The prod path (minted `company_admin` cookie) has not been independently exercised.
3. **Minor traceability.**
   - The identity handler proof sits under C5 in the checklist even though it proves the handler clause of criterion 4 / C4. This has no effect on coverage.
   - Carried notes: C1 has no `clinicId: null` row in the use-case table (covered by the matrix proof), and C27's CONTEXT § Access Control assertion is not anchored to that section.

Closed this round: round-1 findings 2 (C18), 4 (C4 identity), 5 (C11 messages) and the C14 part of 6. Finding 1 (C24) is closed on proof but still open on the binding source.

## Gate

`npx vitest run` (12 files, all 34 proof patterns) - 389 passed, 0 failed, at b6bca41 · `npm run check:docs` - OK (carried from 6ac41d3; no docs in the fix diff) · targeted E2E - 17 passed (carried from 6ac41d3; no e2e/src in the fix diff) · full E2E dev/prod - author-reported (228 / 26 passed)

## Adendo (2026-09-27, após o merge do #234)

Registrado pelo autor, sem nova rodada do Verifier (nenhum código mudou):

- **Achado 1 (C24 × critério 21): fechado.** O dono do produto aceitou o comportamento verificado
  (sem sessão `401`, super_admin `403`, equipe da clínica `404`), e o critério 21 foi reescrito para
  descrevê-lo. Os proofs do C24 na rodada 2 já cobrem cada cláusula da nova redação.
- **Achado 2 (C28):** as duas suítes E2E passaram no CI do PR #234 (`E2E (Playwright)` na
  re-execução, depois de uma falha no download de fontes antes de qualquer teste; `Build de
  produção + E2E (next start)` na primeira execução).
- **Achado 3:** notas de rastreabilidade, sem efeito na cobertura; seguem como estão.

