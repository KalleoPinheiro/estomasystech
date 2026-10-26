---
title: "ADR 074 — Fundação server first: sessão por cookies, camada de dados, Server Actions e boundaries"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
related:
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/adr/002-autorizacao-em-duas-camadas.md
  - docs/adr/001-multi-tenancy.md
  - docs/engineering/architecture.md
---

# ADR 074 — Fundação server first: sessão por cookies, camada de dados, Server Actions e boundaries

- **Data:** 2026-10-25
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#544](https://github.com/KalleoPinheiro/estomasystech/issues/544), ticket 3 do épico [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541)). Implementa o [ADR-069](069-dados-no-servidor-e-politica-de-cache.md); não o altera.
- **Domínios afetados:** transversal (acesso); piloto na tela `/mais`.

## Contexto

O ADR-069 decidiu que as telas carregam dado em Server Components e escrevem por Server Actions, sem cache compartilhado de dado de clínica. Faltava a infraestrutura que todas as telas seguintes (#545, #548 e demais) vão reutilizar. Este ADR fixa as escolhas de forma que cada uma delas seja difícil de usar errado.

## Decisão

1. **Sessão no servidor** (`src/lib/server/session.ts`, `import 'server-only'`). `readSession()` lê o cookie por `cookies()`, verifica com `verifySessionToken` e aplica a **mesma revogação do proxy** (`isSessionRevoked`, [ADR-005](005-revogacao-de-sessao-por-versao.md)). Vem dentro de `React.cache()`: layout, página e componentes da mesma requisição leem o cookie e consultam a conta uma única vez. Sem `AUTH_SECRET` lança erro (falha fechado, regra 2). As guardas `requireStaffPage`, `requirePortalPage` e `requirePlatformPage` fazem `redirect('/login?next=…')` sem sessão (com `error=session_expired` se havia cookie) e `forbidden()` para sessão de outra família ou papel fora de `roles`. O super_admin não entra em tela da clínica ([ADR-007](007-super-admin-operador-da-plataforma.md)). O `next` é passado pela página e validado por `safeNextPath` (sem open redirect).
2. **`forbidden()` exige `experimental.authInterrupts`** no Next 16.4. Habilitamos a opção em `next.config.ts` porque a alternativa (guarda que devolve `null` e a página decide) deixa cada tela inventar o seu 403. Cada grupo de rotas tem `forbidden.tsx`.
3. **Camada de dados** (`src/lib/server/data/*`, `server-only`): funções que chamam o repositório/caso de uso com `sessionScope`/`writeScope` e devolvem **DTO** de `src/lib/dto`, nunca entidade. A rota de API que servia o mesmo dado passa a chamar a mesma função (um só lugar monta o DTO; ex.: `buildSidebarIdentity` serve `/api/auth/identity` e o layout). Leituras expostas às telas vêm em `React.cache()`. Nada é guardado entre requisições.
4. **`defineAction`** (`src/lib/server/define-action.ts`): a Server Action é um endpoint público, então a ordem é fixa e tudo roda dentro dela: sessão e papel (`access: staff | portal | platform`, com `roles` opcional) → `zod` na entrada → `handler({ input, session, scope })` com **`writeScope`** → auditoria (`audit` é obrigatório: função que devolve o `AuditInput`, ou `false` explícito; a partir da #545 ela entra na mesma transação da gravação, [ADR-075](075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md)) → `refresh()`. Devolve o envelope `{ success, data, error }` (`src/lib/action-result.ts`), com as mesmas mensagens e status das rotas (`describeFailure` em `api-response.ts`, extraída de `handleRequest`). Falha de guarda, validação ou handler **não chama `refresh()`** e não grava. O cliente usa `useAction` (`src/lib/use-action.ts`, `useActionState`).
5. **Limite de requisições para Server Action** no `src/proxy.ts`: o `POST` com cabeçalho `Next-Action` passa por um `SharedRateLimiter` próprio (`action`), com a mesma chave (conta autenticada ou IP) e o mesmo teto padrão da API, mas variável própria (`ACTION_RATE_LIMIT_MAX`, padrão 120/min; relaxar `API_RATE_LIMIT_MAX` em teste não relaxa as ações). Contador separado: ação não consome o balde da API nem o inverso.
6. **Boundaries por grupo** (`(staff)`, `portal`, `plataforma`, `documentos`): `loading.tsx`, `error.tsx`, `not-found.tsx` e `forbidden.tsx`, todos finos sobre `src/components/route-states.tsx` (Still Void). O `error.tsx` mostra mensagem fixa e o `digest` para casar com o log; nunca a mensagem do erro. Usa `retry` (API do Next 16.4).
7. **Casco da equipe no servidor**: `(staff)/layout.tsx` lê identidade e versão (`loadStaffShell`) e as entrega a `StaffLayoutClient` (`initialIdentity`, `initialVersion`). O menu, o rodapé e o papel já estão no HTML; sem `initial*` o cliente busca por `/api`, como antes (telas isoladas em teste). Falha de leitura vira `undefined`, não derruba a tela.
8. **Gate `check:server-first`** (`scripts/check-server-first.ts`): lista as páginas `'use client'` e compara com `scripts/server-first-allowlist.json`. Página de cliente nova falha; entrada que já é Server Component também falha, então **a lista só encolhe**. Roda no `ci.yml`. A inclusão no `gate:local` fica com o Kalléo (`scripts/gate/` é dele).
9. **Piloto `/mais`**: Server Component assíncrono; o papel vem de `requireStaffPage`. Para isso `STAFF_PAGES`, `canRoleAccess` e afins saíram de `staff-access.tsx` (módulo de cliente) para `src/lib/staff-pages.ts` (puro), que o servidor importa; `staff-access.tsx` os reexporta.

## Alternativas

- **`proxy.ts` repassa o caminho em cabeçalho para o `next` do login**: evita o parâmetro, mas muda um arquivo de 100% de cobertura e o contrato de cabeçalhos de toda requisição. O parâmetro é explícito e o proxy já redireciona com o `next` completo.
- **Compartilhar o balde da API com as ações**: um formulário em rajada derrubaria as leituras da tela, e o contrário.
- **Auditoria opcional no `defineAction`**: esquecer vira padrão. `false` explícito torna a decisão visível na revisão.

## Consequências

- Toda tela migrada segue o mesmo caminho: guarda → camada de dados → DTO por props; escrita por `defineAction`.
- O layout da equipe passa a depender do banco para renderizar o casco (antes só o cliente dependia). Falha cai no comportamento antigo.
- O contador de triagem da barra inferior do celular (Profissional) saiu do cliente com a migração da Triagem (#549): `loadStaffShell` o conta no servidor (`countLinkedTriageQueue`, escopo R4) e o entrega por props; sem o valor (falha de leitura, tela isolada em teste) a barra busca `/api/photos/triage` como antes.
- O `layout.tsx` não é fronteira de segurança (não re-renderiza a cada navegação): cada página chama a própria guarda.

## Relacionado

[ADR-069](069-dados-no-servidor-e-politica-de-cache.md), [ADR-002](002-autorizacao-em-duas-camadas.md), [ADR-001](001-multi-tenancy.md), [`architecture.md`](../engineering/architecture.md) § Telas no servidor.
