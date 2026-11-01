---
title: "ADR 085 — Relatórios, auditoria e pedidos do titular no servidor: mês e cursor na URL, decisão por Server Action com aviso depois do commit"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-01
related:
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/domains/relatorios/README.md
  - docs/domains/acesso/README.md
  - docs/domains/pacientes-prontuario/README.md
---

# ADR 085 — Relatórios, auditoria e pedidos do titular no servidor

- **Data:** 2026-11-01
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#555](https://github.com/KalleoPinheiro/estomasystech/issues/555), ticket 14 do épico [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541)). Aplica os ADR-074 e ADR-075 às últimas telas de gestão da equipe.
- **Domínios afetados:** relatórios e acesso (auditoria, pedidos do titular / LGPD).

## Contexto

`/relatorios`, `/auditoria` e `/pedidos-titular` eram páginas `'use client'` que buscavam tudo pelo navegador (3, 2 e 2 chamadas `/api` na carga) e mostravam um indicador de carregamento antes do conteúdo. A decisão do Admin sobre um pedido do titular era um `PATCH` que auditava **antes** da gravação (write-ahead), não na mesma transação.

## Decisão

1. **As três páginas são Server Components e leem em paralelo** com `loadBlock`. A carga não chama `/api`. Uma função de dados por leitura, dividida com a rota (ADR-074 § 3): `getMonthlyReportFor` (`reports.ts`), `listAuditEventsFor` e `getPatientNameFor` (`audit.ts`), `listDataRequestsFor` (`data-requests.ts`). As rotas `GET /api/reports`, `/api/audit` e `/api/data-requests` chamam as mesmas funções.
2. **Relatório: o mês vai na URL (`?month=YYYY-MM`)** e as setas são `Link`. Mês inválido volta ao corrente. O mês anterior (para os deltas) é lido em paralelo; se só ele falha, a tela mostra o mês pedido sem deltas. O cache de mês encerrado em memória, chaveado por empresa, **fica como está** (ADR-069 § 3) dentro de `getMonthlyReportFor`. A tela não tem gráfico, então não há `next/dynamic` a aplicar.
3. **Auditoria: filtros e cursor na URL** (`?paciente=&de=&ate=&cursor=`). Datas inválidas são descartadas. A paginação (#521) é por `Link` («Próxima página» leva o cursor da última linha; «Voltar ao início»). Os filtros são uma ilha cliente (`audit-filters.tsx`) que troca a URL com `router.replace` e descarta o cursor. O nome do paciente do filtro é lido no servidor e passado ao `PatientPicker` (`selectedName`), sem `GET /api/patients/:id`. A busca digitada do seletor continua pela API (exceção do ADR-069).
4. **Pedidos do titular: situação por `?status=` (`Link`)** e a decisão do Admin é a Server Action `resolveDataRequest`, com papel `company_admin`, `zod` (justificativa obrigatória, até 1000), escopo de escrita e **auditoria na mesma transação** da decisão (`update`/`data_request`, `tipo: situação`). Se a trilha falha, o pedido segue pendente e a tela não atualiza. A leitura da fila repete a checagem de Admin (dado de pessoa): outro papel recebe o alerta de acesso, nunca a lista.
5. **O aviso ao paciente sai depois do commit.** `ResolveDataSubjectRequest.notifyDecision` (antes privado) é chamado depois da Server Action confirmar; falha no envio vira `notified: false` e nunca desfaz a decisão, como antes. A rota `PATCH /api/data-requests/:id` fica como está.
6. **Tamanho da página da Auditoria: 25 eventos, único.** O #521 tinha 25 abaixo de 768 px e 50 acima, decidido no navegador pela largura da tela. O servidor não conhece a largura (e o cabeçalho de dica de cliente não existe no Safari), então a página passou a ter um tamanho só, o do celular. **Pergunta aberta (PO):** manter 25 em todas as telas, ou oferecer 50 no desktop com um controle explícito («Eventos por página»)?

## Alternativas

- **Manter 25/50 por largura de tela:** exige ler o tamanho no navegador e voltar à busca por `/api`, ou ler um cabeçalho que nem todo navegador envia.
- **Auditar antes de decidir (write-ahead) na ação:** deixa trilha de algo que pode não ter acontecido; a transação única é a regra do ADR-075.
- **Enviar o e-mail dentro da transação:** um aviso enviado com a decisão desfeita é pior que nenhum aviso.

## Consequências

- As três telas chegam inteiras no HTML; trocar mês, filtro ou situação refaz a página no servidor, com histórico de navegação de graça.
- A decisão do titular passa a ter rollback provado em Postgres real (`tests/integracao/pedidos-titular-auditoria-transacional.integracao.ts`).
