---
title: "Visão de produto"
status: living
audience: [po, stakeholder, dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
related:
  - docs/plano-evolucao-faseado.md
---

# Visão de produto

> **Em uma frase:** o EstomaSysTech é o sistema de gestão clínica de quem trata estomias e feridas
> complexas — prontuário que prova a evolução do paciente, agenda que traz o paciente de volta e
> um financeiro que fecha as contas da clínica e do profissional.

## Problema

A estomaterapia é uma especialidade de enfermagem de cuidado **longitudinal**: o mesmo paciente
volta dezenas de vezes, e o valor clínico está em medir a evolução entre visitas. Sem sistema
próprio, a clínica perde três coisas ([PRD fase 1](prd-fase-1.md) § 1):

1. **Respaldo legal** — a evolução de enfermagem é exigência do COFEN (Resolução 429/2012).
2. **Prova de resultado** — ferida que não é medida não demonstra cicatrização, e é isso que sustenta o preço particular e a relação com convênios.
3. **Margem** — insumos (bolsas, placas, coberturas) são caros, vencem e são o segundo maior custo.

E paciente que não retorna é risco clínico e receita perdida.

## Para quem

| Persona | Papel no sistema | O que precisa |
| --- | --- | --- |
| Enfermeira estomaterapeuta, dona da clínica | `company_admin` | atender, registrar, decidir conduta, enxergar o negócio |
| Profissional da equipe | `profissional` | prontuário dos próprios pacientes e o próprio repasse |
| Recepção | `atendente` | agenda, cadastro, recebimento |
| Paciente | `patient` | ver consultas, agendar retorno, enviar foto |
| Médico parceiro | `partner` | acompanhar os pacientes que indicou |
| Operador do sistema | `super_admin` | provisionar e sustentar várias clínicas |

## Objetivos de negócio

| Objetivo | Como medimos | Fonte |
| --- | --- | --- |
| Toda consulta concluída com evolução registrada | 100% das consultas `completed` com evolução | PRD fase 1 § 6 |
| Nenhum atendimento sem material | zero saída bloqueada por falta de estoque | PRD fase 1 § 6 |
| Paciente volta | ≥ 80% dos retornos programados realizados | PRD fase 1 § 6 |
| Registro rápido | evolução registrada em ≤ 3 min | PRD fase 1 § 6 |
| Vender para N clínicas com segurança | isolamento por empresa sem vazamento cross-empresa | [ADR-001](../adr/001-multi-tenancy.md) |

## Princípios de priorização

Copiados do [roadmap](../plano-evolucao-faseado.md#princípios-de-priorização): segurança do dado
de saúde antes de crescimento · fundação antes de feature · fechar loops de receita com o que já
existe · decisão de negócio pendente = fase planejada, não executada.

## O que o produto não é (hoje)

- Não é prontuário hospitalar nem faz faturamento TISS (backlog, `RM-17`).
- Não tem autocadastro: toda conta é criada por alguém acima na hierarquia de papéis.
- Não cobra online (backlog, `RM-05`).

Próximo passo: [roadmap](../plano-evolucao-faseado.md#roadmap) · [domínios](../domains/).
