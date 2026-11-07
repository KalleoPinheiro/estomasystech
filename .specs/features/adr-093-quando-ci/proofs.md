# adr-093-quando-ci proofs

**HEAD**: 694d9c7d
**Tree**: clean
**Result**: 10 pass, 0 fail; mutations 3 killed, 0 not

| Check | Proof | Ran | Passed | Result |
| --- | --- | --- | --- | --- |
| C1 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C1 "` | 1 | 1 | pass |
| C2 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C2 "` | 1 | 1 | pass |
| C3 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C3 "` | 1 | 1 | pass |
| C4 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C4 "` | 1 | 1 | pass |
| C5 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C5 "` | 1 | 1 | pass |
| C6 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C6 "` | 1 | 1 | pass |
| C7 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C7 "` | 1 | 1 | pass |
| C8 | `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C8 "` | 1 | 1 | pass |
| Build | `npm run typecheck` | - | - | pass |
| Build | `npm run lint` | - | - | pass |

## Mutations

| Mutation | Location | Killed |
| --- | --- | --- |
| conferir aceita politica failure | `.github/workflows/gate-pr.yml:253` | yes |
| ci trata rascunho como pronto | `.github/workflows/ci.yml:96` | yes |
| oraculo aceita COMPLETO false | `tests/infrastructure/gate-pr-workflow.test.ts:122` | yes |
