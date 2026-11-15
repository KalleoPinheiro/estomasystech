# AGENTS.md — EstomaSysTech

> **L0 · Fonte única da verdade (SSOT) para humanos e LLMs.** Este arquivo diz *o que é*, *o que
> nunca fazer* e *onde procurar*. Detalhe mora nos arquivos linkados — leia só o que a tarefa
> pede. `CLAUDE.md` importa este arquivo; Codex, Cursor, Copilot e Gemini o leem nativamente.

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
| `npm run typecheck` / `npm run lint` / `npm run format` | antes de abrir o PR | Biome é a única ferramenta de lint+format |
| `npm run test:changed -- origin/main` | loop local | não substitui o CI, que roda a suíte completa |
| `npm run test:coverage` | gate de CI | **100% em domain, application, infrastructure e lib; piso 90% global** ([ADR-050](docs/adr/050-limiar-100-por-camada-e-ui-medida.md)) |
| `npm run changeset` / `npm run check:changeset` | PR que toca `src/`, `drizzle/` ou `Dockerfile` | um `.changeset/*.md` por PR (`--empty` se nada muda para a clínica) |
| `npm run check:sv` / `check:docs` / `check:server-first` | toca JSX / `.md` / páginas | o CI roda todos |
| `npm run check:testes` | `pre-push` e CI | regra 8: falha se um teste foi enfraquecido |
| `npm run test:mutacao` | mudou regra em `src/domain/**` ou `src/application/**` | roda no CI só nos arquivos alterados |
| `npm run test:e2e` | fluxos de UI | o mesmo E2E roda no CI em todo PR |
| `npm run test:integracao` | persistência, migração, concorrência | Postgres real; roda no CI |
| `npm run db:migrate` | schema mudou | drizzle-kit |
| `npm run release:prepare -- --rollback=redeploy\|backup` | quando o dono quiser publicar | consome os changesets numa branch curta; ver Fluxo, passo 5 |
| `npm run build` | — | **não remova** `--max-old-space-size=4096` (nem o `ENV NODE_OPTIONS` do `Dockerfile`) |

Setup e variáveis: [`onboarding.md`](docs/engineering/onboarding.md). Produção, backup e rollback:
[`producao.md`](docs/engineering/producao.md). **Produção está no ar** (Coolify + Dockerfile); merge na `main` não é deploy.

## Regras invioláveis

1. **Escopo de empresa.** Nunca monte `{ clinicId }` à mão. Leitura: `sessionScope(guard.session)`;
   escrita: `writeScope(guard.session)`; explícito: `clinicScope(id)`. `systemScope()` só em
   arquivos da allowlist de `tests/lib/tenant-scope.test.ts`, com justificativa. → [ADR-001](docs/adr/001-multi-tenancy.md)
2. **Auth falha fechado.** Sem `AUTH_SECRET` tudo responde 503; não há senha mestre nem login
   Google nem modo sem autenticação. → [ADR-002](docs/adr/002-autorizacao-em-duas-camadas.md), [ADR-004](docs/adr/004-remocao-google-oauth-autenticacao.md)
3. **UI só com `@still-void/ui`.** `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` crus e
   cores Tailwind cruas são proibidos; exceção exige `// sv-gap: <slug>` + entrada em
   [`docs/still-void-gaps.md`](docs/still-void-gaps.md).
4. **Complexidade.** Cognitiva ≤ 10; função ≤ 120 linhas (`.tsx` 320). Sem `biome-ignore` sem motivo
   escrito. Variável não usada leva prefixo `_`. → [`conventions.md`](docs/engineering/conventions.md)
5. **Nunca invente regra de negócio.** Decisão de produto (preço, papel, trade-off de UX) é do
   usuário: registre como pergunta aberta, não como requisito.
6. **Doc no mesmo PR.** Mudou comportamento de um domínio → atualize `docs/domains/<slug>/`.
   Decisão arquitetural durável → ADR. → [`docs/governance.md`](docs/governance.md)
