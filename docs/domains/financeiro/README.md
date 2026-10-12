---
title: "Domínio: Financeiro"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
domain: financeiro
---

# Financeiro

## Resumo

Faturas (geradas pela consulta concluída ou avulsas), pagamentos parciais, desconto, recibo,
pacotes de sessões, comissão do profissional e o fechamento mensal de repasses. Valores sempre
em centavos inteiros.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md) § Business Rules):** `Invoice`, `Invoice payment`, `Commission`, `Commission payout`, `Session package`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| FIN-RN-01 | Fatura: `pending → paid` ou `pending → cancelled`; nunca paga ou cancela duas vezes | `src/domain/billing/invoice.ts` |
| FIN-RN-02 | Vários pagamentos imutáveis; fica `pending` até somar o valor líquido | `invoice_payments` |
| FIN-RN-03 | Desconto só com motivo e enquanto pendente; não pode ficar abaixo do já recebido nem zerar | `src/domain/billing/invoice.ts` |
| FIN-RN-04 | Fatura com qualquer pagamento não pode ser cancelada | idem |
| FIN-RN-05 | Comissão apurada na sessão concluída, liberada quando a fatura é paga; 60 dias após o vencimento, libera mesmo sem pagamento | `src/domain/billing/commission.ts` |
| FIN-RN-06 | Sessão de pacote vale preço do pacote ÷ sessões; pacote cortesia paga comissão sobre o preço normal | idem |
| FIN-RN-07 | Regra de comissão por profissional (`percentage` ou `fixed`), definida só pelo Admin | idem |
| FIN-RN-08 | Fechamento mensal por profissional, só de mês encerrado; cada sessão paga no máximo uma vez, valor congelado | `src/domain/billing/commission-payout.ts` |
| FIN-RN-09 | Fatura cancelada depois do repasse vira estorno no próximo fechamento; saldo ≤ 0 é recusado | idem |
| FIN-RN-10 | Cancelar repasse exige motivo, é auditado, e só vale para o último repasse ativo do profissional | `POST /api/commission-payouts/:id/cancel` |
| FIN-RN-11 | Venda de pacote é atômica (pacote + fatura) | `src/application/billing/sell-session-package.ts` |
| FIN-RN-12 | Pagamento, desconto e cancelamento da mesma fatura são serializados (lock da linha na transação): duas ações simultâneas nunca gravam recebimento em dobro — a segunda vê o saldo atualizado e é recusada se exceder (#192) | `PATCH /api/invoices/:id`, `InvoiceRepository.findByIdForUpdate` |
| FIN-RN-13 | Retenção das faturas (#311): ao anonimizar o paciente (20 anos), a descrição vira "Fatura anonimizada" e o motivo do desconto sai, em todas as faturas dele; valor, desconto, datas, status, forma de pagamento e vínculos ficam (prazo fiscal). O recebimento só guarda valor, forma e data: nada a limpar | [spec](../../../.specs/features/retencao-restante/spec.md), `src/infrastructure/persistence/drizzle/drizzle-retention-repository.ts` |
| FIN-RN-14 | O Profissional vê, nos pacientes vinculados, o nome do pacote e o saldo de sessões, **sem preço** (AD-027, #296): `GET /api/patients/:id/packages` (família `clinical`, vínculo R4, DTO `PackageBalanceDto` sem campo monetário). Sem vínculo, `404`. `GET /api/packages`, com preço, segue `administrative` | `src/app/api/patients/[id]/packages/route.ts`, `src/lib/dto/package.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Faturas: filtro, fatura avulsa, receber (Pix, dinheiro, cartões, convênio, transferência), cancelar | entregue | `/faturamento` |
| Pagamento parcial, desconto e recibo `REC-…` | entregue | `/faturamento`, `/documentos/recibo/…` |
| Pacotes de sessões | entregue | `/faturamento` |
| Repasses: fechamento, cancelamento, comprovante `REP-…`, extrato do profissional | entregue | `/repasses`, `/documentos/repasse/…` |
| Monetização (PSP, cobrança recorrente) | backlog | [roadmap](../../plano-evolucao-faseado.md) — Fase 5 |

Specs de execução: `.specs/features/{financeiro-p0-p3-pontuais,faturamento-kpis-backend}/`; itens N4/N6-8d em `.specs/archive/handoff-2026.md`. PRD: [fase 2](../../product/prd-fase-2.md).

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/billing/` |
| casos de uso | `src/application/billing/` |
| API | `src/app/api/{invoices,packages,commission-payouts,my-payouts,summary}/` |
| UI | `src/app/(staff)/{faturamento,repasses}/`, `src/app/documentos/{recibo,repasse}/` |
| testes | `tests/domain/`, `tests/application/`, `e2e/faturamento.spec.ts` |

## Decisões

- Acesso por família de rota (`src/lib/auth/route-family.ts`): repasses da empresa são `administrative`; `/api/my-payouts` é `professional_self`
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — quem vê o quê
