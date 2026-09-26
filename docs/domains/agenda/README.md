---
title: "Domínio: Agenda"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
domain: agenda
---

# Agenda

## Resumo

Consultas da empresa: marcar, confirmar, concluir, remarcar, cancelar, registrar falta — sempre
dentro da grade de horário, sem conflito e respeitando ausências. Inclui recall de retornos,
lista de espera e política de cancelamento. Fronteira: o que a consulta gera de cobrança é do
[financeiro](../financeiro/README.md); o que o paciente faz no portal é do [portal](../portal/README.md).

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Appointment`, `Procedure`, `Follow-up`, `Schedule settings`, `Cancellation policy`, `Waitlist`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| AGE-RN-01 | Consulta só dentro da grade da empresa, no fuso `TZ`; fora dela, `400` | `src/domain/scheduling/business-hours.ts`, `schedule-config.ts` |
| AGE-RN-02 | Folga mínima entre consultas (padrão 15 min, expandida para os dois lados); conflito dá `409`; cancelada/falta libera o horário. O conflito é **por empresa e profissional** — consultas de empresas diferentes nunca conflitam (#187) | `TimeSlot.expand`, trigger `endsAtBuffered`, constraint `appointments_no_overlap` (`clinic_id`, profissional, intervalo — migração `0038`) |
| AGE-RN-03 | Uma regra em todo lugar — grade → almoço → fechamentos → horário do profissional → folga | `src/application/appointments/assert-slot-available.ts` |
| AGE-RN-04 | Estados: `scheduled → confirmed → completed`, com desvios para `cancelled`/`no_show`; transição inválida é rejeitada | `src/domain/scheduling/appointment.ts` |
| AGE-RN-05 | Concluir gera fatura pendente (idempotente) e pode programar retorno em 7/15/30/60/90 dias | `src/application/appointments/complete-appointment.ts` |
| AGE-RN-06 | Fechamento da empresa bloqueia o dia; ausência do profissional bloqueia só ele; registrar fechamento nunca cancela consultas | `src/domain/scheduling/schedule-availability.ts` |
| AGE-RN-07 | Cancelamento a pedido do paciente dentro do aviso (padrão 24 h) é tardio; taxa opcional vira fatura pendente, nunca comissão | `cancellationPolicy`, `cancel-appointment-by-staff.ts` |
| AGE-RN-08 | Lista de espera: janela ≤ 180 dias, sem duplicar; o sistema nunca agenda sozinho | `src/domain/scheduling/waitlist.ts` |
| AGE-RN-09 | Falha do Google Calendar nunca impede a operação | `src/application/appointments/sync-appointment-calendar.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Calendário mensal, nova consulta, ações por status, remarcação | entregue | `/agenda` |
| Agenda no celular (abaixo de 768px): mês compacto de 7 colunas com ponto no dia que tem consulta e, abaixo, a lista das consultas do dia escolhido (hoje por padrão); "Agendar neste dia" só em dia válido | entregue | `/agenda` (`mobile-month.tsx`) |
| Consultas recorrentes | entregue | `/agenda` |
| Grade, almoço, política de cancelamento, feriados e ausências | entregue | Configurações, Profissionais |
| Lista de espera | entregue | `/agenda` → Lista de espera |
| Recall de retornos | entregue | dashboard, `/api/follow-ups` |
| Catálogo de procedimentos (preço, duração, kit) | entregue | `/procedimentos` |

Specs de execução: `.specs/features/{agenda-p1-p3-pontuais,catalogo-p0-p3-pontuais}/`; itens N6 8a–8c em `.specs/archive/handoff-2026.md`.

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{scheduling,followup,catalog}/` |
| casos de uso | `src/application/{appointments,scheduling,followups}/` |
| API | `src/app/api/{appointments,follow-ups,procedures,waitlist,settings}/` |
| UI | `src/app/(staff)/{agenda,procedimentos}/` |
| testes | `tests/domain/`, `tests/application/`, `e2e/{agenda,followup,lista-espera,feriados-ausencias,layout-mobile-first}.spec.ts` |

## Decisões

- [ADR-001](../../adr/001-multi-tenancy.md) — grade e política por empresa (tabela, não env)
- Integração: [Google Calendar](../../engineering/integrations/google-calendar.md)
