---
title: "ADR 099 — Homologação sem operador: rebuild, validação logada e marca pelo Actions"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
related:
  - docs/adr/041-homologacao-na-vercel-e-branch-staging.md
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/engineering/homologacao.md
---

# ADR 099 — Homologação sem operador: rebuild, validação logada e marca pelo Actions

- **Data:** 2026-11-08
- **Status:** aceito (issue #765; pedido de @KalleoPinheiro em 2026-11-08: o operador não pode ser requisito do
  caminho até a produção). Complementa o [ADR-097](097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md)
  sem mudar o fluxo vigente: o caminho manual continua válido.
- **Domínios afetados:** engenharia (homologação, release).

## Contexto

O corte da release exige a marca `homologacao/vX.Y.Z` no SHA da release ([ADR-071](071-corte-de-release-em-comando-unico.md)).
Ela atesta que a staging do mesmo SHA foi reconstruída e validada. Na prática, o dono rodava o
`staging:rebuild` com a identidade dele (a Vercel bloqueia autor fora do time) e alguém criava a marca à mão.

O rebuild já roda no Actions (`staging.yml`, `workflow_dispatch`): o workflow configura a identidade do dono e o
deploy é a integração Git da Vercel ao receber o push na `staging`. **Não é preciso `VERCEL_TOKEN` nem deploy hook.**
O que faltava: (1) `rebuild.sh --release` aborta com mais de uma release aberta (v0.6.2 e v0.7.0 coexistem);
(2) a validação e a marca eram passos manuais.

## Decisão

1. `rebuild.sh --release=release/vX.Y.Z` usa essa release como base mesmo com outras abertas; recusa release
   inexistente ou já na `main`. `--release` sem valor mantém a regra de uma release aberta.
2. `staging.yml` ganha os inputs `release_branch` e `homologar`. Com `homologar`, o job `homologar` espera o deploy
   de Production da Vercel para o SHA publicado (API de deployments), confere `/api/health/ready`, roda
   `scripts/staging/validacao-logada.mjs` (3 papéis, 4 larguras; reprova em console, CSP, `/api` 4xx/5xx, rolagem)
   e, **só com tudo verde e a release ainda no mesmo SHA**, grava `homologacao/vX.Y.Z` com o `RELEASE_CUT_TOKEN`.
3. O dispatch deve usar como ref a própria `release/vX.Y.Z` (ou a `main`, depois que o job existir nela): o
   `workflow_dispatch` executa o arquivo do ref escolhido.
4. A validação em contexto limpo por `the-judge` continua acima desse piso mecânico: a marca automática prova o
   piso, não substitui a revisão do PR.

## Configuração única do dono (segredos do repositório)

`STAGING_SEED_PASSWORD` (senha das contas fictícias, `homologacao.md` § 4), `VERCEL_AUTOMATION_BYPASS_SECRET`
(Protection Bypass for Automation da Vercel) e `RELEASE_CUT_TOKEN` (já existe, usado pelo `release:cut`). O job
falha logo no início, listando os que faltam.

## Consequências

- Homologar vira um clique (ou uma chamada de API) sem a máquina do dono; a marca só nasce de uma rodada verde.
- A rodada leva de 10 a 30 min (deploy da Vercel e `PAUSE_MS=2000` contra o limitador de taxa).
- O workflow é classe 3 (portões e `.github/workflows/`): mudar este fluxo pede a aprovação do dono.
- Quem tem o `RELEASE_CUT_TOKEN` pode forjar a marca por fora do job; o risco já existia (era `git push --force`).
