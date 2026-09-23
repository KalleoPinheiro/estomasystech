---
title: "Domínio: <Nome>"
status: living
audience: [dev, po, agent]
owner: "@<github-user>"
last_reviewed: YYYY-MM-DD
domain: <slug>
---

<!--
  L1 do domínio. Máx. ~80 linhas. Resume e aponta — não repete o CONTEXT.md nem as specs.
  Salve em docs/domains/<slug>/README.md.
-->

# <Nome do domínio>

## Resumo

<2–3 frases: o que este domínio resolve, para quem, e onde começa/termina.>

**Termos (definidos no [`CONTEXT.md`](../../../CONTEXT.md)):** `<Entidade>`, `<Entidade>`, `<Estado>`.

## Regras de negócio

As regras que **atravessam** funcionalidades deste domínio. Regra de uma funcionalidade só fica na spec dela.

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| <DOM>-RN-01 | <regra com valor concreto> | `src/domain/<pasta>/…` |

## Funcionalidades

| Funcionalidade | Estado | Spec viva |
| --- | --- | --- |
| <Nome> | entregue | [`features/<slug>.md`](features/<slug>.md) |

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/<pasta>/` |
| casos de uso | `src/application/<pasta>/` |
| API | `src/app/api/<recurso>/` |
| UI | `src/app/(<grupo>)/<rota>/`, `src/components/<pasta>/` |
| testes | `tests/domain/<pasta>/`, `e2e/<arquivo>.spec.ts` |

## Decisões

- [ADR-NNN — <título>](../../adr/NNN-slug.md) — <uma linha do porquê importa aqui>
- `.specs/STATE.md` AD-NNN — <decisão de execução relevante>
- Integrações usadas: [<nome>](../../engineering/integrations/<nome>.md)
