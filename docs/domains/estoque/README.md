---
title: "Domínio: Estoque"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
domain: estoque
---

# Estoque

## Resumo

Catálogo de insumos (bolsas, placas, coberturas, cremes), lotes com validade, movimentações de
entrada e saída e o consumo automático por kit de procedimento.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Supply`, `Supply Batch`, `Stock Movement`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| EST-RN-01 | Estoque nunca fica negativo: saída maior que o saldo é bloqueada com mensagem | `src/domain/inventory/stock-movement.ts` |
| EST-RN-02 | Toda movimentação exige motivo e fica no histórico | idem |
| EST-RN-03 | Preço unitário congelado no momento da movimentação | idem |
| EST-RN-04 | Alerta de estoque baixo quando quantidade ≤ mínimo | `src/application/inventory/get-supply-insights.ts` |
| EST-RN-05 | Kit do procedimento baixa os insumos ao ser dispensado | `src/application/inventory/dispense-procedure-kit.ts`, `src/domain/catalog/procedure-kit.ts` |
| EST-RN-06 | Saldo muda só por movimentação atômica (`adjustStock`); editar o cadastro do insumo nunca regrava o saldo, então não desfaz baixa concorrente (#192) | `DrizzleSupplyRepository.save` |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Catálogo de insumos, mínimo e preço | entregue | `/materiais` |
| Entradas, saídas e histórico | entregue | `/materiais` |
| Lotes e validade | entregue | `/materiais` |
| Alerta de estoque baixo | entregue | `/materiais`, dashboard |

PRD: [fase 1](../../product/prd-fase-1.md) (F4).

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/inventory/`, `src/domain/catalog/procedure-kit.ts` |
| casos de uso | `src/application/inventory/` |
| API | `src/app/api/supplies/` |
| UI | `src/app/(staff)/materiais/` (página no servidor, ações em `supply-actions.ts`) |
| leituras | `src/lib/server/data/supplies.ts` (a mesma resposta das rotas) |
| testes | `tests/domain/`, `tests/application/`, `e2e/inventario.spec.ts` |
| exceções | [`excecoes.md`](excecoes.md) — matriz de casos de exceção e o teste de cada um |

## Decisões

- [ADR-083](../../adr/083-materiais-e-procedimentos-no-servidor.md): `/materiais` no servidor; cadastro, edição e movimentação são Server Actions com auditoria na mesma transação
- Segue [ADR-001](../../adr/001-multi-tenancy.md) (estoque por empresa)
