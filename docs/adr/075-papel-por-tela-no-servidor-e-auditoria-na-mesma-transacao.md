---
title: "ADR 075 — Papel por tela no servidor e auditoria na mesma transação da gravação"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
related:
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/adr/002-autorizacao-em-duas-camadas.md
  - docs/domains/acesso/README.md
---

# ADR 075 — Papel por tela no servidor e auditoria na mesma transação da gravação

- **Data:** 2026-10-25
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#545](https://github.com/KalleoPinheiro/estomasystech/issues/545), ticket 4 do épico [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541)). Complementa o [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md) (passo 4 do `defineAction`).
- **Domínios afetados:** acesso (casca da equipe) e todo `defineAction` que grava.

## Contexto

Dois pontos do ADR-074 ficaram abertos para a #545: o papel por tela ainda era decidido no cliente (`RoleGate`, depois de a identidade carregar) e a auditoria de uma Server Action era registrada em `after()`, fora da gravação, best-effort. O primeiro faz a tela montar e piscar antes do «sem permissão». O segundo permite gravação de dado de saúde sem trilha se o registro falhar, o que a LGPD não admite.

## Decisão

1. **Papel por tela no servidor.** `requireStaffPageFor(href)` (`src/lib/server/session.ts`) exige a equipe da clínica e aplica a **mesma matriz de papéis da API** à tela (`STAFF_PAGES` + `canRoleAccess`, sem regra duplicada). Entra no `layout.tsx` de cada segmento restrito de `(staff)`; o papel sem acesso recebe `forbidden()` (`forbidden.tsx` do grupo, ver Errata) antes de a página montar, sem chamada de API e sem salto de layout. Caminho fora do mapa só exige a equipe. Sem sessão vai a `/login?next=<tela>`. O `RoleGate` deixa de ser montado pelo layout; esconder item no menu continua sendo UX ([ADR-003](003-modelo-de-papeis-multi-empresa.md)), a barreira são o proxy, a API e esta guarda.
2. **Auditoria é parte da gravação.** Em `defineAction` com `audit` função, o `handler` roda **dentro de `transactions.run`** e grava apenas pelos repositórios de `tx` (`TransactionScope`); o evento de auditoria é persistido na **mesma transação** (`recordAuditNow` sobre `tx.auditEvents`) antes do commit. Se a auditoria falha, ou o `handler` falha depois de gravar, tudo é desfeito, a ação responde o envelope de erro e **não chama `refresh()`**. Nunca fica gravação sem trilha.
3. **Dois contratos de tipo.** `AuditedActionDefinition` (handler recebe `tx`; `audit` é função) e `UnauditedActionDefinition` (`audit: false`, sem transação; leitura ou ação que não toca dado de clínica nem de pessoa). `defineAction` tem as duas sobrecargas, então o handler que grava sem `tx` nem compila no caso auditado.
4. **Limite conhecido.** `TransactionScope` é enxuto (YAGNI): ação que precisar de outro repositório dentro da transação acrescenta o repositório a `TransactionScope` e a `DrizzleTransactionManager` no mesmo PR, com teste. Usar `getRepositories(scope)` dentro de handler auditado grava fora da transação e trava o PGlite; a revisão deve barrar.

## Alternativas

- **Manter `after()` e logar a falha** (ADR-074): simples, mas aceita gravação sem trilha em falha de banco ou de processo; reprovado pelo PO para dado de saúde.
- **Auditar antes e gravar depois, sem transação**: uma falha na gravação deixa trilha de algo que não aconteceu; trilha falsa é tão ruim quanto trilha ausente.
- **Guarda por papel só na página**: cada tela repetiria a chamada e uma tela nova esqueceria; no layout do segmento a guarda cobre todas as páginas filhas.

## Errata (2026-10-25, revisão do #594)

- **Status HTTP da tela negada.** O texto acima fala em «403», mas a resposta HTTP da tela negada é **200**: o shell já saiu em streaming sob o `loading.tsx` quando o `forbidden()` do layout filho dispara. O correto é «tela de acesso negado (`forbidden.tsx`) renderizada no servidor»: o HTML traz a marca do fallback 403 do Next, nenhum dado da tela e nenhuma chamada de API. Decisão do PO: aceito, porque não vaza dado e a API continua respondendo `403`; quem precisar do status HTTP trata o papel no proxy, em ADR próprio.
- **Rollback da auditoria em Postgres real.** Hoje o rollback é provado só em PGlite (`tests/lib/server/define-action.test.ts`). Quando a primeira ação real migrar para `defineAction` (a Hoje, #548), entra um teste em `npm run test:integracao` (Postgres real) provando que a falha da trilha desfaz a gravação.
- **`TransactionScope` cresce por necessidade (#547).** O Faturamento acrescentou `invoices`, `sessionPackages`, `professionals`, `producedSessions` e `commissionPayouts` ao escopo transacional (e ao `DrizzleTransactionManager`), cada um com teste. A venda de pacote roda o caso de uso `SellSessionPackage` sobre os repositórios de `tx`, sem abrir transação própria.
- **Rollback em Postgres real (cumprido).** `tests/integracao/faturamento-auditoria-transacional.integracao.ts` prova, contra Postgres e não PGlite, que a falha da trilha desfaz o recebimento, o fechamento do repasse, o cancelamento do repasse e a venda de pacote, e que duas quitações simultâneas da mesma fatura gravam um só recebimento (FIN-RN-12).
