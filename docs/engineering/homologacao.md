---
title: "Homologação — Vercel, Neon, MSW, faker e fluxo de git"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-19
related: [docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/engineering/producao.md, docs/engineering/onboarding.md]
---

# Homologação

Ambiente público e descartável para ver uma feature **antes do merge**, só com dados fictícios
([ADR-041](../adr/041-homologacao-na-vercel-e-branch-staging.md)). Produção continua na VPS
([`producao.md`](producao.md)).

## 1. Fluxo de git

```
main  ──●────────●──────────●──▶   sempre implantável; deploy manual em produção (ADR-039)
         \        ↑ squash   ↑ squash
feat/a    ●──●──●─┘          │     nasce da main atualizada; PR contra a main
feat/b          ●──●──●──────┘
staging  ──(main + feat/a + feat/b)──▶   espelho descartável; ninguém commita aqui
```

| Regra | Como |
| --- | --- |
| Toda feature nasce da `main` atualizada | `git fetch origin && git switch -c feat/x origin/main` |
| O PR vai contra a `main`, nunca contra `staging` | o CI e o review valem para a `main` |
| Cada PR ganha um **Preview** sozinho | a Vercel cria `https://<projeto>-git-<branch>-….vercel.app` com banco Neon próprio |
| Para testar junto com outras features | `npm run staging:rebuild -- feat/a feat/b --push` recria `staging` = `main` + essas branches |
| `staging` é reconstruída, não consertada | conflito ou migração colidente: reconstrua; nunca resolva em `staging` |
| Depois do merge do PR | tire a branch da lista do próximo rebuild; `staging` volta a ser a `main` |
| Hotfix | mesmo caminho: branch da `main`, PR, Preview |
| Reconstruir quando | um PR é mergeado, uma branch é adicionada ou removida, ou toda semana |

Numeração de migração colidente entre branches: quem mergeia primeiro mantém o número; a outra
renumera antes do merge (regra de sempre). O rebuild de `staging` expõe a colisão cedo.

Ao reconstruir com um conjunto de migrações diferente, **reinicie o branch de banco `staging`** no
Neon (*Reset from parent*, ou apague e crie de novo). O build migra e semeia sozinho.

`rebuild.sh` não usa `gh` nem Actions: roda no seu computador. O workflow `staging.yml` repete o
mesmo comando por `workflow_dispatch` quando houver cota.

## 2. Ambientes

| | Produção | Staging | Preview (por PR) | Dev local |
| --- | --- | --- | --- | --- |
| Onde | VPS + Coolify | Vercel (branch `staging`) | Vercel (branch do PR) | `npm run dev` |
| `APP_ENV` | `production` (ou ausente com `NODE_ENV=production`) | `staging` | `preview` | `development` |
| Banco | Postgres 18 privado | Neon branch `staging` | Neon branch por preview | docker compose (`npm run ambiente:local`, [ADR-044](../adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md)) |
| Dados | reais | fictícios (seed) | fictícios (seed) | seed opcional |
| Integrações | reais | MSW (`MOCK_INTEGRATIONS=true`) | MSW | opcional |
| Faixa de aviso e `noindex` | não | sim | sim | não |
| Deploy | manual | push na `staging` | push no PR | — |

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
   (sem push direto de humanos, force-push só do rebuild).
7. Abrir um PR qualquer, conferir o Preview, entrar com `admin@homologacao.invalid`.

## 6. Limites e cuidados

- A URL de `staging` é pública de propósito (sem Vercel Authentication, que só protege previews). Quem
  entra precisa de senha e do segundo fator; o rate limit é o do app (120/min por IP em `/api/*`).
- Vercel Hobby é uso não comercial e o cron é diário; os crons do `vercel.json` só rodam no deploy
  de Production (a branch `staging`).
- Sem foto persistente se `PHOTO_STORAGE` não apontar para o bucket de homologação.
- Dado real em homologação é incidente de LGPD: não cadastre pessoas reais; a faixa de aviso e a
  trava `PRODUCTION_DB_HOSTS` existem para isso.
