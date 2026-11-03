# ADR-093 quando o CI roda verification

**Verdict**: PASS
**Mutations**: 3 - probed C5, C6, C5
**Proofs**: `proofs.md` at fcc7cc30
**Verifier**: independent sub-agent (author != verifier)

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| Conferir accepts `politica=failure` and C5 stays green | mutation `conferir aceita politica failure` not killed (`gate-pr.yml:253`). The rows `politica failure`, `cancelled` and `skipped` set `COMPLETO: ''` (`gate-pr-workflow.test.ts:169`), so they already exit 1 on `[ "$COMPLETO" != true ]`. C5's "política success" clause is not what fails those rows. | Add a row with `R_POLITICA=failure`, `COMPLETO=true`, impacto and the heavy jobs `success`, and assert exit 1. Do the same for `cancelled` and `skipped`. | 694d9c7d |
| Inverting the ci.yml draft guard stays green | mutation `ci trata rascunho como pronto` not killed (`ci.yml:96`): `[ "$DRAFT" = true ]` became `[ "$DRAFT" = false ]`. C6 asserts `escopo` contains the substring `completo=` (`gate-pr-workflow.test.ts:324`) and that the error phrase sits before `run: npm run build` (lines 326-328). It never runs the draft bash and never asserts exit 1. `cobertura-shard` is checked for `pesado == 'true'` (lines 332-334), so a draft that still sets `pesado=true` stays green. | Run the escopo snippet with `EVENTO=pull_request` and `DRAFT=true` and assert `completo=false` and `pesado=false`. Run the `ci` guard with `COMPLETO` other than `true` and assert exit 1 before the build. | 694d9c7d |
| The C5 oracle accepts `COMPLETO=false` | mutation `oraculo aceita COMPLETO false` not killed (`gate-pr-workflow.test.ts:116`). `esperado()` is only called from the 64-cell loop, which spreads `pronto` (`COMPLETO: 'true'`, lines 176-185). The draft rows hardcode `esperado: 1`. | Derive every row's expected code from `esperado()`, including the draft and política rows, so loosening the `COMPLETO !== 'true'` clause fails C5. | 694d9c7d |
| C5 does not hold "impacto success" | The only row with `R_IMPACTO=failure` (`gate-pr-workflow.test.ts:204-213`) also sets integração and both E2E to `skipped` while `SO_DOC` is false and `RODAR_E2E` is true. Deleting `[ "$R_IMPACTO" = success ]` still exits 1, because `conferir` rejects those skips. Throwaway at HEAD: original exit 1, guard removed exit 1. | A row with `R_IMPACTO=failure` and the heavy jobs `success` must exit 1. | 694d9c7d |
| C4 does not hold that `politica` is in `needs` | `gate-pr-workflow.test.ts:294` is `toContain('politica')`. The agregador block also contains `needs.politica.result` and `::error::politica`, so dropping `politica` from `needs: [...]` stays green. | Assert the `needs` list includes `politica`, for example `/needs:\s*\[[^\]]*politica/`. | 694d9c7d |

Own examples at HEAD, both fail closed (exit 1), so they are not findings: `COMPLETO=TRUE` prints the draft phrase; `R_POLITICA=success`, `COMPLETO=true`, `R_IMPACTO` empty, heavy jobs `success` prints `impacto:`.
