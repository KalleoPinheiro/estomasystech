# AGENTS.md — EstomaSysTech

> **L0 · Fonte única da verdade (SSOT) para humanos e LLMs.** Este arquivo diz *o que é*, *o que
> nunca fazer* e *onde procurar*. Detalhe mora nos arquivos linkados — leia só o que a tarefa
> pede. `CLAUDE.md` importa este arquivo; Cursor, Copilot, Codex e Gemini o leem nativamente.

## Produto

Sistema de gestão clínica multiempresa para clínicas de **estomaterapia** (feridas, estomias):
prontuário com avaliações seriadas e fotos, agenda com anti-conflito, faturamento e repasses,
estoque de insumos, portal do paciente e lembretes por WhatsApp. Dado de saúde sob LGPD:
**segurança do dado vem antes de crescimento**.

- Glossário (use estes termos, não sinônimos): [`CONTEXT.md`](CONTEXT.md)
- Visão, objetivos e personas: [`docs/product/visao-produto.md`](docs/product/visao-produto.md)
- Roadmap (o que está entregue/especificado/backlog): [`docs/plano-evolucao-faseado.md`](docs/plano-evolucao-faseado.md)

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Drizzle ORM + Postgres 18 (produção, compose e CI; ADR-037) ·
Tailwind v4 · `@still-void/ui` · Vitest + Playwright · Biome · npm (sem workspaces).
Arquitetura em camadas `app → application → domain ← infrastructure`:
[`docs/engineering/architecture.md`](docs/engineering/architecture.md).

## Comandos

| Comando | Quando | Nota |
| --- | --- | --- |
| `npm run typecheck` | antes de commitar | `tsc --noEmit` |
| `npm run lint` / `npm run format` | antes de commitar | Biome é a única ferramenta de lint+format |
| `npm run test:coverage` | gate de CI | **100% em domain, application, infrastructure e lib; piso 90% global, UI incluída** ([ADR-050](docs/adr/050-limiar-100-por-camada-e-ui-medida.md)) |
| `npm run gate:local` | opcional no loop; o `release:cut` o usa | build + E2E + gates + integridade dos testes; sem recibo no PR: o E2E e a mutação rodam no Actions ([ADR-098](docs/adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md)) |
| `npm run changeset` / `npm run check:changeset` | PR que toca `src/`, `drizzle/` ou `Dockerfile` | um `.changeset/*.md` por PR (`--empty` se nada muda para a clínica); níveis no [ADR-043](docs/adr/043-versionamento-com-changesets-e-release-por-tag.md) |
| `npm run release:sync` / `release:cut` / `release:publish` | release de produção | fluxo `feat → release/vX.Y.Z → main` ([ADR-052](docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md), `homologacao.md` § 1): `sync` mergeia a `main` na release; `cut` (na release, com a marca `homologacao/vX.Y.Z`) roda o `release:prepare` primeiro, o gate da release uma vez em worktree limpo e abre o PR para a `main` ([ADR-071](docs/adr/071-corte-de-release-em-comando-unico.md)); nunca rode o `prepare` e o gate à mão; `publish` (na `main`) tagueia o commit de merge, `--rollback=redeploy\|backup`; deploy da tag (`producao.md` § 3.1) |
| `npm run check:testes` | automático no `pre-push` e no CI | regra 8: falha se um teste foi enfraquecido |
| `npm run test:changed [-- <ref>]` | loop local (ex.: `-- origin/main`) | não substitui `test:coverage`; o CI roda a suíte completa |
| `npm run test:mutacao` | mudou regra em `src/domain/**` ou `src/application/**` | Stryker + Vitest (`stryker.config.json`, `vitest.mutacao.config.mts`); o `gate:local` já roda sozinho nos arquivos alterados de domain/application; rodada completa ~1h20 (mensal no Actions, último dia do mês); `-- --mutate <arquivo>` para um arquivo; relatório em `reports/mutation` ([ADR-047](docs/adr/047-testes-de-mutacao-com-stryker.md), [ADR-051](docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md)) |
| `npm run test:e2e` | fluxos de UI (loop local) | build + Playwright contra `next start` e `next dev` ([ADR-021](docs/adr/021-e2e-contra-build-de-producao.md)); `:prod` e `:dev` separados; o E2E **não roda no Actions** |
| `npm run check:sv` | toca JSX | adoção de `@still-void/ui` |
| `npm run check:docs` | toca `.md` | links e frontmatter |
| `npx tsx scripts/check-dynamic-import.ts` | escreve `import()` | reprova `import()` com template literal (`${}`); roda no `ci.yml` e no `gate-cloud.sh` |
| `npm run ambiente:local` / `ambiente:local:down` | validar à mão com Postgres 18 + app + massa fictícia | exige daemon Docker; recusa banco de produção ([ADR-044](docs/adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md)) |
| `npm run test:integracao` | mudou persistência, migração ou concorrência | suíte contra Postgres real, não PGlite; fora do `gate:local` |
| `npm run db:migrate` | schema mudou | drizzle-kit |
| `npm run build` | — | **não remova** `--max-old-space-size=4096` (e o `ENV NODE_OPTIONS` do estágio `builder` do `Dockerfile`) |

