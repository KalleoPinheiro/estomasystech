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

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Drizzle ORM + Postgres (18 em produção, 16 no compose/CI até o ADR-037) ·
Tailwind v4 · `@still-void/ui` · Vitest + Playwright · Biome · npm (sem workspaces).
Arquitetura em camadas `app → application → domain ← infrastructure`:
[`docs/engineering/architecture.md`](docs/engineering/architecture.md).

## Comandos

| Comando | Quando | Nota |
| --- | --- | --- |
| `npm run typecheck` | antes de commitar | `tsc --noEmit` |
| `npm run lint` / `npm run format` | antes de commitar | Biome é a única ferramenta de lint+format |
| `npm run test:coverage` | gate de CI | **mínimo 90%** |
| `npm run test:changed [-- <ref>]` | loop local (ex.: `-- origin/main`) | não substitui `test:coverage`; o CI roda a suíte completa |
| `npm run test:e2e` | fluxos de UI | build + Playwright contra `next start` e `next dev` ([ADR-021](docs/adr/021-e2e-contra-build-de-producao.md)); `:prod` e `:dev` separados |
| `npm run check:sv` | toca JSX | adoção de `@still-void/ui` |
| `npm run check:docs` | toca `.md` | links e frontmatter |
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
7. **Merge só com CI 100% verde.** Nenhum PR é mergeado (nem dado como pronto para merge) com
   qualquer step do CI falhando — inclusive quando a falha não foi causada pelo PR (ex.: também
   vermelha na `main`). Nesse caso a falha é corrigida primeiro, no próprio PR ou em outro que
   entre antes. Decisão de @KalleoPinheiro, 2026-09-25.

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
| erro ao rodar/buildar/testar | [`docs/engineering/troubleshooting.md`](docs/engineering/troubleshooting.md) | — |
| nova feature (planejar) | [`docs/agents/planning.md`](docs/agents/planning.md) | [`docs/templates/`](docs/templates/) |
| decisão tomada durante execução | [`.specs/STATE.md`](.specs/STATE.md) § Decisions | `.specs/features/<slug>/` |
| escrever ou mover documentação | [`docs/governance.md`](docs/governance.md) | [`docs/templates/`](docs/templates/) |

Índice completo de `docs/`: [`docs/README.md`](docs/README.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent skills

| Skill / fluxo | Guia |
| --- | --- |
| Issues (GitHub, `KalleoPinheiro/estomasystech`) | [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) |
| Triagem (labels canônicos) | [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md) |
| Glossário e ADRs | [`docs/agents/domain.md`](docs/agents/domain.md) |
| Planejamento (PRD vs `.specs/`, dois logs de decisão) | [`docs/agents/planning.md`](docs/agents/planning.md) |
| Corrigir subconjunto de achados de auditoria | [`docs/agents/fix-audit-issues.md`](docs/agents/fix-audit-issues.md) |
