---
title: "ADR 102 — Handoff por issue em arquivo próprio, sem conflito no merge"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-09
related:
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/043-versionamento-com-changesets-e-release-por-tag.md
---

# ADR 102 — Handoff por issue em arquivo próprio, sem conflito no merge

- **Data:** 2026-11-09
- **Status:** aceito (issue #799; decisão do coordenador por delegação do @KalleoPinheiro). É um ADR novo, e não nota
  no [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md), porque o ADR-052 é congelado (erro ou
  mudança vai em ADR novo) e porque a regra vale para todo PR, não só para o fluxo de git.
- **Domínios afetados:** engenharia (fluxo de PR).

## Contexto

Todo PR acrescentava uma entrada no fim de `.specs/archive/handoff-2026.md` (2505 linhas). Duas PRs que acrescentam
no mesmo ponto conflitam, e o conflito se repetia a cada merge na release.

`merge=union` no `.gitattributes` não resolve: o GitHub não aplica drivers de merge ao mesclar uma PR pela interface
ou pela API (só valeria em merge local, como o `release:sync`, e o conflito que atrapalha é o do merge da PR).

## Decisão

1. Cada PR cria **um arquivo novo**: `.specs/archive/handoff/<issue>-<slug>.md`. Arquivo novo não conflita (mesmo
   padrão do `.changeset/*.md`).
2. `.specs/archive/handoff-2026.md` fica **congelado** como histórico: as referências antigas continuam válidas.
   Migrar as 2505 linhas custaria um diff enorme e não resolveria conflito nenhum.
3. `npm run handoff:agregar` junta o congelado e os arquivos por issue (em ordem crescente do número da issue) em
   `reports/handoff-agregado.md`, ignorado pelo git. É só leitura; ninguém edita o gerado.
4. `npm run check:handoff` (no `ci.yml`, em PR que não é `release/*`) falha se o PR toca `src/`, `drizzle/`,
   `Dockerfile`, `.github/workflows/` ou `scripts/release/` sem trazer um handoff novo. Editar o `handoff-2026.md`
   congelado só **avisa**, porque há PRs em voo que ainda escrevem nele; o aviso vira falha quando elas entrarem.
5. PR só de documentação segue sem exigência (como no changeset); `.specs/archive/handoff/*.md` já conta como
   documentação para a classificação de "só docs" (ADR-053).

## Consequências

- Some o conflito recorrente no handoff. PR em voo com entrada no arquivo congelado precisa mover a entrada para o
  arquivo novo ao atualizar a branch.
- O check mora em `scripts/release/` (não em `scripts/gate/`), então não é regra 8; alterar o workflow `ci.yml` é classe 3.
- Cada handoff segue o formato de sempre: título com a issue e a data, o que mudou, testes, o que fica fora do
  repositório, next step e blockers.
