---
title: Recibo para o IRPF e CNPJ de clínica (#326, #248, #355, #358)
type: spec
status: done
---

# Recibo para o IRPF e CNPJ de clínica (#326, #248, #355, #358) — as-built

Registro do que foi entregue (RM-28 em [`docs/plano-evolucao-faseado.md`](../../../docs/plano-evolucao-faseado.md)). Escrito depois da entrega, a partir do [handoff](../../archive/handoff-2026.md); a especificação original de cada issue mora nas PRs e nos ADRs citados.

## Escopo entregue

CPF do paciente e do pagador opcional, validado, cifrado e mascarado, exigido só no recibo do IRPF junto do CNPJ do prestador (ADR-025, migração 0060); dígito verificador do CNPJ conferido e CNPJ antigo inválido marcado para correção, sem apagar, com recibo bloqueado enquanto durar (ADR-029, migração 0063, § 7.3 do runbook).

## Limites e pendências

Nenhuma regra de negócio nova além das registradas nos ADRs; a marcação dos CNPJs antigos é manual no deploy.

## Onde ler

Regras: [`docs/domains/financeiro/README.md`](../../../docs/domains/financeiro/README.md). Passo a passo de cada issue: `.specs/archive/handoff-2026.md`.
