---
title: "ADR 110 — Row-Level Security por clínica: resultado do spike e plano de rollout"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-15
related:
  - docs/adr/001-multi-tenancy.md
  - docs/engineering/migracoes-aditivas.md
---

# ADR 110 — Row-Level Security por clínica

- **Data:** 2026-11-15
- **Status:** proposto (spike da #729; nenhuma mudança de comportamento em produção).
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
- **Seed, migração e testes:** rodam como dono (ignoram a política). Os testes de integração passam a abrir o
  papel `app` onde a prova for sobre isolamento; a suíte em PGlite não aplica RLS e segue como está.
- **Cron e `systemScope()`:** usam o pool `sistema`; a allowlist de `tests/lib/tenant-scope.test.ts` continua
  sendo a lista de quem pode.

## Premissa a verificar na etapa 1

A aplicação de produção conecta como o usuário `estomasystech` na base `estomasystech`, criado pelo Coolify junto
com o banco. Muito provavelmente é dono das tabelas e talvez superusuário, o que faz o Postgres ignorar qualquer
política. **Isto não foi conferido no servidor.** Conferência (sem aspas, para o zsh): abrir o psql com
`ssh -t vps sudo docker exec -it <container-do-banco> psql -U estomasystech -d estomasystech` e digitar `\du`;
`Superuser` ou `Bypass RLS` na linha do papel confirmam o risco. A etapa 1 cria um papel de aplicação **não dono e
sem `BYPASSRLS`** e o dono ajusta a `DATABASE_URL` no Coolify. Nada disto é feito por este PR.
