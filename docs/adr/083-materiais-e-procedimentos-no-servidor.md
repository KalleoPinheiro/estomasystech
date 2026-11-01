---
title: "ADR 083 — Materiais e procedimentos no servidor: leituras por props, Server Actions com auditoria transacional e histórico sob demanda"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
related:
  - docs/adr/069-performance-front-linha-de-base.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/adr/078-gravacoes-da-agenda-em-server-actions.md
  - docs/domains/estoque/README.md
---

# ADR 083 — Materiais e procedimentos no servidor: leituras por props, Server Actions com auditoria transacional e histórico sob demanda

- **Data:** 2026-10-31
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#556](https://github.com/KalleoPinheiro/estomasystech/issues/556), PR 1: Materiais). Aplica os ADR-074 e ADR-075 a estoque e catálogo.
- **Domínios afetados:** estoque e agenda (catálogo de procedimentos).

## Contexto

`/materiais` (945 linhas) e `/procedimentos` (625) eram páginas `'use client'` que buscavam tudo pelo navegador (`/api/supplies`, `/api/supplies/insights`, `/api/appointments` do dia) e gravavam por `fetch`. A carga virava cascata e o conteúdo trocava de forma ao chegar (CLS 0,09 e 0,19 em Materiais). Entrada e baixa de estoque, dado de operação da clínica, gravavam sem trilha na mesma transação.

## Decisão

1. **A página é Server Component e lê em paralelo.** `materiais/page.tsx` carrega insumos, previsão de ruptura e lotes a vencer, e as consultas do dia (vínculo da baixa), cada bloco com `loadBlock`: um bloco que falha vira alerta com «Tentar novamente» (`router.refresh()`) e não derruba a tela. A carga não chama `/api`.
2. **Uma função de dados por leitura, dividida com a rota.** `src/lib/server/data/supplies.ts` ganha `getSupplyInsightsFor` e `listSupplyMovementsFor`; `GET /api/supplies/insights` e `GET /api/supplies/:id/movements` chamam as mesmas funções (ADR-074 § 3). Escopo da sessão (`sessionScope`), nada em cache compartilhado.
3. **Seções, não uma página gigante.** Servidor: cabeçalho, alerta de lotes (`expiry-banner.tsx`), alertas de erro. Ilhas de cliente só onde há estado: `SuppliesBoard` (busca, linhas, ficha ao lado, modais), `SupplyForm`, `MovementForm`, `MovementHistory`, `NewSupplyButton`.
4. **Gravações são Server Actions** (`supply-actions.ts`, `defineAction`): `createSupply`, `updateSupply`, `registerStockMovement`, com o mesmo papel da API (`rolesWithAccessTo('/api/supplies')`), `zod`, escopo de escrita e **auditoria na mesma transação** (ADR-075). Entrada com lote grava saldo, movimento, lote e trilha juntos; se a trilha falha, nada fica. A trilha leva só o tipo e a quantidade («entrada de 10», «baixa de 4»), nunca o motivo livre. O saldo continua atômico no banco (`adjustStock`), então duas baixas simultâneas nunca deixam o estoque negativo. A baixa automática do kit na conclusão da consulta **não muda** (best-effort pós-commit, ADR-078).
5. **`TransactionScope` ganha `supplies`, `stockMovements` e `supplyBatches`**; para o PR 2, `procedureKits`. Tudo que a ação lê e grava vem do escopo da transação.
6. **O histórico de um insumo é lido sob demanda.** É um modal aberto por clique, não faz parte da carga: segue `GET /api/supplies/:id/movements` (a mesma função das rotas). Evita ler o histórico de todos os insumos na carga.
7. **Sem regra de negócio nova** (regra 5 do AGENTS.md): estoque, preço, mínimo e validade são exatamente os de antes.

## Alternativas

- **Ler o histórico de todos os insumos no servidor:** cresce sem limite com o uso e nenhuma pessoa abre mais que uma ficha por vez.
- **Server Action também para o histórico:** a leitura chamaria `refresh()` e renderizaria a página de novo a cada abertura.
- **Manter as gravações por `fetch`:** deixa movimentação de estoque sem trilha transacional.

## Consequências

- Materiais chega inteiro no HTML e não troca de forma depois; gravar atualiza a tela sozinho (`refresh()` da ação).
- Pergunta aberta (PO): nenhuma nova.
- A parte de Procedimentos está na atualização abaixo (PR 2).

## Atualização — PR 2 (Procedimentos)

`/procedimentos` segue as mesmas decisões 1 a 7.

- **Página**: `page.tsx` lê o catálogo e os insumos do kit em paralelo (`loadBlock`). Servidor: cabeçalho e alerta de erro. Ilhas de cliente: `ProceduresBoard` (busca, linhas, ficha ao lado, ativar/desativar), `ProcedureForm`, `KitForm`, `NewProcedureButton`.
- **Ações** (`procedure-actions.ts`, papel da API de procedimentos): `createProcedure`, `updateProcedure` (editar, ativar e desativar) e `setProcedureKit`, com auditoria na mesma transação («cadastrado», «editado», «desativado», «reativado», «kit com N itens»). A regra de nome repetido e de edição mora em `src/lib/server/procedure-writes.ts` e é a mesma das rotas `POST/PATCH /api/procedures`, que passam a chamá-la: uma regra, dois caminhos.
- **Kit**: o kit só troca por inteiro e dentro da transação; insumo de outra empresa não entra (a baixa automática debitaria o estoque dela) e procedimento de outra empresa responde 404. Os itens do kit de um procedimento são lidos sob demanda ao abrir o kit (`getProcedureKitFor`, a mesma resposta de `GET /api/procedures/:id/kit`).
- **`TransactionScope`** ganha `procedureKits` (o repositório do kit não tem `clinic_id`; o escopo vem do procedimento, validado na mesma transação).
