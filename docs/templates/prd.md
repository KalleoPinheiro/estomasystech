---
title: "PRD — Fase N: <Nome>"
status: draft
audience: [po, stakeholder, dev]
owner: "@<github-user>"
last_reviewed: 2026-09-23
---

<!--
  Salve em docs/product/prd-fase-N.md. Escreva um PRD só quando a fase envolver decisão de
  produto/negócio (preço, papel, trade-off de UX) — iniciativa técnica vai direto para
  .specs/features/<slug>/ (docs/agents/planning.md). Cada funcionalidade que sair daqui ganha
  uma spec viva em docs/domains/<slug>/features/ (template feature-spec.md) quando for entregue.
  Ao entregar a fase, status: frozen.
-->

# PRD — Fase N: <Nome>

> **Resumo executivo (3 linhas):** <problema> · <para quem> · <o que muda quando entregar>.

| Campo | Valor |
| --- | --- |
| Roadmap | `RM-NN` |
| Domínios | <slug>, <slug> |
| Decisor de produto | <pessoa> |
| Data | YYYY-MM-DD |

## Contexto e problema

<Presente, sem a solução dentro; evidência copiada literalmente, ou "o source não traz número".>

## Personas

| Persona | Papel no sistema | O que precisa |
| --- | --- | --- |
| <nome> | `<papel>` | <…> |

## Objetivos e métricas de sucesso

| Objetivo | Métrica | Linha de base | Alvo |
| --- | --- | --- | --- |
| <…> | <…> | <valor atual ou "não medido"> | <…> |

## Funcionalidades

### PN.1 — <Nome>

- **Valor:** <…>
- **Regras de negócio:** RN-01 <…>; RN-02 <…>
- **Critérios de aceite:** em Gherkin na spec da funcionalidade (`docs/templates/feature-spec.md`)

## Fora de escopo

| Excluído | Por quê |
| --- | --- |
| <…> | <…> |

## Decisões registradas

| # | Decisão | Quem decidiu | Data |
| --- | --- | --- | --- |
| D1 | <…> | <…> | YYYY-MM-DD |

## Perguntas abertas

| # | Pergunta | Bloqueia |
| --- | --- | --- |
| 1 | <…> | PN.1 |

## Rastreabilidade

| Funcionalidade | Spec de execução | Spec viva | Issue |
| --- | --- | --- | --- |
| PN.1 | `.specs/features/<slug>/` | `docs/domains/<slug>/features/<f>.md` | #<n> |
