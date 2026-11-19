---
title: "Fechamento da #541 e da #883 (2026-11)"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-19
related:
  - docs/engineering/performance-front-js-casca-2026-11.md
  - docs/engineering/performance-front-medicao-final-2026-11.md
  - .specs/spike-ppr-csp-hash-560.md
---

# Fechamento da #541 e da #883

> **TL;DR:** a [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541) fecha. As 20 sub-issues estão concluídas, a #560 rejeitou o PPR e a #914 aceitou o delta da casca. A [#883](https://github.com/KalleoPinheiro/estomasystech/issues/883) fecha sem dividir o `@still-void/ui`: o chunk cliente segue **43,9 KB gz** desde outubro. Os números são os da nota da casca.

## 1. O que já estava medido

A causa dos 2 a 15 KB gz está em [JS da casca](performance-front-js-casca-2026-11.md) (#914). Numa rota da equipe a casca soma **+10,6 KB gz**: 404 global, `error.tsx`, `loading.tsx`, layout com Web Vitals e runtime compartilhado. A #914 aceitou esse delta. O Next 16.4.2 para 16.4.5, na mesma árvore, mede 0 KB. O retrato da frente continua na [medição final](performance-front-medicao-final-2026-11.md).

O chunk cliente do `@still-void/ui` mede 43,9 KB gz nos dois lados dessa comparação (148 985 bytes cru em outubro). Não cresceu. Dividir a biblioteca não explica a tabela da #914.

## 2. Decisão

**Fechar as duas, com o pacote e a casca como estão.**

- A #883 pedia entradas por componente ou tree-shaking no `@still-void/ui`. A nota da casca, no dia da medição, deixou a issue aberta porque esse corte não explica o delta. O fechamento usa o mesmo fato: o chunk cliente não cresceu desde outubro, e a #914 já aceitou a casca. O pacote fica na versão atual.
- A #541 fecha com essa decisão. As 20 sub-issues (#542 a #560 e #562) estão concluídas. A #559 e a #905 fecharam com as metas de tela. A #560 está fora: a [nota do spike](../../.specs/spike-ppr-csp-hash-560.md) rejeitou o PPR, e a ADR-069 § 4 segue.

Os números desta nota são os de 2026-11-18. Não há build novo nem mudança de código de produto.