7. **Merge só com CI verde.** Nenhum PR entra com check vermelho, inclusive quando a falha não é do PR.
8. **Teste é intocável.** Nunca edite, afrouxe, apague ou desligue teste (`skip`/`only`/`fixme`), nem reduza
   limiar de cobertura, nem aumente `retries`/`timeout`, para resolver problema de desenvolvimento: **corrija o
   código**. Teste novo é permitido; mudar teste existente só quando o requisito de negócio mudou, com
   `TESTE-ALTERADO: <motivo>` no PR. Imposto por script (hook, `pre-push`, CI: `npm run check:testes`).
   → [ADR-098](docs/adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md)

## Fluxo de entrega (ADR-109)

Vale para qualquer agente e para o dono. Uma mudança, uma sessão, um PR. Detalhe: [ADR-109](docs/adr/109-fluxo-de-entrega-simplificado.md).

1. **Branch curta a partir da `main`** (`feat/<slug>`, `fix/<slug>`, `docs/<slug>`), PR para a `main`, **já pronto**
   (PR em rascunho roda só a política: "Gate do PR" e `ci` ficam vermelhos de propósito). Corpo com `Closes #N`.
2. **O CI é o revisor.** Typecheck, lint, cobertura, integração, compatibilidade de migração, E2E e mutação nos
   arquivos de regra alterados. Passou, o merge entra sozinho: habilite o **auto-merge (squash)** no PR. Não há
   sessão separada de revisão para mudança comum.
3. **Só o perigoso pede mais.** Classe de risco 3 (`npm run check:risco`: login/auth, cifra, escopo de empresa,
   auditoria, migração não aditiva, workflows, portão de testes, deploy e backup) para no check "Portão de risco"
   até o dono clicar no Environment `aprovacao-classe-3`. Nesses PRs, rode também a revisão the-judge na própria
   sessão antes de pedir o clique. Peça o clique só com o CI verde no head final, com o link do job.
4. **Staging automática.** Cada entrada na `main` reconstrói a `staging` e roda a validação logada (3 papéis,
   larguras 360, 390, 768 e 1280) sozinha (`staging.yml`).
5. **Produção com um clique do dono**, quando ele quiser publicar: `release:prepare` numa branch curta, PR
   `chore(release): vX.Y.Z` pela mesma esteira, backup no VPS, workflow **Release deploy** (tag + fumaça) e deploy
   da tag no Coolify. Volta em minutos: [`producao.md`](docs/engineering/producao.md) § 3.1 (rollback).
6. **Passagem de bastão: um arquivo.** Quem chega lê [`PROXIMOS-PASSOS.md`](.specs/archive/handoff/PROXIMOS-PASSOS.md);
   quem sai o atualiza no mesmo PR. `Closes #N` fecha a issue no merge; a integração move a EST sozinha.

Sem branch de release, sem `release:cut`, sem marca de homologação, sem labels de posse, sem handoff por issue.

## Imports dinâmicos

`import()` só com caminho literal ou mapa estático `as const`; **nunca** com template literal (`${}`).
`scripts/check-dynamic-import.ts` reprova o resto. → [`conventions.md`](docs/engineering/conventions.md) § Imports dinâmicos.

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

## Ambiente de nuvem dos agentes

- Node do CI é **24**. O `node` de `/exec-daemon` é 22 e vem antes no `PATH`; os scripts de boot prefixam `/usr/local/lib/nodejs/bin`.
- Postgres **18** sobe no host com `pg_ctlcluster` (não há Docker nem systemd). Papel local `estomasystech`, banco `estomasystech`, em `127.0.0.1:5432`.
- O app de desenvolvimento escuta em `http://127.0.0.1:3000` com `next dev --webpack`. O Turbopack desta versão entra em reload infinito neste ambiente e o formulário deixa de hidratar.
- Segredos de desenvolvimento ficam em `.env.development.local` (gitignored). O Vitest roda em mode `test` e **não** lê esse arquivo.
- Não crie `.env` na raiz para o app local. O Vite carrega `.env` na suíte: `APP_URL` altera o rodapé dos e-mails e `DATA_ENCRYPTION_KEY` impede o teste que exige falha fechada sem `AUTH_SECRET`.

<!-- BEGIN:nextjs-agent-rules -->

## Agent skills

[Issues](docs/agents/issue-tracker.md) · [triagem e labels](docs/agents/triage-labels.md) · [glossário e ADRs](docs/agents/domain.md) ·
[planejamento](docs/agents/planning.md) · [corrigir achados de auditoria](docs/agents/fix-audit-issues.md)

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
