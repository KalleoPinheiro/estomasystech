---
title: Baseline de carga e leituras em lote (#222, #360, #361, #363)
type: spec
status: done
---

# Baseline de carga e leituras em lote (#222, #360, #361, #363) — as-built

Registro do que foi entregue (RM-29 em [`docs/plano-evolucao-faseado.md`](../../../docs/plano-evolucao-faseado.md)). Escrito depois da entrega, a partir do [handoff](../../archive/handoff-2026.md); a especificação original de cada issue mora nas PRs e nos ADRs citados.

## Escopo entregue

Scripts de seed e medição de carga com orçamento (AD-049); `/slots` do portal lê as consultas do dia uma vez (AD-053); job de lembretes lê em lote; teto de consultas e cota de fotos do portal atômicos por paciente (AD-051).

## Limites e pendências

O baseline precisa ser repetido na VPS definitiva.

## Onde ler

Regras: [`docs/engineering/performance-baseline.md`](../../../docs/engineering/performance-baseline.md). Passo a passo de cada issue: `.specs/archive/handoff-2026.md`.
