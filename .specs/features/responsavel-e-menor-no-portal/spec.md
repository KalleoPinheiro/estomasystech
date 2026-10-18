---
title: Responsável e paciente menor no portal (#329, #351, #354, #371, #372, #375)
type: spec
status: done
---

# Responsável e paciente menor no portal (#329, #351, #354, #371, #372, #375) — as-built

Registro do que foi entregue (RM-27 em [`docs/plano-evolucao-faseado.md`](../../../docs/plano-evolucao-faseado.md)). Escrito depois da entrega, a partir do [handoff](../../archive/handoff-2026.md); a especificação original de cada issue mora nas PRs e nos ADRs citados.

## Escopo entregue

Responsável reutilizável (ADR-024, migração 0059); acesso ao portal em nome do paciente, com evidência (ADR-027, 0061); paciente encerra o acesso e o responsável é avisado por e-mail (ADR-028, 0062, AD-054); menor só pelo representante legal, que assina os termos, pede cópia e correção e cuida do parceiro, com eliminação na clínica; aceite dele vence 90 dias depois dos 18 (ADR-032 e ADR-033, 0065 e 0066).

## Limites e pendências

Curatela de adulto segue pela clínica: o portal só deixa o representante assinar por menor.

## Onde ler

Regras: [`docs/domains/portal/README.md`](../../../docs/domains/portal/README.md). Passo a passo de cada issue: `.specs/archive/handoff-2026.md`.
