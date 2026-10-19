# Homologação na Vercel (Neon + MSW + faker) e fluxo de git com branch `staging`

> Plano em `plan.md` (mesma pasta). Decisões abaixo são literais: copiar, não rederivar.

## Situation

- Project: em uso (produção na VPS/Coolify desde 2026-10-19).
- Decision: committed por Kalléo, 2026-10-19, nesta thread (Vercel pública, Neon ou Supabase, MSW nas integrações, faker, massa de dados completa, git com branch espelho, Actions para publicar).
- In flight: nada no domínio; `vercel.json` (crons) e `producao.md` § 2 "Alternativa não adotada" já existem e passam a ser substituídos.
- At stake: ambiente descartável, reversível em uma tarde. O risco real é um vazamento: segredo ou banco de produção dentro da Vercel, ou dado real em homologação (LGPD).

## Problem

Construction. A produção é manual e sem "meio de campo": feature só é vista de verdade depois do merge na `main` e do deploy à mão. Falta um lugar com URL pública, banco próprio e dados fictícios para testar a feature antes de mergear, inclusive cenários de erro. Sem isso, Kalléo valida em `next dev` local, com banco vazio, e a revisão de layout/fluxo (sempre pedida em produção, na "Clínica de teste") acontece em produção.

## Evidence

