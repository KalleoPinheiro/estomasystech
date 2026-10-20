---
title: "Domínio: Relatórios e dashboard"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
domain: relatorios
---

# Relatórios e dashboard

## Resumo

Visões de gestão sobre os dados dos outros domínios: o dashboard do dia e do mês e o relatório
gerencial mensal. Só lê — nenhuma regra de negócio nasce aqui.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Appointment`, `Invoice`, `Commission`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| REL-RN-01 | Taxa de falta (no-show) do mês com alerta visual acima de 15% | cálculo em `src/application/reports/get-monthly-report.ts`, alerta em `src/app/(staff)/relatorios/page.tsx` |
| REL-RN-02 | Recebido = soma dos pagamentos (parciais inclusos); a receber = saldo das faturas pendentes | `src/application/billing/get-billing-summary.ts` |
| REL-RN-03 | Comissão por profissional: apurada, liberada e pendente, com a mesma regra do repasse | `src/application/reports/production.ts` |
| REL-RN-04 | Só o relatório de mês encerrado é cacheado (não muda mais) | `src/lib/report-cache.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Dashboard: recebido, a receber, consultas, faturas pendentes, consultas de hoje, retornos | entregue | `/` |
| Relatório mensal: consultas por status, no-show, receita por procedimento, produção | entregue | `/relatorios` |

Specs de execução: `.specs/features/{dashboard-p1-p3-pontuais,dashboard-summary-card,faturamento-kpis-backend}/`. PRD: [fase 1](../../product/prd-fase-1.md) (F6).

## Código

| Camada | Caminho |
| --- | --- |
| casos de uso | `src/application/reports/`, `src/application/billing/get-billing-summary.ts` |
| API | `src/app/api/{reports,summary}/` |
| UI | `src/app/(staff)/page.tsx`, `src/app/(staff)/relatorios/` |
| testes | `tests/application/`, `e2e/relatorios.spec.ts` |
| exceções | [`excecoes.md`](excecoes.md) — matriz de casos de exceção e o teste de cada um |

## Decisões

- Várias réplicas: cache só de dado imutável ([`CONTEXT.md`](../../../CONTEXT.md) § Critical constraints)
