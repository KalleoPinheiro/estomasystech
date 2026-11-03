# ADR-093 quando o CI roda — checks

Mutations: 3
Build: `npm run typecheck`; `npm run lint`
Plan: `.specs/features/adr-093-quando-ci/plan.md`

## Intent

O pipeline pesado do Actions deixa de rodar em PR rascunho para `release/**`. O agregador "Gate do PR" e o job `ci` reprovam de propósito nesse estado. Mutação sai do PR. Todo job de `ci.yml`, `gate-pr.yml`, `recibo-gate.yml` e `mutacao-mensal.yml` ganha `timeout-minutes`. `ubuntu-slim` fica só nos jobs leves nomeados.

<8 checks in 1 slice · 1 one-way door (fail-closed no SHA do rascunho) · 0 open>

## Checks

### S1 - Política de quando o Actions roda

**C1** - O gatilho `pull_request` de `gate-pr.yml` e de `ci.yml` inclui `ready_for_review` e não inclui `labeled`, `edited` nem `paths`
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C1 "`

**C2** - Cada job de `ci.yml`, `gate-pr.yml`, `recibo-gate.yml` e `mutacao-mensal.yml` tem `timeout-minutes` no valor da tabela do ADR-093 (mutação mensal completa em 120, porque 40 cortaria a rodada de ~80 min)
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C2 "`

**C3** - `ubuntu-slim` só em `politica`, agregador `gate-pr`, `escopo`, `impacto` e `recibo-gate`; nenhum desses blocos tem `services:` nem `npm run build`
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C3 "`

**C4** - O job `politica` (`ubuntu-slim`, timeout 5) publica `completo`; o agregador "Gate do PR" tem `if: always()`, lista `politica` em `needs` e, com `completo` diferente de `true`, sai 1 com a frase "PR em rascunho: o gate completo roda quando o PR for marcado como pronto"
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C4 "`

**C5** - A matriz do passo Conferir, executada com `child_process` (`bash -e`), tem 0 divergências contra a regra fail-closed (política success, rascunho reprova, impacto success, integração e E2E success ou skipped conforme o impacto)
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C5 "`

**C6** - Em rascunho o `ci.yml` roda o `escopo` em `ubuntu-slim` e o job `ci` em `ubuntu-24.04` reprova no primeiro passo, antes de `npm run build`; `estatico` e `cobertura-shard` não rodam (`completo`)
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C6 "`

**C7** - `gate-pr.yml` não tem job `mutacao` nem `test:mutacao`; `mutacao-mensal.yml` dispara por `workflow_dispatch`
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C7 "`

**C8** - O ADR-093 está em `docs/adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md` e o `AGENTS.md` manda o PR para `release/**` nascer em rascunho, ser marcado pronto uma vez, e registra que "Gate do PR" e `ci` ficam vermelhos de propósito
Proof: `npx vitest run tests/infrastructure/gate-pr-workflow.test.ts -t "C8 "`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| gatilhos pull_request (2) | `gate-pr.yml` C1 · `ci.yml` C1 | - |
| workflows com timeout (4) | `ci.yml` C2 · `gate-pr.yml` C2 · `recibo-gate.yml` C2 · `mutacao-mensal.yml` C2 | - |
| jobs slim (5) | `politica` C3 · `gate-pr` C3 · `escopo` C3 · `impacto` C3 · `recibo-gate` C3 | - |
| resultados do agregador (4) | `success` C5 · `failure` C5 · `cancelled` C5 · `skipped` C5 | - |
| eixos da matriz pronta com E2E (3) | `integracao` C5 · `e2e-prod` C5 · `e2e-dev` C5 | - |
| estados do PR no CI (2) | rascunho reprova C6 · pronto segue para o build C6 | - |

## Swept

- validation: C1
- failure modes: C4
- idempotency: n/a - o mesmo SHA em rascunho não grava sucesso; `ready_for_review` dispara outra rodada
- authorization: n/a - não há papel novo; o gatilho é o estado de rascunho do PR
- concurrency: n/a - `cancel-in-progress` já existia; este ADR não muda o grupo
- data lifecycle: n/a - nenhum dado de clínica é gravado
- dependency failure: C5
- state transitions: C4, C6
- observability: C4

## Handoff

- **Settled mid-build:** o timeout 40 da tabela vale a mutação incremental do PR (máx. 26,9 min), que sai do PR; a rodada completa de `mutacao-mensal.yml` mede ~1h20, então o teto dela fica em 120 (era 180). C43 não trava `runs-on` nem a ordem dos passos: o job `ci` permanece em `ubuntu-24.04` porque ainda roda `npm run build` quando o PR está pronto.
- **Dispatched:** none
- **Boundary:** none yet
- **Abandoned:** manter o job `mutacao` no `gate-pr.yml` para preservar as 263 combinações do POC — contradiz "mutação sai do PR". A matriz que sobra é o produto dos 4 resultados em integração e nos dois E2E, mais os casos de rascunho, política, impacto, só-doc e sem E2E.
- **Walked:** n/a - sem tela
