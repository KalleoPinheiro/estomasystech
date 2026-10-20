---
title: "Convenções de código e testes"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
---

# Convenções de código e testes

> As regras que valem para toda tarefa estão em [`AGENTS.md`](../../AGENTS.md) § Regras
> invioláveis. Aqui fica o detalhe.

## Lint e formatação (Biome)

- `biome.json` é a única ferramenta de lint + format (issue #107 migrou do ESLint). Rode `npm run lint`
  ou `./node_modules/.bin/biome` — `npx biome` sem versão fixa baixa outro binário e dá falso positivo.
- Complexidade **cognitiva** ≤ 10 (`complexity/noExcessiveCognitiveComplexity`) — não é a ciclomática do ESLint antigo.
- Função ≤ 120 linhas (`complexity/noExcessiveLinesPerFunction`); 320 em `.tsx`; desligado em `tests/**`.
- Não há equivalente ao `max-depth`: aninhamento não é checado pelo linter — mantenha raso.
- Variável não usada: prefixo `_`.
- Supressão só com motivo: `// biome-ignore lint/<categoria>/<regra>: <motivo>`.

## UI (`@still-void/ui`)

- Proibidos: `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` crus e utilitários de cor Tailwind crus.
- Exceção deliberada: `// sv-gap: <slug>` + seção em [`docs/still-void-gaps.md`](../still-void-gaps.md). `npm run check:sv` mantém os dois em sincronia.
- Histórico da adoção: [`backlog-design-system.md`](../backlog-design-system.md), `.specs/features/still-void-*`.

## Dados e escopo

- Nunca monte `{ clinicId }` à mão para `getRepositories`: `sessionScope(guard.session)` para leitura,
  `writeScope(guard.session)`/`writeClinicId` para escrita, `clinicScope(id)` explícito.
- `systemScope()` (todas as clínicas) só em arquivos listados em `tests/lib/tenant-scope.test.ts`, com justificativa.
- Dinheiro sempre em centavos inteiros (value object `Money`).
- Toda mudança registra o ator autenticado (auditoria); acesso cross-empresa do Super Admin é sempre auditado.

## Testes

| Pasta | Nível | Dependências |
| --- | --- | --- |
| `tests/domain/` | invariantes de entidade e value object | nenhuma |
| `tests/application/` | casos de uso | repositórios in-memory |
| `tests/infrastructure/` | repositórios reais | PGlite (Postgres em memória, snapshot migrado 1× por execução) |
| `tests/api/` | rota completa, com sessão assinada | PGlite |
| `tests/components/`, `tests/pages/` | renderização e interação | jsdom + Testing Library |
| `tests/scripts/`, `tests/docs/` | gates (`check:sv`, `check:docs`) e estrutura da documentação | sistema de arquivos |
| `e2e/` | jornadas no navegador | Playwright, servidor próprio |

- Estilo BDD nos nomes (`Feature / Cenário / Dado-Quando-Então`); fixtures via `tests/support/builders.ts`.
- Cobertura ≥ 90% em linhas, funções, branches e statements — limiar em `vitest.config.mts`, CI roda a suíte completa.
- **Teste é intocável (regra 8, [ADR-042](../adr/042-e2e-fora-do-actions-gate-local-com-recibo.md)).** Nunca enfraqueça, apague nem desligue teste, reduza limiar de cobertura ou aumente `retries`/`timeout` para ficar verde: corrija o código. Flake é causa a investigar. Mudar teste existente só quando o requisito de negócio mudou, com `TESTE-ALTERADO: <motivo>` no PR. O hook `.claude/hooks/protect-tests.sh`, o `pre-push` e o CI (`npm run check:testes`) barram isso por script.
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
- Gates do CI: `ci.yml` (typecheck, lint, `check:sv`, `check:docs`, `test:coverage`, build), `recibo-gate.yml` (recibo do `gate:local` e integridade dos testes) e `docker.yml` (só quando a imagem ou o backup mudam). O E2E não roda no Actions: é o `npm run gate:local` ([ADR-042](../adr/042-e2e-fora-do-actions-gate-local-com-recibo.md); configuração em [ADR-021](../adr/021-e2e-contra-build-de-producao.md)).
- Mudou comportamento de domínio → atualize `docs/domains/<slug>/` no mesmo PR ([governance.md](../governance.md)).
