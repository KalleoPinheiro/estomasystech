---
title: "ADR 041 — Homologação na Vercel (Neon, MSW, faker) e branch `staging` descartável"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-19
related: [docs/engineering/homologacao.md, docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md, docs/engineering/producao.md]
---

# ADR 041 — Homologação na Vercel (Neon, MSW, faker) e branch `staging` descartável

- **Data:** 2026-10-19
- **Status:** aceito.
- **Domínios afetados:** engenharia (ambientes, release, git)

## Contexto

Produção está na VPS/Coolify com deploy manual (ADR-039). Não existe lugar para ver uma feature
com URL pública, banco próprio e dados fictícios antes do merge: a validação de layout e fluxo
acontece em produção. O Actions está sem cota, as migrações não têm `down` e a produção guarda
dado de saúde (LGPD). Decisão de @KalleoPinheiro em 2026-10-19: Vercel com domínio `*.vercel.app`,
Neon ou Supabase para o banco, MSW nas integrações, faker para os dados, massa completa com
cenários de erro e um fluxo de git com branch espelho da `main`.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| Vercel + Neon (escolhida) | URL pública, preview por PR, branch de banco por preview, `pg_trgm` e `btree_gist`, US$ 0 | Hobby é uso não comercial; cron diário |
| Vercel + Supabase | igual, com Auth/Storage que o app não usa | pooler em modo transação exige cuidado; sem branch de banco por PR no plano grátis |
| Staging na própria VPS | mesmo runtime de produção | disputa 8 GB com produção e backup; dado fictício ao lado do real |
| MSW para dados | mock simples | o app fala com o Postgres por TCP; o MSW não intercepta e o ambiente deixaria de testar migração e cifra |

## Decisão

- **Ambiente declarado:** `APP_ENV` = `production | staging | preview | development`
  (`src/lib/runtime-env.ts`). Na Vercel é obrigatório; ausente, o app recusa subir. Fora da Vercel,
  `NODE_ENV=production` continua sendo produção.
- **Dado real nunca entra:** fora de `production`, `DATABASE_URL` com host em `PRODUCTION_DB_HOSTS`
  é recusada (app, build e seed). `MOCK_INTEGRATIONS=true` é recusado em `production`.
- **Banco:** Neon, um branch de banco por preview (integração Neon-Vercel) e um branch `staging`.
  O build da Vercel (`scripts/vercel-build.ts`) migra, semeia e builda; em `production` só builda.
- **Integrações:** MSW em `src/infrastructure/mocks/` (Resend, Google, S3/R2), ligado no boot
  (`instrumentation.ts`) por `MOCK_INTEGRATIONS=true`. Nada sai de verdade.
- **Dados:** `scripts/seed/` com `@faker-js/faker` fixado em versão exata (nunca o pacote sem
  escopo `faker`), determinístico, pela camada de repositórios (dado clínico cifrado com a chave
  de homologação). Cobre sucesso e erro (clínica suspensa, sem e-mail, sem CPF, lote vencido,
  estoque zerado, consulta cancelada tardia, falta, ferida piorando, fatura vencida).
- **Git:** `main` sempre implantável; `staging` = `main` + features em teste, reconstruída pelo
  `scripts/staging/rebuild.sh`; ninguém commita nela. Detalhe em `homologacao.md`.
- **Deploy de homologação:** integração Git nativa da Vercel (Production Branch = `staging`).
  O Actions só confere o resultado; sem cota, o fluxo funciona igual.
- **Produção não muda:** continua na VPS, deploy manual (ADR-039). Merge na `main` ainda não é deploy.

## Consequências

- Uma feature é vista numa URL pública, com a massa de teste, antes do merge.
- `staging` diverge de `main` de propósito; reconstruir (e recriar o branch de banco) resolve
  colisão de migrações. Quem testa precisa saber que o ambiente é descartável.
- Limites do Hobby (cron diário, funções de 60 s, uso não comercial) bastam para homologação;
  uso por clínicas reais exigiria outro plano e outra revisão legal.
- Os crons de `vercel.json` só rodam no deploy de produção da Vercel (a branch `staging`).
- Reversível: apagar o projeto na Vercel e o branch `staging` não afeta produção.
