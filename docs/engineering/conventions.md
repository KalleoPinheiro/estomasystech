---
title: "Convenções de código e testes"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-11
---

# Convenções de código e testes

> As regras que valem para toda tarefa estão em [`AGENTS.md`](../../AGENTS.md) § Regras
> invioláveis. Aqui fica o detalhe.

## Lint e formatação (Biome)

- `biome.json` é a única ferramenta de lint + format (issue #107 migrou do ESLint). Rode `npm run lint`
  ou `./node_modules/.bin/biome` — `npx biome` sem versão fixa baixa outro binário e dá falso positivo.
- Complexidade **cognitiva** ≤ 10 (`complexity/noExcessiveCognitiveComplexity`, `error` em `src/`; desligada em `tests/**`) — não é a ciclomática do ESLint antigo. O passivo anterior à regra (71 funções em 56 arquivos) fica em `warn` por arquivo numa lista de `overrides` do `biome.json`, registrada em [`.specs/passivo-complexidade-cognitiva.md`](../../.specs/passivo-complexidade-cognitiva.md). Ao refatorar um arquivo da lista, tire-o dela no mesmo PR. Não acrescente arquivo à lista nem use `biome-ignore` para passar.
- Função ≤ 120 linhas (`complexity/noExcessiveLinesPerFunction`); 320 em `.tsx`; desligado em `tests/**`.
- Não há equivalente ao `max-depth`: aninhamento não é checado pelo linter — mantenha raso.
- Variável não usada: prefixo `_`.
- Supressão só com motivo: `// biome-ignore lint/<categoria>/<regra>: <motivo>`.

## Formulários (`SafeForm`)

Todo `<form>` novo em `src/` usa `SafeForm` (`src/components/safe-form.tsx`).

- `method="post"` é fixo: um `method` vindo de fora não vence. Sem `method`, o envio nativo antes da hidratação é GET e o valor dos campos vai para a URL — histórico do navegador e log de proxy (#777).
- Os campos ficam num `<fieldset disabled>` com `class="contents"` até `useHydrated()`. O que se digita não se perde, e o envio não sai antes de o React assumir.
- Dado pessoal (e-mail, senha, prontuário) não aparece na URL nem no log de acesso. O corpo do POST não entra nesse log.
- Exceção: `src/app/login/login-card.tsx` mantém o `<form method="post">` próprio, com campo somente leitura e botão desabilitado até hidratar (#679).
- `tests/architecture/form-method.test.ts` reprova `<form>` sem `method` e reprova `method` que não seja `post`. O Biome não tem essa regra sem plugin.

## UI (`@still-void/ui`)

- Proibidos: `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` crus e utilitários de cor Tailwind crus.
- Exceção deliberada: `// sv-gap: <slug>` + seção em [`docs/still-void-gaps.md`](../still-void-gaps.md). `npm run check:sv` mantém os dois em sincronia.
- Tema (#425): `<html>` nasce com `data-theme`/`data-accent` de `src/lib/theme.ts` (padrão claro + violeta); `ThemeScript` (com o nonce da CSP) e `ThemeProvider` usam a chave `estomasystech:modo`, a preferência claro/escuro do **aparelho**. O Still Void persiste modo **e** acento nessa chave: quando a cor vier da clínica (#426), chame `setAccent` na montagem para a cor da clínica vencer o valor guardado. Só as 4 cores calibradas do Still Void (sem hex livre).
- Shell mobile (#428): abaixo de `md` a equipe usa a barra inferior (`src/components/app-shell/bottom-nav.tsx`, atalhos por papel em `src/lib/staff-shortcuts.ts`, máx. 5) e a rota `/mais` com o resto, filtrado por `canRoleAccess`; a partir de `md`, o menu lateral. O drawer do menu lateral segue disponível no celular até o bloco "Hoje"/listas decidir removê-lo. Regras de iOS/Android: `viewport-fit=cover` e `theme-color` em `layout.tsx`, `env(safe-area-inset-*)` nas bordas fixas, `min-h-dvh` (nunca `100vh`), campo ≥ 16px (`sv-gap: field-font-16`), alvo ≥ 44px, sem `maximum-scale`.
- Histórico da adoção: [`backlog-design-system.md`](../backlog-design-system.md), `.specs/features/still-void-*`.

## Dados e escopo

- Nunca monte `{ clinicId }` à mão para `getRepositories`: `sessionScope(guard.session)` para leitura,
  `writeScope(guard.session)`/`writeClinicId` para escrita, `clinicScope(id)` explícito.
- `systemScope()` (todas as clínicas) só em arquivos listados em `tests/lib/tenant-scope.test.ts`, com justificativa.
- Dinheiro sempre em centavos inteiros (value object `Money`).
- Toda mudança registra o ator autenticado (auditoria); acesso cross-empresa do Super Admin é sempre auditado.

## Imports dinâmicos

- `import()` recebe caminho literal ou sai de um **mapa estático** `{ '/rota': () => import('...') } as const`. Nunca um template literal com `${}`: o Vite emite `vite:dynamic-import-vars` ("A file extension must be included in the static part of the import"), o aviso enche o log da suíte e esconde os avisos reais. Critério de pronto da suíte: zero warning do Vite.
- Vale em `src/`, `tests/`, `e2e/` e `scripts/`. `scripts/check-dynamic-import.ts` lê a AST e reprova a violação (sai com 1, aponta arquivo e linha); roda no job `estatico` do `ci.yml` e nos perfis `rapido` e `pr` do `scripts/gate-cloud.sh`. Comentário e string que citam o padrão não contam.
- Testes de rota usam o helper `tests/support/api-routes.ts` (`collectionRoute('/invoices')`, `itemRoute('/invoices')`); rota nova entra no mapa dele, com o caminho literal.

```ts
// Certo
const ROUTES = { '/payouts': () => import('@/app/api/payouts/route') } as const;
const route = await ROUTES[path]();

// Errado
const route = await import(`@/app/api${path}/route`);
```

## Telas no servidor (ADR-069, ADR-074)

- Página nova é Server Component. `'use client'` em `page.tsx` só entra na allowlist de `scripts/server-first-allowlist.json` (que só encolhe); `npm run check:server-first` reprova o resto e reprova entrada que já migrou.
- A primeira linha da página é a guarda de `src/lib/server/session.ts`, com `next` apontando para a própria rota. Nunca leia `cookies()` à mão.
- Tela com papel restrito: `requireStaffPageFor('/rota')` no `layout.tsx` do segmento (mesma matriz da API); nada de `RoleGate` no cliente.
- Dado vem de `src/lib/server/data/*` (`import 'server-only'`) por DTO, com `sessionScope`/`writeScope`. Não use `use cache`, `unstable_cache` nem `cacheComponents` para dado de clínica.
- Mutação de tela é `defineAction` (nunca Server Action solta): `audit` é obrigatório, `false` só com motivo no código; com `audit` função o handler grava só por `tx` e a trilha entra na mesma transação ([ADR-075](../adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md)). Teste de ação cobre sem sessão, papel errado e outra clínica, e confirma que nada foi gravado.
- Módulo importado por Server Component não pode ser `'use client'` se exporta valor (constante, função): separe a parte pura (ex.: `staff-pages.ts` × `staff-access.tsx`).
- Erro de servidor para o usuário: mensagem fixa e `digest`, nunca `error.message`.

## Testes

| Pasta | Nível | Dependências |
| --- | --- | --- |
| `tests/domain/` | invariantes de entidade e value object | nenhuma |
| `tests/application/` | casos de uso | repositórios in-memory |
| `tests/infrastructure/` | repositórios reais | PGlite (Postgres em memória, snapshot migrado 1× por execução) |
| `tests/api/` | rota completa, com sessão assinada | PGlite |
| `tests/components/`, `tests/pages/` | renderização e interação | jsdom + Testing Library |
| `tests/scripts/`, `tests/docs/` | gates (`check:sv`, `check:docs`, `check-dynamic-import`) e estrutura da documentação | sistema de arquivos |
| `e2e/` | jornadas no navegador | Playwright, servidor próprio |

- **Data e hora no fuso da clínica ([ADR-073](../adr/073-datas-no-fuso-da-clinica-explicito.md)).** Regra de dia/hora usa `src/domain/shared/time-zone.ts` (e `src/lib/clinic-calendar.ts` no cliente); `getHours`/`setDate`/`new Date(y, m, d)` e `toLocale*String` sem `timeZone` são proibidos em `src/domain`, `src/application`, `src/app` e `src/lib` (`tests/lib/fuso-sem-date-local.test.ts`). Teste de fuso troca `process.env.TZ` e fixa `APP_TIMEZONE`.
- Estilo BDD nos nomes (`Feature / Cenário / Dado-Quando-Então`); fixtures via `tests/support/builders.ts`.
- Regra de negócio crítica (dado de saúde, dinheiro, acesso entre papéis ou empresas, agenda) tem cenário ligado em `tests/bdd/regras-criticas.ts`; `tests/bdd/rastreabilidade.test.ts` falha se faltar ([ADR-048](../adr/048-bdd-com-describe-it-e-rastreabilidade-de-regras-criticas.md)). Regra crítica nova entra no manifesto no mesmo PR.
- Caminho de exceção (entrada inválida, sem permissão, outra clínica, duplicidade, concorrência, falha de integração, estado terminal) vive na matriz `docs/domains/<d>/excecoes.md`, cada linha com o teste que a prova; `tests/bdd/matriz-excecoes.test.ts` falha se o teste citado não existe ([ADR-049](../adr/049-matriz-de-excecoes-por-dominio.md)). Funcionalidade nova com exceção nova atualiza a matriz no mesmo PR.
- Cobertura 100% em linhas, funções, branches e statements nas camadas de regra (domain, application, infrastructure, lib) e piso de 90% global com a UI medida (ADR-050) — limiar em `vitest.config.mts`, CI roda a suíte completa.
- **Teste é intocável (regra 8, [ADR-042](../adr/042-e2e-fora-do-actions-gate-local-com-recibo.md), mantida pelo [ADR-098](../adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md)).** Nunca enfraqueça, apague nem desligue teste, reduza limiar de cobertura ou aumente `retries`/`timeout` para ficar verde: corrija o código. Flake é causa a investigar. Mudar teste existente só quando o requisito de negócio mudou, com `TESTE-ALTERADO: <motivo>` no PR. O hook `.claude/hooks/protect-tests.sh`, o `pre-push` e o CI (`npm run check:testes`) barram isso por script.
- Teste novo descreve comportamento de negócio de uma funcionalidade real (cenário Dado/Quando/Então com os termos do `CONTEXT.md`), inclusive os caminhos de erro e exceção; não espelha a implementação.
- **Toda feature de tela precisa de cobertura para os papéis que a usam** (#204). Rota nova: teste
  pelo proxy (`tests/proxy.test.ts`) para cada papel que deve passar e cada um que deve levar `403`
  — chamar o handler direto não exercita a borda. Tela nova ou fluxo novo: E2E com a sessão real do
  papel (`test.use({ storageState: roleStorageState("atendente") })`, de `e2e/support/roles.ts`);
  o `global-setup` cria `company_admin`, `atendente` e `profissional` (vinculado a um paciente
  semeado) pelo convite + login reais. Item novo no menu entra no smoke por papel
  (`e2e/papeis-smoke.spec.ts`), que falha em qualquer `4xx/5xx` de `/api/*` ou alerta de erro.
  Rodar só como Super Admin foi o que deixou passar os `403` da #188/#189.

## Commits e PRs

- Conventional Commits (`feat(scope): …`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`).
- Hooks: `lint-staged` roda `biome check --write` nos arquivos alterados; `.claude/hooks/` bloqueia comandos git destrutivos.
- Gates do CI: `ci.yml` (typecheck, lint, `check:sv`, `check:docs`, `test:coverage`, build), `gate-pr.yml` (integração, E2E de produção e dev, mutação nos arquivos alterados; [ADR-098](../adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md), configuração do E2E em [ADR-021](../adr/021-e2e-contra-build-de-producao.md)), `recibo-gate.yml` (integridade dos testes e homologação) e `docker.yml` (só quando a imagem ou o backup mudam). Não há recibo do `gate:local` no PR.
- Mudou comportamento de domínio → atualize `docs/domains/<slug>/` no mesmo PR ([governance.md](../governance.md)).
