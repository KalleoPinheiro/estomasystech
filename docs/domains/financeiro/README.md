---
title: "Domínio: Financeiro"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
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
| FIN-RN-15 | Recibo válido para o IRPF (#326, [ADR-025](../../adr/025-cpf-no-recibo-e-protecao.md)): traz o **CPF de quem pagou** (o paciente ou, se informado ao receber, o pagador com nome e CPF) e o **CNPJ da empresa** como prestador. Sem CPF ou sem CNPJ o recibo é bloqueado (`400`, com orientação) na tela e na emissão: `POST /api/documents/issue` de `recibo` exige `invoiceId` e faz a mesma checagem. O pagador é gravado no recebimento (imutável) e cifrado em repouso (CPF); o CPF inteiro só sai em `GET /api/invoices/:id/payments/:paymentId/receipt`, auditado sem o número. Empresa com CNPJ marcado para correção (ACE-RN-57, #358) também bloqueia o recibo (`400`, a tela leva às Configurações; recibos já emitidos não mudam). Reimpressão usa o CPF atual do cadastro; a anonimização do paciente apaga o CPF e os pagadores dos recebimentos dele (valores ficam) | `src/domain/billing/receipt.ts`, `src/application/billing/resolve-receipt.ts`, `src/app/api/invoices/[id]/payments/[paymentId]/receipt/`, `tests/api/receipt-cpf-routes.test.ts` |
| FIN-RN-16 | Faturamento e Repasses no servidor (#547, [ADR-074](../../adr/074-fundacao-server-first-sessao-dados-e-acoes.md)): faturas, totais, procedimentos e o extrato do mês chegam no HTML pela camada `src/lib/server/data/{invoices,payouts,procedures}.ts` (a mesma das rotas `/api`, valores e arredondamento idênticos), sem chamar `/api` na carga. Filtro de situação (`?status=`) e mês (`?month=`) são `Link`; «Carregar mais» e a busca de paciente seguem em Route Handler (paginação, ADR-069). Receber, desconto, cancelar, emitir fatura, vender pacote, fechar e cancelar repasse são Server Actions (`defineAction`) que gravam e auditam na **mesma transação** ([ADR-075](../../adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md)): falha da trilha desfaz o recebimento/fechamento/venda. Emitir fatura avulsa e vender pacote passam a ser auditados (antes não eram). O papel é o da API (`rolesWithAccessTo`): Admin e Atendente em `/faturamento`, Admin em `/repasses` da clínica, Profissional só o próprio extrato | `src/app/(staff)/{faturamento,repasses}/`, `tests/api/faturamento-paridade.test.ts`, `tests/integracao/faturamento-auditoria-transacional.integracao.ts` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Faturas: filtro, fatura avulsa, receber (Pix, dinheiro, cartões, convênio, transferência), cancelar | entregue | `/faturamento` |
| Pagamento parcial, desconto e recibo `REC-…` (com CPF do pagador e CNPJ da empresa, FIN-RN-15) | entregue | `/faturamento`, `/documentos/recibo/…` |
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
| testes | `tests/domain/`, `tests/application/`, `tests/app/billing-actions.test.ts`, `e2e/faturamento.spec.ts`, `e2e/server-first-faturamento.spec.ts` |
| exceções | [`excecoes.md`](excecoes.md) — matriz de casos de exceção e o teste de cada um |

## Decisões

- Acesso por família de rota (`src/lib/auth/route-family.ts`): repasses da empresa são `administrative`; `/api/my-payouts` é `professional_self`
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — quem vê o quê
