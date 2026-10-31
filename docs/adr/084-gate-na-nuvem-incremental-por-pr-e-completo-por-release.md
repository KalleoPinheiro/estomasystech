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
  2026-10-24, sobre os pedidos de 2026-10-31: rodar o gate nas threads da nuvem de forma autosuficiente, sem
  VPS e sem créditos extras no Actions; gate completo só antes do merge da release, com E2E, mutação e
  integração só no alterado ou impactado nas feature/release e a suíte unitária sempre completa). Complementa o [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)
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
2. **Por PR (`feat/*`, `fix/*` → release): suíte unitária completa, o resto só no impactado.**
   Sempre: typecheck, lint, sv, docs, integridade dos testes e `test:coverage` inteiro, com os limiares de hoje
   (100% nas camadas de regra, piso 90% global; ADR-046, ADR-050). Só no que o diff altera ou alcança:
   - **Mutação:** os arquivos alterados de `src/domain`, `src/application` e `src/lib/server` (ADR-051; `lib/server`
     entra por decisão de PO, porque as regras de acesso e a auditoria vivem lá). `stryker.config.json` (`mutate`) e `vitest.mutacao.config.mts`
     (`tests/lib/server/**`) passam a incluí-lo, só somando alvos e testes; nenhum limiar muda. O `gate:local` do WSL
     (`scripts/gate/`, do dono) segue só com domain/application até o dono decidir igualar.
   - **Integração (Postgres real):** `vitest --changed <base>` com a config de integração, que usa o grafo de
     imports do Vitest. Fallback: diff em `drizzle/`, `tests/support/`, config do Vitest, dependências ou
     `src/infrastructure/persistence/` roda a integração inteira.
   - **E2E (prod e dev):** os specs escolhidos por `scripts/gate-cloud/impacto.ts`, que o Playwright não calcula a
     partir de `src/`. Regras do mapa: spec alterado roda; arquivo de `src/app/<rota>` ou `src/app/api/<rota>`
     roda os specs cujo nome ou URL contém a rota; arquivo de `src/domain|application/<pasta>` roda os specs
     das rotas da pasta (tabela `SLUG_ROTAS`); só documentação, changeset ou teste unitário não roda E2E.
   - **Fallback («na dúvida, inclui»), roda todos os specs:** qualquer arquivo que não esteja na lista de «sem
     impacto no navegador» (docs, `.specs`, changeset, `.md`, `.github`, teste unitário) nem case com uma regra
     acima (por exemplo `vitest.config.mts`, `tsconfig.json`, `biome.json`, `postcss`, `scripts/seed/*`,
     `public/*`, helpers de `e2e/`); arquivo transversal (`src/proxy.ts`, layouts e
     casca, `src/components/`, `src/lib/auth`, sessão e `define-action`, container, persistência, `e2e/support`,
     config do Playwright/Next, `package*.json`, `drizzle/`, `Dockerfile`); pasta de `domain`/`application` sem
     entrada na tabela (`audit`, `auth`, `clinic`, `shared`, `messaging`, `retention`, `taxonomy`…); qualquer
     outro arquivo de `src/` sem regra; e rota sem nenhum spec que a cubra.
3. **Por release (`release/*` → `main`): gate completo** na nuvem (`gate-cloud.sh release`: integração inteira
   e `gate:local` com `GATE_PERFIL=pr`, cobertura global, build e E2E prod+dev), **mais** Docker e backup no
   WSL, só nesse momento, antes do `release:cut`, que continua exigindo Docker (ADR-071). A mutação completa
   segue na rotina mensal.
4. **Quando o Actions voltar (~2026-11-01):** o mesmo fluxo vira workflow: perfil `pr` nos PRs para a release e
   perfil completo no PR da release. O recibo `E2E-GATE` do ADR-042 continua sendo o do `gate:local`; o log da
   thread da nuvem é evidência adicional, não o substitui.

## Consequências

- A rotina mensal de mutação (`stryker.config.json`) passa a mutar também `src/lib/server`; na primeira medição
  (`appointment-authorization.ts` 42%, `patient-record.ts` 92%, `session.ts` 99%) o escore do conjunto ficou 88,5%,
  mas o arquivo de autorização tem mutantes sobreviventes que pedem teste novo antes de a rodada completa fechar
  acima do `break` 85.
- O PC deixa de ser ponto único de falha para o PR; a release ainda precisa do WSL para Docker e backup.
- Postgres da nuvem é o 16 da imagem; produção e CI usam o 18 (ADR-037). Risco residual pequeno, coberto
  pela integração do WSL na release.
