---
title: "ADR 053 — PR só de documentação dispensa o recibo do gate local"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md]
---

# ADR 053 — PR só de documentação dispensa o recibo do gate local

- **Data:** 2026-10-21
- **Status:** aceito (decisão de @KalleoPinheiro em 2026-10-21). **Ajusta** o ADR-042 (recibo exigido no
  PR que entra na `main`); o resto do ADR-042 e do ADR-052 continua valendo.
- **Domínios afetados:** engenharia (CI, gate local)

## Contexto

O recibo do `gate:local` (build + E2E, ~20 min) prova que o código roda. Um PR que toca só `.md`
(ADR, runbook, handoff, docs de domínio) não muda nada que o gate execute, mas hoje um PR
`hotfix/*` ou `release/* → main` só de documentação também esbarra no recibo ausente.

## Decisão

1. O job `Recibo do gate local + integridade dos testes` **não exige a linha `E2E-GATE:`** quando todo
   arquivo tocado pelo PR (adicionado, alterado, removido ou renomeado) é `.md` fora de `src/`,
   `tests/`, `e2e/`, `drizzle/`, `scripts/`, `deploy/`, `.github/`, `.claude/`, `.gate/` e `.husky/`.
2. A classificação é `isDocsOnly` em `scripts/release/lib.ts`, chamada por `scripts/release/docs-only.ts`.
   Diff vazio ou ilegível **não** é docs-only: o recibo continua exigido.
3. Nada mais muda: o job continua rodando e reportando o mesmo check (o ruleset da `main` segue
   satisfeito), a integridade dos testes (regra 8) e o gate rápido do `ci.yml` (typecheck, lint, docs,
   cobertura, build) continuam rodando. A dispensa vale **só** para o recibo.

## Consequências

- PR de documentação deixa de custar ~20 min de gate local.
- Um único arquivo fora da regra (ex.: um `.json`, uma imagem, um `.md` em `src/`) devolve a exigência
  do recibo inteira: sem meio-termo.
- Regra 7 do `AGENTS.md` e o template de PR registram a exceção.
