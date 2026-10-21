---
title: "ADR 058 — Base do diff dos gates locais: a release aberta, não a main"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md, docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/engineering/homologacao.md]
---

# ADR 058 — Base do diff dos gates locais: a release aberta, não a main

- **Data:** 2026-10-21
- **Status:** aceito (exceção pontual de @KalleoPinheiro para editar `scripts/gate/` e `.husky/`, 2026-10-21).
- **Domínios afetados:** engenharia (gate, fluxo de git)

## Contexto

`check:testes` (regra 8), a mutação do `gate:local` e `check:changeset` comparavam sempre com
`origin/main`. No fluxo do ADR-052 a `feat/*` nasce da `release/vX.Y.Z` e volta para ela; contra a `main`
o diff inclui tudo que outros PRs já levaram à release. Resultado visto no PR #449: a regra 8 acusava teste
alterado por outros PRs, o `gate:local` falhava na etapa `integridade-de-testes` e não gerava recibo.

## Decisão

`scripts/gate/base.ts` escolhe a base, nesta ordem:

1. `GATE_BASE` (ou argumento explícito do `check:testes`), que sempre vence;
2. `origin/main` se a branch for `main`, `staging`, `release/*` ou `hotfix/*` (PR que vai para a `main`);
3. a `origin/release/vX.Y.Z` de maior versão da qual o HEAD descende e que a `main` ainda não contém;
4. `origin/main`.

O `pre-push` busca também `refs/heads/release/*`. Para o PR `release → main` nada muda: base `main`,
regra 8 e recibo completos. O `recibo-gate.yml` já passava a base do PR e não muda.

## Consequências

- A regra 8 continua valendo inteira: só deixa de punir o PR por mudanças que não são dele.
- Branch criada da `main` (hotfix) continua comparada com a `main`.
- `release/*` mergeada na `main` deixa de contar como release aberta.
- Sem `fetch` das releases, a base cai na `main` (comportamento anterior).
