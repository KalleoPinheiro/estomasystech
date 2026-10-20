---
title: "ADR 046 — Cobertura de 100% nas camadas de regra; UI coberta por E2E"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/engineering/conventions.md]
---

# ADR 046 — Cobertura de 100% nas camadas de regra; UI coberta por E2E

- **Data:** 2026-10-20
- **Status:** aceito (issue #405; decisão de @KalleoPinheiro registrada na issue)
- **Domínios afetados:** engenharia (testes)

## Contexto

O limiar de 90% deixava 3% das linhas e 8% dos ramos sem teste, justamente nos caminhos de exceção
(dado legado, falha de infraestrutura, papel sem permissão). Partida: 96,97% statements, 92,23% branches.

## Decisão

- **Primeiro marco:** 100% de statements, branches, functions e lines em `src/domain`, `src/application`,
  `src/infrastructure`, `src/lib` e `src/proxy.ts`, descontadas as exclusões já justificadas em
  `vitest.config.mts` (wiring de DI, conexão, schema Drizzle, clientes externos).
- **UI (`src/app/**`, `src/components/**`)** fica a cargo do E2E (ADR-042), não do limiar unitário.
- **Testes verificam regra de negócio** (Dado/Quando/Então), com caso de exceção; nada de teste que só
  executa linha.
- **Código inalcançável é removido ou simplificado, não ignorado.** Não se usa `/* v8 ignore */`.
  Ramo defensivo de dado legado ganha teste com o dado legado.
- **Subir o limiar para 100** em `vitest.config.mts` é edição do dono (regra 8, ADR-042). A proposta
  está no PR; até lá o gate segue em 90%.

## Consequências

- Mudança em camada de regra sem teste de exceção reprova no CI assim que o limiar subir.
- Os testes de cobertura vivem em arquivos próprios (`*-cobertura.test.ts`, `*-bordas.test.ts`), sem
  alterar testes existentes.
