---
title: "ADR 110 — Row-Level Security por clínica: resultado do spike e plano de rollout"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-16
related:
  - docs/adr/001-multi-tenancy.md
  - docs/engineering/migracoes-aditivas.md
---

# ADR 110 — Row-Level Security por clínica

- **Data:** 2026-11-15
- **Status:** em execução (spike da #729; etapa 1 entregue em 2026-11-16, #870; etapa 2 em PR, #871; nenhuma política ligada, nenhuma conexão trocada).
- **Domínios afetados:** acesso, infraestrutura de persistência.

## Contexto

O [ADR-001](001-multi-tenancy.md) escolheu `clinic_id` mais RLS do Postgres, mas só o filtro na aplicação
(`sessionScope`, `writeScope`, `clinicScope`) existe. Um filtro esquecido expõe prontuário de outra clínica.
O RLS é a segunda barreira: o banco recusa a linha mesmo que a aplicação erre.

## Resultado do spike

O teste `tests/integracao/rls-spike.integracao.ts` (Postgres real, `npm run test:integracao`) cria a política em
`patients`, `partners` e `supplies` só no banco clonado do teste e prova:

- Papel da aplicação (`NOSUPERUSER NOBYPASSRLS`), sem `WHERE` de clínica: vê só a clínica da transação.
- Sem `app.clinic_id` na transação: zero linhas (falha fechado).
- `WITH CHECK` recusa inserir ou mover linha para outra clínica; `UPDATE` e `DELETE` sem filtro só afetam a própria.
- `set_config('app.clinic_id', …, true)` é local à transação: com o pool de **uma** conexão não vaza para a seguinte.
- Papel de sistema com `BYPASSRLS` (cron) vê todas as clínicas; superusuário também ignora a política, então a
  aplicação nunca pode conectar como ele.

## Mapa das tabelas

- **40 tabelas com `clinic_id`** (texto): recebem a política `tenant_isolation`
  `USING/WITH CHECK (clinic_id = current_setting('app.clinic_id', true))`.
- **12 sem `clinic_id`**: `clinics` (política por `id`), `procedure_supplies` (herda do procedimento: política
  com `EXISTS`, ou coluna nova, decidir na etapa 3), `auth_tokens`, `user_mfa`, `mfa_recovery_codes` (ligadas a
  `user_accounts`; só o fluxo de login as lê), taxonomia NANDA/NOC/NIC e `taxonomy_linkages` (globais, sem RLS),
  `rate_limit_windows`, `job_runs` e `app_releases` (plataforma, sem RLS).

## Decisão

Adotar o RLS em etapas, cada uma aditiva e reversível. O contrato é: **a aplicação conecta com um papel sem
`BYPASSRLS` e abre toda unidade de trabalho numa transação que faz `set_config('app.clinic_id', <id>, true)`**.

| Etapa | O que muda | Efeito em produção | Rollback |
| --- | --- | --- | --- |
| 1 | Dois papéis e dois pools: `app` (sem `BYPASSRLS`) e `sistema` (com `BYPASSRLS`, só `systemScope()`: cron, login, convite, plataforma). Dono das tabelas e das migrações continua separado | nenhum | voltar a `DATABASE_URL` anterior |
| 2 | O gerenciador de transação e um envoltório de leitura chamam `set_config` antes de qualquer consulta; ainda sem política | nenhum (só o `SELECT set_config`) | remover o envoltório |
| 3 | Políticas em tabelas de baixo risco (`supplies`, `partners`, `schedule_closures`), staging primeiro | consultas sem clínica passam a devolver vazio | `ALTER TABLE … DISABLE ROW LEVEL SECURITY` (instantâneo) |
| 4 | Tabelas clínicas e financeiras, lote a lote, com `npm run test:integracao` e E2E verdes | idem | idem, por tabela |
| 5 | `FORCE ROW LEVEL SECURITY` e remoção de acesso do dono da tabela pela aplicação | nenhum esperado | `NO FORCE` |

Cada política entra por migração aditiva ([`migracoes-aditivas.md`](../engineering/migracoes-aditivas.md)); criar
política e habilitar RLS não perde dado e se desfaz sem restaurar backup. As etapas 3 a 5 são classe 3
(escopo de empresa) e passam pelo clique do dono.

## Impacto medido ou analisado

- **Pool e PgBouncer:** `set_config(…, true)` vale só na transação, então funciona em PgBouncer no modo
  transação. `SET` de sessão **não** pode ser usado (vaza entre requisições).
- **Leituras fora de transação:** hoje os repositórios consultam direto em `db`. A etapa 2 precisa de um
  envoltório que abra transação curta com o `set_config` (custo de um `BEGIN`/`COMMIT` extra por requisição).
- **Desempenho:** o predicado usa `clinic_id`, já indexado em todas as tabelas, e `current_setting` é estável por
  consulta. Medir `EXPLAIN` e latência na staging antes da etapa 4.
- **Seed, migração e testes:** hoje o dono da tabela ignora a política. Depois do `FORCE ROW LEVEL SECURITY` (etapa 5)
  **ser dono não basta**: só superusuário ou `BYPASSRLS` ignoram. Por isso seed e migrações de dados rodam com um
  papel de migração dedicado, com `BYPASSRLS` e usado só pelo `db:migrate`, pelo seed e pelos scripts de
  conversão (`data:reencrypt`); a etapa 5 só entra depois de provar isso na staging (migração e seed completos com
  `FORCE` ligado). Os testes de integração passam a abrir o papel `app` onde a prova for sobre isolamento; a suíte em
  PGlite não aplica RLS e segue como está.
- **Cron e `systemScope()`:** usam o pool `sistema`; a allowlist de `tests/lib/tenant-scope.test.ts` continua
  sendo a lista de quem pode.

## Etapa 1 entregue (#870)

- **Migração `0075_rls-papel-aplicacao`** (aditiva, idempotente): cria o papel de grupo `estomasystech_app`
  (`NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`, não dono de nada) com só
  `SELECT, INSERT, UPDATE, DELETE` nas tabelas e `USAGE, SELECT, UPDATE` nas sequências do `public`, mais os mesmos
  privilégios por padrão para tabelas futuras. Sem `TRUNCATE`, `REFERENCES`, `TRIGGER`, DDL nem acesso ao esquema
  `drizzle`. Se o papel que migra não puder criar papéis, a migração só avisa (`NOTICE`) e segue, para nunca derrubar
  o deploy; o runbook ([`producao.md`](../engineering/producao.md) § 4.1) diz como criar à mão.
- **Sem senha no repositório.** O papel de grupo não loga. O dono cria os papéis de login no servidor
  (`CREATE ROLE … LOGIN IN ROLE estomasystech_app` e `\password`). O papel de sistema é um login com `BYPASSRLS`
  (atributo não herdado por membership, e só superusuário o concede), por isso nasce no servidor, não na migração.
- **Dois pools no código.** `getSystemDb()` lê `DATABASE_SYSTEM_URL` e, sem ela, devolve o próprio `getDb()`.
  A etapa 2 passa o `systemScope()` para ele (ver abaixo).
- **Prova:** `tests/integracao/rls-papel-aplicacao.integracao.ts` (Postgres real) confere atributos do papel,
  que não é dono, privilégios exatos, recusa de DDL por um login que o herda, tabelas futuras, idempotência e o
  caminho de volta (`DROP OWNED BY`).
- **Atenção ao trocar a `DATABASE_URL`** (não é desta etapa): o boot-migrate do app precisa de dono. Antes de apontar a
  `DATABASE_URL` para o papel de aplicação, desligue-o (`ESTOMASYSTECH_MIGRATE_ON_BOOT=false`) e migre com
  `npm run db:migrate` usando a URL do dono; o papel de migração dedicado da etapa 5 formaliza isso.
- **Rollback:** nenhuma conexão muda nesta etapa. Para desfazer, `DROP OWNED BY estomasystech_app;` e
  `DROP ROLE estomasystech_app;` (antes, apague os logins que herdam dele).

## Etapa 2 entregue (#871)

Sem migração e sem política: só o contrato de conexão do ADR passa a valer no código.

- **Consulta avulsa.** `scopeDbToClinic` (`clinic-scoped-pool.ts`) devolve um `db` cujo pool abre, por consulta, uma
  transação curta: `begin; select set_config('app.clinic_id', <id>, true)`, a consulta e `commit`. O valor é local à
  transação (não vaza entre requisições nem atravessa o PgBouncer em modo transação). Custo: um `begin` (com o
  `set_config` na mesma ida ao banco) e um `commit` a mais por consulta; medir na staging antes da etapa 4. Erro na
  consulta faz `rollback`; se o `rollback` também falhar a conexão é descartada, não devolvida ao pool.
- **`db.transaction` dos repositórios** (travas de fatura, paciente e repasse, MFA, retenção): o cliente do pool
  grava a clínica logo depois do `begin`, então toda consulta da transação já a enxerga.
- **`DrizzleTransactionManager.run`** grava `set_config(..., true)` como primeira consulta de toda unidade de
  trabalho; `getRepositories` lhe entrega o `db` sem o envoltório (um `set_config` só por transação).
- **Escopo de sistema** (`systemScope()`, ou sessão sem clínica): `getRepositories` usa `getSystemDb()`
  (`DATABASE_SYSTEM_URL`, `BYPASSRLS`) e **não grava** `app.clinic_id`. Sem a variável, `getSystemDb()` é o próprio
  `getDb()` e nada muda. `staff-revocation` (leitura da conta por sessão no proxy) segue a mesma regra.
- **PGlite** (suíte unitária e E2E locais) não aplica RLS: o envoltório devolve o próprio `db`; o
  `set_config` do gerenciador roda, porque o PGlite o entende.
- **O que ficou fora, de propósito:** `readiness.ts` (`/api/health/ready`), `app-release-service` e `rate-limit` seguem
  em `getDb()` sem clínica. O papel da aplicação **não enxerga o esquema `drizzle`**: antes de apontar a
  `DATABASE_URL` para ele (passo do dono, não desta etapa) a leitura de migrações aplicadas do readiness precisa de
  outra solução (issue aberta junto deste PR).
- **Prova:** `tests/integracao/rls-etapa-2-set-config.integracao.ts` (Postgres real, pool de **uma** conexão, o pior
  caso para vazamento) e `tests/infrastructure/clinic-scoped-pool.test.ts`.
- **Rollback:** remover o envoltório (`scopeDbToClinic` em `getRepositories` e em `lookupAccountStatus` de `staff-revocation`, e o `set_config` do gerenciador);
  sem migração, sem dado a desfazer. Publicar de volta a versão anterior também basta.

## Premissa a verificar na etapa 1

A aplicação de produção conecta como o usuário `estomasystech` na base `estomasystech`, criado pelo Coolify junto
com o banco. Muito provavelmente é dono das tabelas e talvez superusuário, o que faz o Postgres ignorar qualquer
política. **Isto não foi conferido no servidor.** Conferência (sem aspas, para o zsh): abrir o psql com
`ssh -t vps sudo docker exec -it <container-do-banco> psql -U estomasystech -d estomasystech` e digitar `\du`;
`Superuser` ou `Bypass RLS` na linha do papel confirmam o risco. A etapa 1 cria um papel de aplicação **não dono e
sem `BYPASSRLS`** e o dono ajusta a `DATABASE_URL` no Coolify. Nada disto é feito por este PR.
