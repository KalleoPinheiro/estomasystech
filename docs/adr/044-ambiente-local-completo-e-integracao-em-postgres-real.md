---
title: "ADR 044 — Ambiente local completo e suíte de integração em Postgres real"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/engineering/onboarding.md, docs/engineering/homologacao.md]
---

# ADR 044 — Ambiente local completo e suíte de integração em Postgres real

- **Data:** 2026-10-20
- **Status:** aceito (issue #404, derivada do [ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md); pedido de @KalleoPinheiro em 2026-10-19)
- **Domínios afetados:** engenharia (ambientes, testes)

## Contexto

O E2E e a suíte usam PGlite (Postgres em WASM, uma conexão); só o smoke Docker fala com o Postgres
de verdade e apenas confere saúde. Não havia um comando que subisse Postgres 18 + app + massa
realista para validar à mão, nem como rodar a suíte contra o motor de produção. Sem ele, o que o
PGlite não reproduz (concorrência entre conexões, extensões reais, `max_connections`) só aparecia em
produção. O ambiente de homologação ([ADR-041](041-homologacao-na-vercel-e-branch-staging.md)) já tem
o seed com cenários de sucesso e erro e a trava de banco de produção; falta o equivalente local.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| Postgres via testcontainers na suíte | sobe sozinho | dependência nova; ainda exige Docker; esconde o ambiente que o dev quer ver |
| Reaproveitar `docker compose up` do dia a dia | nada novo | volumes e segredos compartilhados com quem já usa o compose; sem seed nem guarda |
| `ambiente:local` com projeto compose próprio + seed + suíte em Postgres real (escolhida) | um comando; mesmo artefato de produção (imagem do `Dockerfile`); isolado; guarda do ADR-041 | exige daemon Docker |

## Decisão

- **`npm run ambiente:local`** (`scripts/ambiente/local.ts up`): projeto compose `estomasystech-local`
  (`docker-compose.yml` + `docker-compose.local.yml`), Postgres 18 e a imagem de produção; o app migra no
  boot; o seed da homologação (`scripts/seed/`) roda no host contra o banco; imprime URL e as 5 contas
  fictícias. Porta do banco só no loopback (padrão 55432, `POSTGRES_PORT`; app 3000, `APP_PORT`).
  Segredos descartáveis (senha do banco, `AUTH_SECRET`, chave de dado clínico, senha das contas) são gerados
  na 1ª execução em `.ambiente-local/` (fora do git) e reaproveitados, porque o volume guarda a senha antiga.
- **`npm run ambiente:local:down`:** `down -v` do projeto e apaga `.ambiente-local/`.
- **Guarda (ADR-041):** recusa `APP_ENV=production`, `NODE_ENV=production`, host em `PRODUCTION_DB_HOSTS` e
  qualquer `DATABASE_URL` que não seja `localhost`, `127.0.0.1`, `[::1]` ou `db`. A guarda roda antes de tocar no Docker.
- **`npm run test:integracao`:** `vitest.integracao.config.mts` herda a config da suíte e roda `tests/api/**`,
  `tests/scripts/seed.test.ts` e `tests/integracao/**/*.integracao.ts` contra o Postgres. O `getDb()` é trocado (`vi.mock` em
  `tests/support/postgres-setup.ts`) por um banco clonado de um modelo migrado 1x
  (`CREATE DATABASE ... TEMPLATE`), um por arquivo de teste: o mesmo isolamento do PGlite, no motor real. Nenhum
  teste existente foi editado (regra 8). `INTEGRATION_DATABASE_URL` (local) dispensa o Docker.
- **Uma conexão por arquivo nos testes antigos** (`PG_POOL_MAX=1`): eles leem logo após o `after()` fire-and-forget
  (auditoria) e dependem da fila única do PGlite; com pool maior, 2 testes falham por corrida de teste, não do produto.
  A concorrência real fica em `tests/integracao/` (conexões próprias; hoje: anti-double-booking sob duas conexões).
- **Fora:** produção e a homologação na Vercel. Os 37 testes que montam o PGlite à mão (repositórios) seguem na suíte normal.

## Consequências

- Primeira suíte que prova o schema e as migrações no motor de produção e dá lugar a testes de concorrência.
- Medido em 2026-10-20 (thread da #404) com PostgreSQL 16 nativo, sem Docker: 116 arquivos, 1898 testes, ~160 s.
  **Postgres 18 e o compose reais ainda precisam ser validados no WSL do Kalléo** (a nuvem não tem daemon Docker).
- O app do ambiente local é a imagem de produção (`NODE_ENV=production`): o cookie de sessão é `Secure`; use
  Chrome, Edge ou Firefox em `http://localhost` (Safari não aceita).
- Não entra no `gate:local` (`scripts/gate/` é do dono, regra 8); candidato a etapa dele numa revisão futura.
