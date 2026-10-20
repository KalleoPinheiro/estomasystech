---
title: "Homologação — Vercel, Neon, MSW, faker e fluxo de git"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/engineering/producao.md, docs/engineering/onboarding.md]
---

# Homologação

Ambiente público e descartável para ver o lote (release aberta) **antes de entrar na `main`**, só com dados fictícios
([ADR-041](../adr/041-homologacao-na-vercel-e-branch-staging.md)). Produção continua na VPS
([`producao.md`](producao.md)).

## 1. Fluxo de git

Decidido no [ADR-052](../adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md): a `main` só
recebe lote já homologado.

```
main  ───────────●─────────────────────────●(merge commit)──▶ só releases e hotfixes; tag vX.Y.Z aqui
                  \                       ↗
release/v0.3.0     ●──●(feat a)──●(feat b)──●(versão + CHANGELOG)     uma aberta por vez
                      ↑ squash    ↑ squash
feat/a ───────────────┘           │
feat/b ───────────────────────────┘
staging ═══ = release aberta (ou = main, sem release) ═══▶   descartável; ninguém commita aqui
```

| Regra | Como |
| --- | --- |
| Abrir a release | `git switch -c release/vX.Y.Z origin/main && git push -u origin release/vX.Y.Z`; o nome promete a versão |
| Toda feature nasce da release aberta | `git fetch origin && git switch -c feat/x origin/release/vX.Y.Z` |
| O PR da feature vai contra a **release**, em squash | CI rápido; sem recibo do gate. Corpo traz `## Homologação`: `Seed:` e cenários Dado/Quando/Então (ou `n/a — <motivo>`); o CI reprova sem eles |
| Antes de abrir o PR da feature | `npm run test:changed -- origin/release/vX.Y.Z` e, se mexeu em regra, `GATE_BASE=origin/release/vX.Y.Z npm run test:mutacao` |
| Cada PR ganha um **Preview** sozinho | a Vercel cria `https://<projeto>-git-<branch>-….vercel.app` com banco Neon próprio |
| `main` mudou (hotfix) | `npm run release:sync` **mergeia** a `main` na release aberta (nunca rebase); conflito aborta e avisa: resolva na release |
| Testar o lote na staging | `npm run staging:rebuild -- --release --push` (staging = release aberta; branches extras opcionais no fim da linha) |
| `staging` é reconstruída, não consertada | conflito ou migração colidente: reconstrua; nunca resolva em `staging` |
| Staging aprovada | `npm run release:prepare -- --rollback=redeploy\|backup` **na release** (versão + CHANGELOG + Release em rascunho) |
| Entrar na `main` | PR `release/vX.Y.Z → main` com `gate:local` no head e recibo no corpo; merge **commit** (nunca squash nem rebase) |
| Depois do merge | `npm run release:publish -- --rollback=...` (tag no commit de merge, Release publicada); deploy da tag em `producao.md` § 3.1. A `staging` volta a ser = `main` |
| Hotfix | `hotfix/*` nasce da `main`, PR direto na `main` (recibo), `release:prepare`/`release:publish --hotfix`; o `release:sync` leva a correção para a release aberta |

Numeração de migração colidente entre features da release: quem mergeia primeiro mantém o número; a
outra renumera antes do merge. Reconstruir a `staging` expõe a colisão cedo.

Ao reconstruir com um conjunto de migrações diferente, **reinicie o branch de banco `staging`** no
Neon (*Reset from parent*, ou apague e crie de novo). O build migra e semeia sozinho.

Os scripts rodam no seu computador (`rebuild.sh`, `sync-main.sh`, sem `gh` nem Actions). O
`staging.yml` repete tudo a cada push na `main` (e por `workflow_dispatch`) quando houver cota
(até ~2026-11-01 o fluxo é à mão). O workflow só empurra para `release/*` se o ruleset deixar
(ADR-052, Consequências).

## 2. Ambientes

| | Produção | Staging | Preview (por PR) | Dev local |
| --- | --- | --- | --- | --- |
| Onde | VPS + Coolify | Vercel (branch `staging`) | Vercel (branch do PR) | `npm run dev` |
| `APP_ENV` | `production` (ou ausente com `NODE_ENV=production`) | `staging` | `preview` | `development` |
| Banco | Postgres 18 privado | Neon branch `staging` | Neon branch por preview | docker compose (`npm run ambiente:local`, [ADR-044](../adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md)) |
| Dados | reais | fictícios (seed) | fictícios (seed) | seed opcional |
| Integrações | reais | MSW (`MOCK_INTEGRATIONS=true`) | MSW | opcional |
| Faixa de aviso e `noindex` | não | sim | sim | não |
| Deploy | manual | push na `staging` (= release aberta) | push no PR | — |

