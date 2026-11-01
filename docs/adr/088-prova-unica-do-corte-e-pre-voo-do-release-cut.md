---
title: "ADR 088 — Prova única do corte, integração no corte, pré-voo do release:cut e staging.yml enxuto"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-01
related:
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md
  - docs/adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md
  - docs/engineering/gate-na-nuvem.md
  - docs/engineering/homologacao.md
---

# ADR 088 — Prova única do corte, integração no corte, pré-voo do release:cut e staging.yml enxuto

- **Data:** 2026-11-01
- **Status:** aceito. @KalleoPinheiro aprovou, em 2026-11-01 (thread «Enxugar o fluxo de entrega ponta a ponta»,
  «Ok, aplique todas as mudanças»), as mudanças que tocam o processo de release ([ADR-071](071-corte-de-release-em-comando-unico.md))
  e a semântica do check exigido `ci` ([ADR-087](087-gate-em-jobs-paralelos-com-shards-e-cache.md)). Emenda esses
  dois ADRs; não muda nenhum limiar nem teste (regra 8).
- **Domínios afetados:** engenharia (CI, release, homologação)

## Contexto

O fechamento da v0.4.0 mediu o fluxo ponta a ponta. O `release:cut` provou o SHA 0c7e3d8 com o gate completo
(41,8 min, 490 E2E, Docker e backup). Em seguida o PR release→main repetiu, na mesma árvore, o `ci.yml` pesado
(~27 min de job) e o `docker.yml` (~3,7 min), e o push do merge na `main` repetiu o CI. Três de quatro disparos
do corte falharam (um deles aos 27 min) por causas que um pré-voo de ~1 min teria pegado. O gate de release não
roda a integração Postgres, então a combinação do lote nunca foi provada contra banco real. O `staging.yml` falha
em todo push na `main` (o ruleset `release/**` recusa o push do `GITHUB_TOKEN`, GH013), o commit automático de
deploy fica BLOCKED na Vercel (autor fora do time) e o smoke recebe 302 (SSO da Vercel em todos os deploys que
não são de domínio próprio). A árvore do merge commit #662 (`781ce34`) é idêntica à do head provado (0c7e3d8).

## Decisão

1. **Selo do corte.** O `release:cut` grava o check run `release-cut/gate` no SHA final, **antes** de abrir o PR,
   com o `GITHUB_TOKEN` do workflow (app `github-actions`) e as etapas do recibo no resumo (`etapas=...`), mais
   `integracao`. Check run só pode ser criado por GitHub App: um PAT, mesmo com bypass, não o forja. Sem
   `SELO_TOKEN` (corte local) nenhum selo é gravado.
2. **Prova no PR release→main e no push da main.** `ci.yml` e `docker.yml` ganham o job/step de escopo que roda
   `scripts/release/prova-corte.ts` e considera provado **só se** (a) PR de `release/vX.Y.Z` para a `main`, ou push
   na `main`; (b) o commit em teste é merge commit, e o head do PR é o segundo pai; (c) a árvore do commit é
   **idêntica** à do segundo pai; (d) o segundo pai tem o check run `release-cut/gate`, da app `github-actions`,
   `success`, no próprio SHA, cobrindo `typecheck, lint, sv, docs, cobertura, build, integracao` (CI) ou
   `docker, backup` (Docker). Provado: estático, cobertura, build e Docker são pulados e o job `ci` (o check
   exigido) confere que foram pulados e passa. Exceção: o `check:server-first`, que nem o selo nem o `gate:local` cobrem,
   segue rodando no job barato `server-first-provado` e o `ci` exige que ele passe. Qualquer dúvida roda tudo (falha fechada). Não se usa `paths-ignore`.
   `hotfix/*` não tem corte e continua rodando tudo.
3. **Integração Postgres completa no corte.** O `release-cut.yml` roda `vitest.integracao.config.mts` inteira,
   com Postgres 18, **antes** do `release:prepare`, no SHA homologado (o commit de versão só mexe em versão,
   CHANGELOG, changesets e lockfile). Vermelho para o corte antes dos ~42 min do gate. O gate de release
   (`scripts/gate/`) não muda.
4. **Pré-voo do corte.** `npm run release:preflight` roda antes do gate e confere ambiente (token em CI, repositório,
   identidade git, rollback), as pré-condições do corte (branch, árvore limpa, igual ao origin, `main` dentro,
   marca `homologacao/vX.Y.Z`, TESTE-ALTERADO consolidado, integridade dos testes) e permissão de push
   (`gh api` e `git push --dry-run`). O workflow ganhou o input `dry_run`, que para depois do pré-voo, sem gate,
   sem commit e sem PR. Limite: o `--dry-run` não exercita o bypass do ruleset `release/**`; esse só se prova no
   push real.
5. **`staging.yml` enxuto.** Sai o job `sync-release` (a `main` na release é do `release:sync`, de quem tem
   bypass; o `release:cut` já exige a `main` dentro da release). O commit automático de deploy usa a identidade do
   dono do repositório, que a Vercel aceita. O smoke usa o segredo opcional `VERCEL_AUTOMATION_BYPASS_SECRET`; sem
   ele aceita só o redirecionamento ao login da Vercel, com aviso de que o health não foi verificado.
6. **Pré-PR da thread só rápido.** `scripts/gate-cloud.sh rapido` (typecheck, lint, sv, docs, integridade e os
   testes do diff) vira o gate antes de abrir o PR; a cobertura completa, a integração e o E2E ficam com
   `ci.yml` e `gate-pr.yml`, que são os checks exigidos. O perfil `pr` continua para investigar vermelho. Emenda
   o ADR-084 (congelado) nesse ponto.

## Alternativas consideradas

- **Commit status em vez de check run** (issue #663): qualquer pessoa com escrita cria status com PAT. Vence se o
  repositório passar a exigir status de um app terceiro; hoje o check run é mais forte.
- **Gate do corte em jobs paralelos** (shards do `ci.yml` e do `gate-pr.yml` no SHA final): −32 min de relógio,
  +20 min de job e mudança estrutural do ADR-071. Vence se, depois deste ADR, o relógio do corte virar o gargalo.
- **Build único compartilhado e cache dos navegadores do Playwright no `gate-pr.yml`:** ~5 a 7 min de job por
  push de PR, mas só se valida rodando no Actions; adiado até haver medição.

## Consequências

- Por release, o fechamento deixa de repetir ~58 a 63 min de job (CI e Docker do PR→main e do push na main).
- Quem tem permissão de escrita e de workflows pode alterar o `ci.yml` de um PR e dispensar o próprio CI; é o
  mesmo nível de confiança que já vale para qualquer edição de workflow neste repositório (dono único, ruleset
  com bypass dele). O selo não amplia esse risco.
- O check exigido `ci` continua o único exigido; no PR release→main com selo ele passa em ~1 min com os jobs
  pesados `skipped`.
- Um commit novo na release, ou a `main` andar (árvore diferente), invalida a prova e o PR roda tudo.
- Quem roda o corte à mão no WSL não grava selo; o PR roda o CI inteiro, como antes.
- Passo do Kalléo (opcional): criar o segredo `VERCEL_AUTOMATION_BYPASS_SECRET` para o smoke da staging ver o
  health.
