---
title: "ADR 071 — Corte de release em comando único (`release:cut`) e gate da release sem mutação"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related:
  - docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/058-base-do-diff-dos-gates-locais-e-a-release-aberta.md
  - docs/engineering/homologacao.md
---

# ADR 071 — Corte de release em comando único (`release:cut`) e gate da release sem mutação

- **Data:** 2026-10-24
- **Status:** aceito (decisão de @KalleoPinheiro, 2026-10-24, depois do corte da v0.2.0; issues #570 e #571).
  **Substitui** do [ADR-051](051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md) só o ponto em que a
  mutação roda no `gate:local` do PR `release/* → main`; o resto do ADR-051 continua valendo.
- **Domínios afetados:** engenharia (release, gate)

## Contexto

Na v0.2.0 o gate completo rodou quatro vezes (~3 h). Duas causas:

1. **Ordem.** O `release:prepare` rodou depois do gate e criou o commit de versão: o recibo, preso ao SHA,
   deixou de valer.
2. **Ambiente.** Sobras de `.stryker-tmp`, o fuso do shell do operador, um Postgres local na 5432 (a etapa
   `backup` não recebia a porta livre que a `docker` escolhia) e passos feitos à mão.

Além disso, o PR `release → main` tem no diff todos os arquivos de regra do lote, e a mutação por arquivo
(ADR-051) virava, ali, quase a rodada completa (~1h20), repetindo o que cada PR do lote já provou.

## Decisão

### `npm run release:cut -- --rollback=redeploy|backup`

Roda na `release/vX.Y.Z` aberta (WSL hoje; o mesmo comando no GitHub Actions com `GH_TOKEN` quando houver
cota), sempre nesta ordem:

1. **Pré-condições**, sem efeito colateral: branch `release/vX.Y.Z`, árvore limpa, igual ao `origin`, com a
   `main` dentro, e a **marca de homologação** `homologacao/vX.Y.Z` apontando para este SHA. O TESTE-ALTERADO
   do lote é consolidado dos corpos dos PRs mergeados desde a `main` (`gh pr view`), e a integridade dos testes
   contra a `main` roda já aqui: um motivo faltando para antes de congelar, não depois do gate.
2. **`release:prepare` primeiro** (versão, CHANGELOG, Release em rascunho). Nenhum commit depois dele.
3. **Worktree limpo** do SHA final, ao lado do clone (`<clone>-cut-vX.Y.Z`), com `npm ci`.
4. **Gate da release uma vez**, com `GATE_PERFIL=release` e `GATE_BASE=origin/main`.
5. **PR `release → main`** com o recibo, o lote e o TESTE-ALTERADO consolidado; abre ou atualiza com `gh`
   quando houver, e grava o corpo em `.gate/pr-release-vX.Y.Z.md`.

Uma nova execução depois de um gate que falhou por ambiente reconhece o commit `chore(release): vX.Y.Z` em
cima do SHA homologado e não versiona de novo. Se a release ganhou commit depois da homologação, o corte é
recusado até a staging homologar o SHA novo.

### Marca de homologação

A branch `homologacao/vX.Y.Z` aponta para o SHA que a validação em contexto limpo aprovou na staging. Quem
aprova (o coordenador) a cria ou a move (`git push --force origin <sha>:refs/heads/homologacao/vX.Y.Z`, ou
criando a branch no GitHub a partir da release). O `release:cut` só lê. Branch, e não tag nem arquivo, porque
não muda o SHA da release, dá para criar sem `gh` e sem push de tag, e o `git ls-remote` a lê em qualquer
máquina. Ela é apagada depois do merge na `main`.

### Gate da release (perfil `release`)

Perfil `release` = branch `release/*` ou `GATE_PERFIL=release`. Etapas: typecheck, lint, sv, docs,
integridade dos testes contra a `main`, cobertura, build, E2E completo (produção e dev), **imagem Docker com
smoke e backup obrigatórios** (sem daemon, o gate recusa em vez de pular). **Sem mutação**: ela roda em cada
PR do lote (ADR-051, base na release aberta pelo ADR-058) e inteira na rotina mensal. O `recibo-gate` passa
`--head-ref`: em `release/*` exige `docker` e `backup` e dispensa `mutacao`. Hotfix continua com mutação.

### Ambiente fixado pelo gate (#571), em todo perfil

`TZ=UTC` nas etapas de teste e build (o fuso do Actions e do vitest), `NODE_OPTIONS=--max-old-space-size=8192`,
`POSTGRES_PORT` livre a partir de 55432 (ignora o `POSTGRES_PORT` do shell; `GATE_POSTGRES_PORT` força outra),
`COMPOSE_PROJECT_NAME=estomasystech-gate` (o `down -v` nunca derruba a pilha do operador), segredos
descartáveis e o fuso do compose nas etapas Docker, e `.stryker-tmp`/`reports` apagados antes da primeira
etapa. A mesma porta vale para `docker` e `backup`.

## Consequências

- Um corte de release é um comando e um gate. A ordem errada deixa de ser possível: o recibo sai do SHA final.
- O gate da release fica ~1h20 mais curto quando o lote muda regra; a garantia de mutação passa a depender de
  cada PR do lote ter rodado o próprio gate. A rotina mensal pega a deriva.
- O release só corta o que a staging aprovou: commit novo na release exige nova homologação.
- O recibo continua autodeclarado; a trava real segue sendo o ruleset da `main` (ADR-042).
- Alternativas descartadas: manter a mutação do lote na release (repete o PR, ~1h20); marca por arquivo no
  repo (muda o SHA homologado); marca por label (depende de `gh` e de um PR que ainda não existe).
