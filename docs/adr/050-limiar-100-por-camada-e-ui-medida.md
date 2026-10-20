---
title: "ADR 050 — Limiar de 100% por camada de regra; UI segue medida com piso de 90%"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/046-cobertura-100-nas-camadas-de-regra.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md]
---

# ADR 050 — Limiar de 100% por camada de regra; UI segue medida com piso de 90%

- **Data:** 2026-10-20
- **Status:** aceito (issue #405; decisão de @KalleoPinheiro; substitui, no item da UI, o ADR-046, que é frozen e não se edita)
- **Domínios afetados:** engenharia (testes)

## Contexto

O ADR-046 previa tirar `src/app/**` e `src/components/**` da cobertura unitária e deixar a UI só com
o E2E. As rotas em `src/app/api/**` e as actions fazem checagem de sessão, papel e escopo de empresa
(regras 1 e 2), e o E2E não mede cobertura nem exercita os caminhos de acesso negado. Tirar a UI do
`include` também quase não reduz o tempo da suíte: os testes continuam rodando, só deixam de ser medidos.

## Decisão

- **`vitest.config.mts` mantém `src/app/**` e `src/components/**` no `include`.** A UI continua medida.
- **Limiar de 100%** (linhas, funções, branches, statements) por glob em `src/proxy.ts`,
  `src/domain/**`, `src/application/**`, `src/infrastructure/**` e `src/lib/**`.
- **Piso global de 90%** permanece, e vale para o conjunto inteiro, UI incluída. Nada foi baixado.
- Subir o piso da UI é decisão futura do dono; o E2E segue cobrindo os fluxos (ADR-042).

## Consequências

- Mudança em camada de regra sem teste de exceção reprova no CI.
- A UI não é obrigada a 100%, mas uma queda abaixo de 90% no conjunto também reprova.
