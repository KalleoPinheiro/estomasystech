---
title: "ADR 052 — Fluxo de git com release aberta e main só homologada"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/043-versionamento-com-changesets-e-release-por-tag.md, docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md, docs/engineering/homologacao.md, docs/engineering/producao.md]
---

# ADR 052 — Fluxo de git com release aberta e main só homologada

- **Data:** 2026-10-20
- **Status:** aceito (decisão de @KalleoPinheiro em 2026-10-20, thread "Fluxo de branches e release").
  **Substitui** o fluxo de git do [ADR-041](041-homologacao-na-vercel-e-branch-staging.md) (item "Git")
  e o passo de release do [ADR-043](043-versionamento-com-changesets-e-release-por-tag.md)
  (`release:prepare` na `main`, PR de versão, `release:publish` com a tag antes da Release). O resto
  daqueles ADRs (Vercel, Neon, seed, Changesets, níveis de versão, versão na tela) continua valendo.
- **Domínios afetados:** engenharia (git, release, homologação)

## Contexto

Pelo ADR-041 toda feature ia direto para a `main` e a homologação acontecia **antes**, feature por
feature, numa `staging` montada à mão. A `main` recebia código ainda não visto junto com o resto do
lote, e a versão só era decidida depois. Pedido do Kalléo: a `main` só recebe lote já homologado;
cada feature traz seu seed e seus cenários de teste; a `staging` reflete o lote em teste. O Actions
está sem cota até ~2026-11-01 ([ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)), então o
fluxo precisa rodar à mão, com a automação pronta para ligar. Discussão e alternativas:
`/mnt/project-files/fluxo/estrategia-branches-release.md`.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — manter ADR-041/043 | nada a mudar | `main` recebe código não homologado em lote; versão decidida tarde |
| B — `release/*` com **rebase** da `main` e tag antes do merge (pedido original) | histórico linear | rebase reescreve a branch compartilhada (quebra `feat/*` abertas e invalida o recibo a cada rebase); tag antes do merge fica fora da `main` se o merge for squash; versão publicada não volta se o PR falhar |
| C — `release/*` com **merge** da `main`, rascunho antes e tag no commit de merge (escolhida) | ninguém reescreve SHA; recibo só invalida quando a `main` traz algo; tag sempre no histórico da `main`; nada publicado se o PR falhar | histórico com commits de merge |

## Decisão

**Opção C.**

| Branch | Papel | Entra por |
| --- | --- | --- |
| `main` | só lotes homologados e hotfixes; base das tags | PR `release/* → main` (**merge commit**) ou `hotfix/* → main` |
| `release/vX.Y.Z` | junta as features do lote; **uma aberta por vez** | PR `feat/* → release` (squash) e merge da `main` (nunca rebase) |
| `feat/*` | uma feature; nasce da release aberta | commits normais |
| `hotfix/*` | correção urgente; nasce da `main` | commits normais |
| `staging` | homologação na Vercel; descartável | reconstruída com `force-with-lease`; ninguém commita |

1. **Abrir a release** `release/vX.Y.Z` a partir da `main`; o nome promete a versão.
2. **Feature** nasce da release e volta por PR squash com changeset, testes, **seed** e **cenários de
   homologação** em Dado/Quando/Então. O CI (`recibo-gate.yml`, `check-homologacao.ts`) reprova PR de
   `src/`, `drizzle/` ou `Dockerfile` sem a seção `## Homologação` preenchida (ou `n/a — <motivo>`).
3. **Push na `main`** (hotfix ou release mergeada): `release:sync` (`scripts/release/sync-main.sh`)
   **mergeia** a `main` na release aberta; conflito aborta, não publica e falha o job (aviso por
   e-mail). Em seguida a `staging` é reconstruída (`rebuild.sh --release`): = release aberta, ou = `main`
   se não houver (volta a ser = `main` depois do merge).
4. **Lote fechado:** `staging` = release; reinicie o branch Neon `staging` se houver migração.
5. **Staging aprovada:** `release:prepare -- --rollback=redeploy|backup` **na release**: consome os
   changesets, confere que a versão calculada **bate com o nome da branch** (em `hotfix/*`, só patch
   sobre a atual), commita, empurra e deixa a GitHub Release em **rascunho**.
6. **PR `release/vX.Y.Z → main`:** `gate:local` completo no head, recibo `E2E-GATE` no corpo (ADR-042),
   revisão the-judge, CI verde. O PR de versão e o de código deixam de ser dois: o commit de versão
   é o último da release (`ci.yml` não exige novo changeset nesse PR).
7. **Merge com merge commit** (nunca squash nem "rebase and merge"). `release:publish` recusa um HEAD
   da `main` que não seja merge commit (`--hotfix` abre a exceção do PR de `hotfix/*`).
8. **Logo depois:** `release:publish -- --rollback=...` cria a tag anotada `vX.Y.Z` **no commit que a
   `main` recebeu**, empurra e publica o rascunho. Deploy manual da tag no Coolify
   ([ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)); merge na `main` não é deploy.

**Gates:**

| Momento | O que roda |
| --- | --- |
| PR `feat/* → release/*` | CI rápido + integridade dos testes + seção de homologação; localmente `test:changed` e mutação por diff (`GATE_BASE=origin/release/vX.Y.Z`) |
| PR `release/* → main` e `hotfix/* → main` | CI rápido + recibo do `gate:local` + the-judge (ruleset atual da `main`) |
| Push na `main` | CI + `release:sync` + rebuild da `staging` (`staging.yml`) |

O ruleset novo de `release/*` (PR obrigatório, CI rápido exigido, force push bloqueado) e a opção
*Allow merge commits* do repositório são ajustes de painel do dono.

## Consequências

- A `main` só vê código que passou pela `staging`; a versão é conhecida desde a abertura da release.
- Mutação e E2E completos pesam no PR `release → main` (diff do lote inteiro contra a `main`). É o
  preço de rodar o recibo uma vez por lote; a mutação por diff da feature continua local no PR dela.
- Histórico da `main` tem commits de merge das releases (aceito em troca de tag e recibo estáveis).
- Hotfix: PR direto na `main` e `release:prepare`/`publish --hotfix`; o `release:sync` leva a correção
  à release aberta. `package.json` e `CHANGELOG.md` não conflitam porque a versão só sobe no fim da release.
- Sem cota de Actions (até ~2026-11-01) o fluxo roda à mão: `npm run release:sync` e
  `npm run staging:rebuild -- --release --push`. O `staging.yml` (push na `main`) fica pronto.
- O push do workflow na `release/*` exige que o ruleset a deixe passar (bypass do GitHub Actions ou
  segredo próprio); sem isso o `sync-release` falha e o `release:sync` local resolve.
- Reversível: voltar ao fluxo antigo é reverter este ADR (scripts aceitam `rebuild.sh` sem `--release`).