- Código já compatível: `vercel.json` com crons, `isVercelRuntime()` + `UnavailablePhotoStorage`, `enforceProcessTimeZone()`, `ESTOMASYSTECH_MIGRATE_ON_BOOT=false`, `PG_POOL_MAX` - `src/instrumentation.ts`, `container.ts:372`, `db.ts:88`.
- Integrações externas todas por HTTP: Resend (`fetch`), Google Calendar (`googleapis`), S3/R2 (`@aws-sdk/client-s3`). MSW intercepta as três em `msw/node`. O banco é TCP (`pg`), então o MSW não serve para dados (decidido na thread).
- `@faker-js/faker@10.6.0` e `msw@3.0.3`: `npm audit` limpo em 2026-10-19 (0 vulnerabilidades), node >= 22.12 (CI usa 24). O pacote sem escopo `faker` (6.6.6) foi sabotado em 2022: proibido.
- Dados clínicos são cifrados (`DATA_ENCRYPTION_KEY`): seed por SQL cru gravaria claro. O seed tem de passar pela camada de aplicação/repositórios (como o `e2e/global-setup.ts`).
- Papéis de equipe exigem segundo fator (#291): o seed precisa de segredos TOTP fictícios conhecidos, só de homologação.
- Actions sem cota hoje (memória do projeto): o deploy não pode depender de Actions.

## Journey

Operacional. Dev abre PR da feature a partir da `main` -> Vercel gera Preview do PR (banco Neon próprio do preview, seed) -> para testar com outras features, promove para `staging` -> Kalléo valida na URL de homologação -> merge na `main` -> deploy manual em produção (inalterado, ADR-039).
Estados: seed falha (build não sobe, erro claro); banco de produção apontado por engano (build e app recusam); migração de duas features colidem (a `staging` é reconstruída e o banco, recriado); e-mail/WhatsApp/Google em homologação (MSW responde, nada sai); foto (R2 de dev, ou mock sem persistência).

## Verdict

Build. Já committed, ver Situation. Custo de não fazer: validação em produção. Custo de fazer: ~4 PRs pequenos, US$ 0/mês (Vercel Hobby, uso não comercial de homologação; Neon free; R2 free).

Cheaper paths considered: preview só por PR sem `staging` (não integra features entre si), docker compose local (sem URL pública), staging na própria VPS (disputa recursos de produção, descartado).

## Success

- Worked if: Kalléo valida uma feature nova na URL `*.vercel.app` com a massa fictícia antes do merge, sem tocar produção - na próxima feature.
- Early signal: o primeiro PR sai com Preview funcional e login por papel; ruim = precisar de passo manual no painel a cada PR.
- Review: depois da 3ª feature testada por esse caminho - Kalléo.

## Boundary

In: git workflow, Vercel (preview + staging), Neon, MSW nas integrações, seed com faker, guardas anti-produção, docs/ADR.
Out: produção continua na VPS com deploy manual (ADR-039); Supabase (Neon escolhido); domínio próprio na Vercel (usa `*.vercel.app`); e-mail/WhatsApp reais em homologação.

## Prior art

Não verificado na web nesta sessão (decisão local, sobre código conhecido). Convenção do Neon: um branch de banco por preview (integração Neon-Vercel). Trade-off: criar o banco do preview exige o integrador instalado no painel (ação do Kalléo).

## Shape

Aposta: homologação é descartável e reconstruível. `staging` = `main` + features em teste, recriada a qualquer momento; seu banco também. Mudar depois custa pouco.

### Adds

- Branch `staging` (protegida contra merge direto de humanos; criada de `main`).
- `scripts/staging/rebuild.sh`: recria `staging` a partir da `main` e mergeia os PRs com label `em-homologacao`.
- `scripts/vercel-build.mjs`: build da Vercel (guarda -> migra -> seed (só `staging`/preview) -> `next build`).
- `src/lib/runtime-env.ts` (`APP_ENV`: `production|staging|preview|development`) e guarda `assertNotProductionDatabase`.
- `src/infrastructure/mocks/` (MSW node: Resend, Google Calendar/OAuth, S3) ligado em `instrumentation.ts` por `MOCK_INTEGRATIONS=true`.
- `scripts/seed/` (`@faker-js/faker` fixo, `faker.seed`, pt_BR; cenários de sucesso e de erro, contas por papel com TOTP fictício) + `npm run seed:staging`.
- `.github/workflows/staging.yml` (migra/semeia/fumaça pós-deploy; opcional, sem cota roda local) e ajuste de `ci.yml` para `staging`.
- `docs/adr/041-homologacao-vercel-neon-e-branch-staging.md`; `docs/engineering/homologacao.md`; atualização de `producao.md` § 2 e `integrations/cron.md`.

### Changes

- `vercel.json`: `buildCommand`, crons só no ambiente `staging` (diário, Hobby) e `headers` de `X-Robots-Tag: noindex`.
- `package.json`: devDependencies `@faker-js/faker` e `msw` fixados exatamente.

### Leaves

Produção, Coolify, ADR-039, Scheduled Tasks, Postgres 18 da VPS.

A alternativa pesada (Supabase, ou Neon pago com branches persistentes por PR) só vence se a homologação passar a ser usada por clínicas reais; não é o caso.

## Roadmap

| Block | Delivers | Clarity |
|---|---|---|
| A. Git workflow + ADR 041 + docs | regras de `staging`, label, rebuild.sh, templates | clear |
| B. Guardas + build Vercel + vercel.json | `APP_ENV`, anti-produção, `vercel-build.mjs` | clear |
| C. MSW nas integrações | e-mail/Google/S3 mockados em homologação | clear |
| D. Seed faker | massa fictícia com cenários de erro, idempotente | clear |
| E. Ligar na Vercel/Neon (painel) | projeto, integração Neon, envs | open (Kalléo no painel) |

## Decisions

| Decision | Choice | Why this | Alternative, and what would make it win | Reversibility |
|---|---|---|---|---|
| Banco de homologação | Neon (free), branch por preview + branch `staging` | `pg_trgm`/`btree_gist`, branch por PR, driver `pg` igual ao de produção | Supabase, se já houvesse conta/pooler e quisesse Auth | reversible |
| Branch espelho | `staging` = `main` + PRs com label `em-homologacao`, reconstruída pelo script | evita divergência permanente; migração colidente some ao reconstruir | `staging` longa com merges contínuos: só se o time crescer | reversible |
| Deploy | Integração Git nativa da Vercel; migração no `buildCommand`; Actions só para fumaça | Actions sem cota hoje; menos peças | Vercel CLI no Actions (`--prebuilt`): quando Actions voltar e quiser portão antes do deploy | reversible |
| Faker | `@faker-js/faker@10.6.0` exato, devDependency, nunca `faker` | auditado, mantido | `@ngneat/falso` | reversible |
| MSW | `msw/node` em `instrumentation.ts`, só com `APP_ENV` staging/preview/development | único ponto, sem tocar o código de domínio | injetar gateways fake no container | reversible |
| Seed | camada de aplicação/repositórios, cifra com a chave de homologação | respeita LGPD/cifra, mesmo caminho do E2E | SQL cru: grava claro, descartado | reversible |
| Proteção anti-produção | `APP_ENV` obrigatório na Vercel e `DATABASE_URL` com host de produção recusado por lista `PRODUCTION_DB_HOSTS` | dado real nunca em homologação | só confiar em disciplina: descartado | reversible |
| Domínio | `*.vercel.app`, com `noindex` e Vercel Authentication nos previews | pedido do Kalléo + LGPD | domínio próprio: custo de DNS sem ganho | reversible |

## Needs an RFC

Nenhum.

## Needs a spike

Nenhum.

## Needs design

Faixa fixa "Homologação - dados fictícios" no topo (reaproveita `@still-void/ui`; texto simples, sem desenho prévio).