Setup, variáveis de ambiente e Docker: [`docs/engineering/onboarding.md`](docs/engineering/onboarding.md).
Deploy, backup, segredos e rotação em produção: [`docs/engineering/producao.md`](docs/engineering/producao.md).
**Produção está no ar** (Coolify + Dockerfile, deploy manual): estado real em `producao.md` § 0, release e
rollback em § 3.1, fumaça pós-deploy somente leitura em § 9.6. Merge na `main` não é deploy.

## Regras invioláveis

1. **Escopo de empresa.** Nunca monte `{ clinicId }` à mão. Leitura: `sessionScope(guard.session)`;
   escrita: `writeScope(guard.session)`; explícito: `clinicScope(id)`. `systemScope()` só em
   arquivos da allowlist de `tests/lib/tenant-scope.test.ts`, com justificativa. → [ADR-001](docs/adr/001-multi-tenancy.md)
2. **Auth falha fechado.** Sem `AUTH_SECRET` tudo responde 503; não há senha mestre nem login
   Google. Não existe modo sem autenticação (removido na #327). → [ADR-002](docs/adr/002-autorizacao-em-duas-camadas.md), [ADR-004](docs/adr/004-remocao-google-oauth-autenticacao.md)
3. **UI só com `@still-void/ui`.** `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` crus e
   cores Tailwind cruas são proibidos; exceção exige `// sv-gap: <slug>` + entrada em
   [`docs/still-void-gaps.md`](docs/still-void-gaps.md).
4. **Complexidade.** Cognitiva ≤ 10; função ≤ 120 linhas (`.tsx` 320). Não use `biome-ignore`
   sem motivo escrito. Variável não usada leva prefixo `_`. → [`docs/engineering/conventions.md`](docs/engineering/conventions.md)
5. **Nunca invente regra de negócio.** Decisão de produto (preço, papel, trade-off de UX) é do
   usuário: registre como pergunta aberta, não como requisito.
6. **Doc no mesmo PR.** Mudou comportamento de um domínio → atualize `docs/domains/<slug>/`.
   Decisão arquitetural durável → novo ADR. → [`docs/governance.md`](docs/governance.md)
7. **Merge só com CI verde.** `feat/*` entra na `release/vX.Y.Z` (squash, com `## Homologação`); só `release/*` e `hotfix/*` vão para a `main` (merge commit na release); nunca rebase da `release/*` ([ADR-052](docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md)). O Actions roda tudo, em PR para a release e para a `main`: gate rápido (typecheck, lint,
   sv, docs, cobertura, build), integração em Postgres 18, E2E (produção e dev) e mutação nos arquivos de regra alterados; não há recibo `E2E-GATE:` ([ADR-098](docs/adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md), que supera o ADR-042). Nenhum PR é mergeado (nem dado como pronto) com step vermelho, inclusive quando a falha
   não é do PR: corrija primeiro. Decisões de @KalleoPinheiro, 2026-09-25, 2026-10-19 e 2026-11-08.
8. **Teste é intocável.** Nunca edite, afrouxe, apague ou desligue teste (`skip`/`only`/`fixme`),
   nem reduza limiar de cobertura, nem aumente `retries`/`timeout`, para resolver problema de
   desenvolvimento: **corrija o código**. Teste novo é permitido; mudar teste existente só quando o
   requisito de negócio mudou, com `TESTE-ALTERADO: <motivo>` no PR. Imposto por script, não por
   confiança: hook do Claude Code, `pre-push` e CI (`npm run check:testes`). Teste verifica
   comportamento de negócio (cenário Given/When/Then), não a implementação. → [ADR-098](docs/adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md)

## Branch e PR de agentes (ADR-052)

Todo agente, antes de criar branch, confere estas decisões (o orquestrador as repete no brief; fluxo em transição, [ADR-097](docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md)):

- **Base sempre a release aberta**, nunca a `main`: `git fetch origin && git switch -c <tipo>/<slug> origin/release/vX.Y.Z`. Ache a release com `git ls-remote --heads origin 'release/*'` (uma por vez).
- **Nome**: `feat/<slug>` para funcionalidade, `fix/<slug>` para correção, `docs/<slug>` para só documentação. `main` só recebe `release/*` e `hotfix/*`, por merge commit.
- **PR em squash com base `release/vX.Y.Z`**, com `## Homologação` no corpo (`Seed:` e cenários Dado/Quando/Então, ou `n/a — <motivo>`).
- **PR para `release/**` nasce em rascunho** e é marcado pronto uma vez (ADR-093). Quem marca pronto é o coordenador, depois de confirmar a cota do Actions. Em rascunho, os checks "Gate do PR" e `ci` ficam vermelhos de propósito: o pipeline pesado só roda quando o PR deixa de ser rascunho. Não marque o PR como pronto para fazer o CI passar.
- **the-judge**: só a thread revisora julga e publica a review COMMENT `the-judge/v1 … APPROVE` no head SHA ([ADR-101](docs/adr/101-veredito-do-the-judge-por-status-da-revisora.md)); quem implementou nunca a publica.
- **Changeset**: PR que toca `src/`, `drizzle/` ou `Dockerfile` leva `npm run changeset`; se nada muda para a clínica, `--empty`. PR só de documentação não precisa de changeset.
- **Handoff** da issue em `.specs/archive/handoff-2026.md`, na mesma PR.
- **Validação antes do PR**: `npm run test:changed -- origin/release/vX.Y.Z`, `typecheck`, `lint`, `check:docs` (se tocou `.md`). O E2E e a mutação rodam no Actions; `gate:local` é opcional.

Se a release aberta não estiver clara ou a branch já nasceu da `main`, pergunte ao orquestrador antes de seguir. Detalhe: [`docs/engineering/homologacao.md`](docs/engineering/homologacao.md) § 1.

## Imports dinâmicos

`import()` só com caminho literal ou mapa estático `as const` (ex.: `{ '/payouts': () => import('@/app/api/payouts/route') }`); **nunca**
com template literal (`${}`): o Vite esconde os avisos reais. Vale em `src/`, `tests/`, `e2e/` e `scripts/`;
`scripts/check-dynamic-import.ts` reprova o resto. Detalhe: [`conventions.md`](docs/engineering/conventions.md) § Imports dinâmicos.

## Mapa de contexto

Leia **uma** linha. Desça para a terceira coluna só se a segunda não bastar.

| Se vai mexer em | Leia primeiro | Depois, se precisar |
| --- | --- | --- |
| login, convite, papéis, empresa, auditoria | [`docs/domains/acesso/`](docs/domains/acesso/README.md) | ADR-001..004, `src/domain/{auth,clinic,audit}` |
| paciente, anamnese, condição, avaliação, foto, evolução | [`docs/domains/pacientes-prontuario/`](docs/domains/pacientes-prontuario/README.md) | `src/domain/{patient,clinical,consent,taxonomy}` |
| consulta, grade, feriado, lista de espera, recall | [`docs/domains/agenda/`](docs/domains/agenda/README.md) | `src/domain/{scheduling,followup,catalog}` |
| fatura, pacote, comissão, repasse | [`docs/domains/financeiro/`](docs/domains/financeiro/README.md) | `src/domain/billing` |
| insumo, kit, baixa de estoque | [`docs/domains/estoque/`](docs/domains/estoque/README.md) | `src/domain/inventory` |
| portal do paciente, auto-agendamento | [`docs/domains/portal/`](docs/domains/portal/README.md) | `src/application/portal` |
| profissional, parceiro | [`docs/domains/equipe-parceiros/`](docs/domains/equipe-parceiros/README.md) | `src/domain/{professional,partner}` |
| lembrete, WhatsApp, e-mail | [`docs/domains/comunicacao/`](docs/domains/comunicacao/README.md) | [`integrations/`](docs/engineering/integrations/README.md) |
| relatório gerencial, KPI | [`docs/domains/relatorios/`](docs/domains/relatorios/README.md) | `src/application/reports` |
| Resend, Google Calendar, WhatsApp, S3, cron | [`docs/engineering/integrations/`](docs/engineering/integrations/README.md) | `src/infrastructure/` |
| ambiente de homologação, Vercel, seed, fluxo de git (`release/*`, `staging`) | [`docs/engineering/homologacao.md`](docs/engineering/homologacao.md) | ADR-041, ADR-052, `scripts/seed/` |
| erro ao rodar/buildar/testar | [`docs/engineering/troubleshooting.md`](docs/engineering/troubleshooting.md) | — |
| nova feature (planejar) | [`docs/agents/planning.md`](docs/agents/planning.md) | [`docs/templates/`](docs/templates/) |
| decisão tomada durante execução | [`.specs/STATE.md`](.specs/STATE.md) § Decisions | `.specs/features/<slug>/` |
| escrever ou mover documentação | [`docs/governance.md`](docs/governance.md) | [`docs/templates/`](docs/templates/) |

Índice completo de `docs/`: [`docs/README.md`](docs/README.md).

## Cursor Cloud specific instructions

- Node do CI é **24**. O `node` de `/exec-daemon` é 22 e vem antes no `PATH`; os scripts de boot prefixam `/usr/local/lib/nodejs/bin`.
- Postgres **18** sobe no host com `pg_ctlcluster` (não há Docker nem systemd). Papel local `estomasystech`, banco `estomasystech`, em `127.0.0.1:5432`.
- O app de desenvolvimento escuta em `http://127.0.0.1:3000` com `next dev --webpack`. O Turbopack desta versão entra em reload infinito neste ambiente e o formulário deixa de hidratar.
- Segredos de desenvolvimento ficam em `.env.development.local` (gitignored). O Vitest roda em mode `test` e **não** lê esse arquivo.
- Não crie `.env` na raiz para o app local. O Vite carrega `.env` na suíte: `APP_URL` altera o rodapé dos e-mails e `DATA_ENCRYPTION_KEY` impede o teste que exige falha fechada sem `AUTH_SECRET`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

| Skill / fluxo | Guia |
| --- | --- |
| Issues (GitHub, `KalleoPinheiro/estomasystech`) | [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) |
| Triagem (labels canônicos) | [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md) |
| Fluxo de sete estações e labels de fila (`pronta`, `em-andamento`, `bloqueada`) | [ADR-070](docs/adr/070-fluxo-de-sete-estacoes-com-labels-de-fila.md) |
| **Coordenação (papel, release, gate, autonomia)** e estado da release aberta | [`docs/agents/coordenacao.md`](docs/agents/coordenacao.md), [`docs/agents/estado-v0.4.0.md`](docs/agents/estado-v0.4.0.md) |
| Orquestração entre LLMs equivalentes (dono único, vagas globais e handoff) | [Convivência](docs/engineering/convivencia-llms.md) |
| Glossário e ADRs | [`docs/agents/domain.md`](docs/agents/domain.md) |
| Planejamento (PRD vs `.specs/`, dois logs de decisão) | [`docs/agents/planning.md`](docs/agents/planning.md) |
| Corrigir subconjunto de achados de auditoria | [`docs/agents/fix-audit-issues.md`](docs/agents/fix-audit-issues.md) |
