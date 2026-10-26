---
title: "ADR 076 — Faturamento e Repasses no servidor: escopo transacional por necessidade e rollback provado em Postgres real"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
related:
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/domains/financeiro/README.md
---

# ADR 076 — Faturamento e Repasses no servidor: escopo transacional por necessidade e rollback provado em Postgres real

- **Data:** 2026-10-25
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#547](https://github.com/KalleoPinheiro/estomasystech/issues/547), do épico [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541)). Cumpre os pontos 4 do [ADR-075](075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md) e a pendência de prova em Postgres real registrada na errata dele. O ADR-075 não é alterado.
- **Domínios afetados:** financeiro (`/faturamento`, `/repasses`) e a infraestrutura de transação.

## Contexto

O ADR-075 deixou duas coisas para a primeira tela financeira: o `TransactionScope` só cresce quando uma ação precisa de outro repositório, e o rollback da auditoria só estava provado em PGlite. Faturamento e Repasses são a primeira superfície que grava dinheiro e comissão por Server Action, então o risco de recebimento ou fechamento sem trilha é o maior do sistema.

## Decisão

1. **`TransactionScope` ganha os repositórios do financeiro**: `invoices`, `sessionPackages`, `professionals`, `producedSessions` e `commissionPayouts` (e o `DrizzleTransactionManager`), cada um coberto por teste. A venda de pacote roda o caso de uso `SellSessionPackage` sobre os repositórios de `tx` (`{ run: (work) => work(tx) }`), sem abrir transação própria.
2. **Leitura e escrita compartilham a camada.** As telas e as rotas `/api` leem pela mesma função (`src/lib/server/data/{invoices,payouts,procedures}.ts`); a regra de fatura (pagar, desconto, cancelar) vive em `src/lib/server/invoice-actions.ts`, usada pelo `PATCH /api/invoices/:id` e pela Server Action. Assim, valores, arredondamento e comissões não podem divergir entre tela e API; isso é provado por `tests/api/faturamento-paridade.test.ts` (escrito antes da migração, verde antes e depois).
3. **Auditoria nova.** Emitir fatura avulsa e vender pacote passam a ser auditados, como já eram receber, desconto, cancelar, fechar e cancelar repasse. Todos na mesma transação da gravação.
4. **Prova em Postgres real.** `tests/integracao/faturamento-auditoria-transacional.integracao.ts` (`npm run test:integracao`) prova que a falha da trilha desfaz recebimento, fechamento de repasse, cancelamento de repasse e venda de pacote, e que duas quitações simultâneas da mesma fatura gravam um só recebimento (FIN-RN-12, lock da linha).
5. **Navegação por URL.** Filtro de situação (`?status=`) e mês (`?month=`) são `Link`, não estado de cliente. «Carregar mais» e a busca de paciente seguem em Route Handler (exceção de paginação do ADR-069).

## Alternativas

- **Reaproveitar `getRepositories(scope)` dentro do handler**: grava fora da transação e trava o PGlite; barrado pelo ADR-075.
- **Provar o rollback só em PGlite**: o isolamento e o lock de linha do Postgres real são o que a produção usa; PGlite não prova a concorrência.
