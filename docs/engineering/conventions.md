---
title: "Convenções de código e testes"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
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
- Nunca enfraqueça uma asserção nem use `skip` para ficar verde; flake é causa a investigar, não motivo para pular.

## Commits e PRs

- Conventional Commits (`feat(scope): …`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`).
- Hooks: `lint-staged` roda `biome check --write` nos arquivos alterados; `.claude/hooks/` bloqueia comandos git destrutivos.
- Gates do CI (`.github/workflows/ci.yml`): typecheck, lint, `check:sv`, `check:docs`, `test:coverage`; job separado de E2E.
- Mudou comportamento de domínio → atualize `docs/domains/<slug>/` no mesmo PR ([governance.md](../governance.md)).