## 3. Variáveis na Vercel

Todas só para `Preview` e `Production` do projeto de homologação (nunca valores de produção).

| Nome | Valor |
| --- | --- |
| `APP_ENV` | `staging` em Production; `preview` em Preview |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | injetadas pela integração Neon (pooler no app, direta na migração) |
| `ESTOMASYSTECH_MIGRATE_ON_BOOT` | `false` |
| `PG_POOL_MAX` | `5` |
| `PRODUCTION_DB_HOSTS` | host do banco de produção (trava de segurança) |
| `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` | valores novos, diferentes dos de produção |
| `STAGING_SEED_PASSWORD` | senha (≥ 10 caracteres) das contas fictícias |
| `MOCK_INTEGRATIONS` | `true` |
| `APP_URL` | URL pública do ambiente |
| `TRUSTED_PROXY_HOPS` | `1` (a Vercel acrescenta o IP real ao fim do `x-forwarded-for`; confira no primeiro deploy) |
| `PHOTO_STORAGE`, `S3_*` | bucket R2 só de homologação (obrigatório: a Vercel não tem disco) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `GLITCHTIP_DSN` | **não definir** |

## 4. Contas fictícias do seed

Senha: `STAGING_SEED_PASSWORD`. Se a variável mudar, o próximo deploy reaplica a nova senha às contas (o seed não recria banco já semeado). O segundo fator é cadastrado no primeiro login (QR no app).

| E-mail | Papel | Cenário |
| --- | --- | --- |
| `super@homologacao.invalid` | `super_admin` | plataforma |
| `admin@homologacao.invalid` | `company_admin` | clínica principal |
| `atendente@homologacao.invalid` | `atendente` | sem dado clínico |
| `profissional@homologacao.invalid` | `profissional` | evolução e prontuário |
| `admin-suspensa@homologacao.invalid` | `company_admin` | **erro**: clínica suspensa, login negado |

Massa (`npm run seed:staging`, idempotente; `scripts/seed/`): 40 pacientes (sem e-mail, sem CPF,
menor com responsável), 2 profissionais, 6 procedimentos, agenda de 7 semanas com realizadas,
cancelamento tardio e falta, faturas pagas e vencidas, avaliações seriadas (ferida melhorando e
piorando) e estoque com lote vencido, estoque baixo e estoque zerado. Cenários de integração com
erro: destinatário `erro@homologacao.invalid` (e-mail 500) e chave S3 com `__erro__` (403).

Toda feature nova acrescenta seus cenários (sucesso **e** erro) em `scripts/seed/seed.ts` no mesmo PR.
Como o seed é idempotente por clínica, cenário novo só aparece em banco novo: previews (branch de banco
novo) já nascem com ele; no `staging`, reinicie o branch de banco (§ 1).

## 5. Passo a passo no painel (uma vez, por Kalléo)

1. **Vercel**: *Add New Project* → importar `KalleoPinheiro/estomasystech`, plano Hobby. *Production
   Branch* = `staging` (Settings → Git). *Build Command* já vem do `vercel.json`.
2. **Neon**: criar o projeto (região São Paulo), ativar `pg_trgm` e `btree_gist` (as migrações
   fazem `CREATE EXTENSION`). Criar o branch `staging`.
3. **Integração Neon–Vercel** (Marketplace): escolher *Create a branch for every preview deployment*
   e ligar ao projeto; ela injeta `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.
4. **Variáveis** da seção 3; gerar `AUTH_SECRET`, `DATA_ENCRYPTION_KEY` e `CRON_SECRET` novos.
5. **Vercel Authentication** nos previews (Settings → Deployment Protection → Standard).
6. **GitHub**: criar o branch `staging` (`git push origin origin/main:refs/heads/staging`) e proteger
   (sem push direto de humanos, force-push só do rebuild). Para o fluxo do ADR-052: *Allow merge
   commits* em Settings → General e um ruleset em `release/**` (PR obrigatório, CI rápido exigido,
   force push bloqueado, bypass para quem roda `release:sync`).
7. Abrir um PR qualquer, conferir o Preview, entrar com `admin@homologacao.invalid`.

## 6. Limites e cuidados

- A URL de `staging` é pública de propósito (sem Vercel Authentication, que só protege previews). Quem
  entra precisa de senha e do segundo fator; o rate limit é o do app (120/min por IP em `/api/*`).
- Vercel Hobby é uso não comercial e o cron é diário; os crons do `vercel.json` só rodam no deploy
  de Production (a branch `staging`).
- Sem foto persistente se `PHOTO_STORAGE` não apontar para o bucket de homologação.
- Dado real em homologação é incidente de LGPD: não cadastre pessoas reais; a faixa de aviso e a
  trava `PRODUCTION_DB_HOSTS` existem para isso.
