---
title: "ADR 084 — Gate na nuvem: incremental por PR, completo por release"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
related:
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/engineering/gate-na-nuvem.md
---

# ADR 084 — Gate na nuvem: incremental por PR, completo por release

- **Data:** 2026-10-31
- **Status:** aceito (decisão de PO do coordenador, com a autonomia dada por @KalleoPinheiro em
  2026-10-24, sobre o pedido de 2026-10-31: «vc deve conseguir rodar o gate nas threads da nuvem de forma
  autosuficiente», sem VPS e sem créditos extras no Actions). Complementa o [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)
  e o [ADR-071](071-corte-de-release-em-comando-unico.md); não os substitui.
- **Domínios afetados:** engenharia (gate)

## Contexto

O gate dependia do PC do operador (WSL com Docker). Medido numa thread da nuvem (4 vCPU, 15 GB, sem Docker,
release/v0.4.0 eb27585; relatório `ci/gate-na-nuvem.md` dos arquivos do projeto): npm ci 31 s, typecheck 48 s,
cobertura 566 s, build 73 s, integração em Postgres real 149 s (2118 testes), E2E de produção 613 s, E2E dev
204 s, mutação de dois arquivos 102 s. O gate inteiro sem a mutação completa leva ~28 min, todo verde.
Restrições: sem VPS e sem minutos pagos do Actions; a ferramenta de shell mata comando em primeiro plano aos
10 min; não há Docker, então imagem, smoke e backup não rodam na nuvem.

## Decisão

1. **A thread da nuvem roda o gate sozinha** com `scripts/gate-cloud.sh` (segundo plano com log, porta 3000
   liberada antes do E2E, `PG_POOL_MAX=1` na integração, Postgres nativo, link do Chromium).
2. **Por PR (`feat/*`, `fix/*` → release): perfil incremental.** typecheck, lint, sv, docs e integridade dos
   testes; `vitest --changed` com **100% nos arquivos tocados** de proxy, domain, application, infrastructure
   e lib (o mesmo piso do `vitest.config.mts`); mutação (Stryker) nos arquivos alterados de domain/application
   (ADR-051); e **integração, build e E2E prod+dev sempre que o diff toca** `src/app`, `src/lib`,
   `src/infrastructure`, `src/proxy.ts`, `drizzle/`, `e2e/`, `Dockerfile` ou configuração de pacote/teste. Na
   dúvida, roda.
3. **Por release (`release/*` → `main`): perfil completo.** `gate-cloud.sh release` (setup, integração e
   `gate:local` com `GATE_PERFIL=pr`, cobertura global, build e E2E) na nuvem, **mais** Docker e backup no WSL
   antes do `release:cut`, que continua exigindo Docker (ADR-071). A mutação completa segue na rotina mensal.
4. O recibo `E2E-GATE` do ADR-042 continua sendo o do `gate:local`; o log da thread da nuvem é evidência
   adicional do PR, não o substitui.

## Consequências

- O PC deixa de ser ponto único de falha para o PR; a release ainda precisa do WSL para Docker e backup.
- Postgres da nuvem é o 16 da imagem; produção e CI usam o 18 (ADR-037). Risco residual pequeno, coberto
  pela integração do WSL na release.
- **Pergunta aberta (não decidida aqui):** a mutação não alcança `src/lib/server`, porque o Stryker só muta
  `domain`/`application` e o `vitest.mutacao.config.mts` só roda esses testes. Incluir `lib/server` muda
  configuração de teste/mutação e fica para uma decisão própria.
