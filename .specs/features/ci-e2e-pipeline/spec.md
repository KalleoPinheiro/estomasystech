# CI: rodar E2E no pipeline — Specification

## Problem Statement

`npm run test:e2e` (Playwright, 19 specs) nunca roda no CI (`.github/workflows/ci.yml` só faz typecheck → lint → check:sv → test:coverage). Regressões que só o e2e completo pega (ex.: `session-token.ts`, ver `fundacao-multi-tenancy`) só são detectadas se o dev/agente rodar a suíte manualmente antes do merge. Gap de rigor registrado em `.specs/STATE.md` como AD-022 (decisão de execução aceita, não ADR de domínio).

## Goals

- [ ] E2E (Playwright, 19 specs) roda automaticamente no CI a cada push/PR
- [ ] Tempo/custo de runner medido e documentado antes de mergear
- [ ] AD-022 em `.specs/STATE.md` fechada/atualizada referenciando esta issue como resolução

## Out of Scope

| Feature | Reason |
| --- | --- |
| Paralelizar specs Playwright (`fullyParallel`/`workers > 1`) | PGlite em memória é compartilhado pelo processo do servidor — paralelizar causaria corrida em agenda/estoque. Fora do escopo desta issue (config já documenta essa restrição). |
| Reduzir/cortar specs e2e | Já endereçado na issue #113 (mergeada). Fora de escopo aqui. |
| Cache de dependências Playwright entre runs | Otimização de velocidade, não de rigor — não é o problema desta issue (issue mapa #116 cobre performance). |

---

## Assumptions & Open Questions

| Assumption / decisão | Default escolhido | Racional | Confirmado? |
| --- | --- | --- | --- |
| Job roda em paralelo ao job de CI existente, não sequencial | Job novo separado (`e2e`) no mesmo workflow, sem `needs:` do job `ci` | Minimiza tempo total de pipeline (wall-clock da PR); typecheck/lint/test:coverage e e2e são independentes | y |
| Job de e2e bloqueia merge (obrigatório) ou é informativo | Obrigatório (bloqueia merge), igual aos demais checks | Critério de aceite da issue não pede "informativo"; suíte já é confiável localmente (retries:1 absorve cold-compile do Turbopack) | y |
| Instalação do browser Chromium no runner | `npx playwright install --with-deps chromium` (só chromium, único project configurado) | `playwright.config.ts` define só `projects: [chromium]` — instalar todos os browsers seria desperdício | y |
| Variáveis de ambiente do job | Nenhuma extra além do que `playwright.config.ts` já injeta via `webServer.env` (AUTH_SECRET/ESTOMASYSTECH_BOOTSTRAP_TOKEN ficam nos env do `webServer`, não no shell do CI) | Config já é auto-contida (PGlite em memória, sem serviço externo) — evita duplicar segredos em dois lugares | y |
| Node version do job de e2e | Mesma do job `ci` (`node-version: "24"`) | Consistência entre jobs do mesmo workflow | y |

**Open questions:** nenhuma — todas resolvidas acima.

---

## User Stories

### P1: CI roda a suíte e2e a cada push/PR ⭐ MVP

**User Story**: Como mantenedor do repositório, quero que o CI rode a suíte Playwright automaticamente, para que regressões de fluxo completo sejam pegas antes do merge, sem depender de disciplina manual.

**Why P1**: É o critério de aceite central da issue #115.

**Acceptance Criteria**:

1. WHEN um push ou PR dispara o workflow `ci.yml` THEN o sistema SHALL executar `npm run test:e2e` em um job dedicado (`e2e`)
2. WHEN o job `e2e` roda THEN o sistema SHALL instalar o Chromium do Playwright com dependências de SO antes de rodar os specs
3. WHEN qualquer spec e2e falha THEN o sistema SHALL marcar o job `e2e` como falho e bloquear o merge (branch protection já cobre checks obrigatórios existentes — este passa a ser mais um)
4. WHEN o job `e2e` falha THEN o sistema SHALL publicar o relatório do Playwright (trace/screenshot on-failure, já configurado em `playwright.config.ts`) como artifact do workflow, para diagnóstico sem re-rodar localmente

**Independent Test**: Abrir uma PR com uma falha e2e proposital (ex.: alterar um `expect` de um spec) e confirmar que o job `e2e` falha no GitHub Actions e bloqueia o merge; reverter e confirmar que passa.

---

### P2: Tempo/custo do job é medido e documentado

**User Story**: Como mantenedor, quero saber quanto tempo/custo de runner o job e2e adiciona, para decidir conscientemente antes de mergear (critério de aceite explícito da issue).

**Why P2**: Não bloqueia o P1 tecnicamente, mas é condição de aceite explícita da issue antes do merge — não é "nice to have" adiado, é avaliado durante a implementação desta mesma spec.

**Acceptance Criteria**:

1. WHEN a suíte e2e completa é medida localmente (mesma config do CI, servidor dev + PGlite) THEN o tempo total observado SHALL ser registrado no PR/`.specs/STATE.md`
2. WHEN o PR desta feature é aberto THEN a descrição SHALL citar o tempo medido do job `e2e` no Actions (wall-clock), para comparação com o baseline local

**Independent Test**: Ler o tempo do job `e2e` no run do Actions da PR e conferir que bate com a ordem de grandeza medida localmente.

---

### P3: AD-022 fechada

**User Story**: Como mantenedor, quero que a decisão AD-022 seja atualizada para refletir que o gap foi resolvido, para manter `.specs/STATE.md` como fonte confiável de decisões ativas vs. históricas.

**Why P3**: Housekeeping — não afeta comportamento do sistema, mas é critério de aceite explícito da issue.

**Acceptance Criteria**:

1. WHEN esta feature é implementada e o job `e2e` está verde no CI THEN `.specs/STATE.md` SHALL marcar AD-022 como `Status: resolved` referenciando esta issue/PR

---

## Edge Cases

- WHEN o servidor dev (Turbopack) demora a compilar rotas sob demanda no runner do CI (mais lento que máquina local) THEN o sistema SHALL confiar no `retries: 1` e nos timeouts já configurados em `playwright.config.ts` (60s por teste, 10s por assertion, 120s de boot do webServer) — nenhum ajuste de timeout específico de CI é necessário a priori; se o job flakar por timeout, é achado a tratar durante a implementação, não pré-suposto aqui
- WHEN o job `e2e` roda em paralelo ao job `ci` THEN ambos SHALL ser independentes (sem dependência de artifacts um do outro) — falha em um não impede o outro de rodar
- WHEN não há browsers Playwright em cache no runner THEN o sistema SHALL instalar via `playwright install --with-deps chromium` a cada run (sem cache de binário nesta iteração — otimização de velocidade fica fora de escopo, ver Out of Scope)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CIE2E-01 | P1: CI roda suíte e2e | Execute | Pending |
| CIE2E-02 | P1: CI roda suíte e2e | Execute | Pending |
| CIE2E-03 | P1: CI roda suíte e2e | Execute | Pending |
| CIE2E-04 | P1: CI roda suíte e2e | Execute | Pending |
| CIE2E-05 | P2: Tempo medido | Execute | Pending |
| CIE2E-06 | P2: Tempo medido | Execute | Pending |
| CIE2E-07 | P3: AD-022 fechada | Execute | Pending |

**Coverage:** 7 total, 7 mapeados para execução, 0 sem mapeamento.

---

## Success Criteria

- [ ] Job `e2e` aparece no Actions de toda PR/push em `main` e roda os 19 specs
- [ ] Job falha quando um spec falha (verificado com falha proposital revertida antes do merge final)
- [ ] Tempo do job registrado em `.specs/STATE.md` (AD-022 atualizada)
