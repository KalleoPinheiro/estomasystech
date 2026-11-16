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
- **Status:** em execução (spike da #729; etapa 1 entregue em 2026-11-16, #870; etapa 2 entregue, #871; etapa 3 entregue, #872: política em três tabelas; etapa 4 em PR, #873: política nas demais tabelas clínicas e financeiras, nenhuma conexão trocada).
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

- **40 tabelas com `clinic_id`** (texto): recebem a política `tenant_isolation` (nas migrações reais ela se chama `clinic_isolation`, ver etapa 3)
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

## Etapa 3 entregue (#872)

Primeira política ligada, só em tabelas de baixo risco.

- **Migração `0076_rls-politicas-baixo-risco`:** em `supplies`, `partners` e `schedule_closures`,
  `ENABLE ROW LEVEL SECURITY` e a política `clinic_isolation` `USING/WITH CHECK (clinic_id = current_setting('app.clinic_id', true))`.
  Idempotente (`DROP POLICY IF EXISTS` antes do `CREATE POLICY`), sem `FORCE`, sem tocar em dado. O lint `check:migracao`
  falha fechado em RLS (instrução que ele não conhece) e a classifica como não aditiva; na prática é reversível sem backup
  e o código antigo segue funcionando sobre ela (ver a tabela abaixo).
- **Quem é filtrado.** A política vale para o papel da aplicação (`estomasystech_app`: não dono, sem `BYPASSRLS`). O **dono da
  tabela** e o superusuário **ignoram** a política enquanto não houver `FORCE` (etapa 5): é o que a produção faz hoje,
  conectada como `estomasystech` (premissa abaixo, ainda não conferida). Nesse caso a etapa 3 **não muda nenhum
  comportamento**, nem para melhor nem para pior. Com o papel da aplicação, uma consulta sem `app.clinic_id` devolve zero
  linhas nas três tabelas e o `WITH CHECK` recusa gravar para outra clínica.
- **Caminhos sem clínica.** Nenhum deles toca as três tabelas: `readiness` (esquema `drizzle`), `app-release-service`
  (`app_releases`) e `rate-limit` (`rate_limit_windows`) ficam em `getDb()` sem clínica e não são afetados. O escopo de sistema
  (`systemScope()`) usa `getSystemDb()`: com `DATABASE_SYSTEM_URL` (`BYPASSRLS`) vê todas as clínicas; **sem** a variável ele
  cai no pool da aplicação e, com o papel novo, passa a ver zero linhas nessas tabelas. Por isso `DATABASE_SYSTEM_URL` precisa
  estar definida **antes** de trocar a `DATABASE_URL` para o papel da aplicação (producao.md § 4.3).
- **Scripts do dono** (`seed`, `data:reencrypt`, `report-portal-orphans`) abrem `getDb()` sem clínica e rodam com a URL do
  dono; com o papel da aplicação eles não leem essas tabelas. Fica para a etapa 5 (papel de migração com `BYPASSRLS`).
- **`procedure_supplies`** (sem `clinic_id`, herda do procedimento) ficou fora desta etapa; a decisão (coluna nova) foi tomada e entregue na etapa 4.
- **Prova:** `tests/integracao/rls-etapa-3-politicas.integracao.ts` (Postgres real, pool de **uma** conexão): catálogo, os três
  atores (aplicação, sistema com `BYPASSRLS`, dono), repositórios reais com o papel da aplicação, `WITH CHECK`, falha fechada,
  idempotência e o rollback.
- **Por que `clinic_isolation` e não `tenant_isolation`:** o portão de compatibilidade da migração roda a suíte de integração
  da base sobre o esquema novo, e o `rls-spike.integracao.ts` da base cria `tenant_isolation` em `partners` e `supplies`;
  com o mesmo nome o `CREATE POLICY` do spike falharia. Nome distinto mantém o spike intacto (as duas políticas têm o mesmo
  predicado, então o efeito é o mesmo). As etapas 4 e 5 seguem com `clinic_isolation`.
- **Desempenho:** o predicado usa `clinic_id` (já indexado) e `current_setting` estável por consulta; só vale para o papel
  da aplicação. Medir `EXPLAIN` e latência na staging antes da etapa 4.
- **Rollback:** `ALTER TABLE supplies DISABLE ROW LEVEL SECURITY;` (idem `partners`, `schedule_closures`), instantâneo e sem
  perda de dado. `DROP POLICY` sozinho **não** serve (RLS ligado sem política nega tudo ao papel da aplicação); só como limpeza depois do `DISABLE`. Não exige restaurar backup.

## Etapa 4 entregue (#873)

Política `clinic_isolation` em 35 tabelas (34 que já tinham `clinic_id` NOT NULL e `procedure_supplies`, que ganha a coluna), em três
migrações. Total coberto com a etapa 3: 38 tabelas. Nenhuma conexão trocada, nenhum `FORCE`.

- **`0077_rls-procedure-supplies-clinic`** (expandir e contrair numa só migração, tabela pequena): `procedure_supplies` ganha
  `clinic_id`, preenchido a partir do procedimento, depois `NOT NULL`, índice e chave estrangeira composta
  `(procedure_id, clinic_id) -> procedures (id, clinic_id)` (para isso `procedures` ganha o índice único `uq_procedures_id_clinic`).
  Um gatilho `BEFORE INSERT` completa `clinic_id` quando ele vem nulo: a versão anterior do código, que ainda não conhece a coluna,
  segue gravando kits durante a janela do deploy e o `NOT NULL` não a derruba. O repositório novo grava a coluna de forma explícita.
  A mesma migração cria o índice `clinic_id` das quatro tabelas que não tinham índice líder nessa coluna
  (`professional_availability`, `invoice_payments`, `commission_payouts`, `commission_payout_items`).
- **`0078_rls-politicas-clinicas`** (29 tabelas): profissionais, procedimentos e kit, grade e disponibilidade, lista de espera,
  responsáveis, pacientes, consultas, anamnese, evolução, condições, avaliações, fotos, consentimentos, pedidos de titular,
  lotes e movimentos de estoque, retornos, lembretes, plano de cuidado (e seus quatro filhos), vínculos profissional-paciente e
  canais da empresa. **`0079_rls-politicas-financeiro`** (6 tabelas): pacotes, consumos, faturas, recebimentos, repasses e itens de repasse.
  Dois lotes para que o rollback de uma área não toque na outra; o SQL de cada tabela é o mesmo da etapa 3 (idempotente).
- **Decisão: coluna `clinic_id` em `procedure_supplies`, não política com `EXISTS`.** Política por igualdade simples e indexável, do
  mesmo formato em todas as tabelas, sem subconsulta por linha. A divergência entre a coluna e o procedimento é impossível no banco
  (chave composta). O custo é uma coluna redundante numa tabela de poucas linhas.
- **Fora desta etapa, de propósito: `user_accounts`, `google_accounts` e `audit_events`.** O `clinic_id` delas é anulável (conta e
  evento de sistema, sem empresa) e são lidas por login, convite, recuperação de senha e plataforma antes de a empresa ser conhecida.
  Elas e as tabelas sem `clinic_id` (`clinics`, `auth_tokens`, `user_mfa`, `mfa_recovery_codes`) formam o lote de identidade e
  auditoria, que pede um mapeamento caminho a caminho de quem lê sem clínica (login, MFA, `recover-super-admin`); fica para a etapa 5
  ou um lote próprio antes dela. A taxonomia NANDA/NOC/NIC, `rate_limit_windows`, `job_runs` e `app_releases` seguem sem RLS (globais).
- **Quem é filtrado, e o que muda em produção:** igual à etapa 3. A política só vale para o papel da aplicação (não dono, sem
  `BYPASSRLS`); o dono da tabela e o superusuário a ignoram enquanto não houver `FORCE`. Com a produção conectada como dono
  (premissa ainda não conferida), **esta etapa não muda comportamento**. Quando a aplicação trocar de papel, `DATABASE_SYSTEM_URL`
  precisa estar definida (login, convite, plataforma e cron leem sem clínica) e a #889 resolvida (readiness).
- **Prova:** `tests/integracao/rls-etapa-4-politicas.integracao.ts` (Postgres real, pool de uma conexão) lê o catálogo e exige o mesmo
  comportamento de **toda** tabela com `clinic_id` (uma tabela nova sem política reprova): vê só a própria clínica, zero linhas sem
  `app.clinic_id`, `WITH CHECK` recusa mover ou inserir para outra clínica, `UPDATE`/`DELETE` sem filtro só afetam a própria,
  sistema (`BYPASSRLS`) e dono veem tudo, idempotência e rollback (uma tabela e todas). Repositórios reais (profissionais, procedimentos,
  kit) e o gatilho e a chave composta de `procedure_supplies` também. `rls-etapa-4-backfill.integracao.ts` parte do esquema da etapa 3,
  grava kits como a versão anterior e aplica as migrações novas por cima.
- **Compatibilidade da migração (portão do CI).** O portão roda a suíte de integração da base sobre o esquema novo. Dois testes da
  etapa 3 afirmavam "só três tabelas com RLS" e "`patients` legível pelo papel da aplicação", falsos por desenho depois desta etapa;
  o PR #891 os tornou independentes da etapa (TESTE-ALTERADO) e entrou antes. Etapas futuras que liguem mais tabelas não repetem o problema.
- **Desempenho** (Postgres 16 local, papel não dono com `app.clinic_id`, 5 empresas, 100 mil consultas, 25 mil pacientes, 40 mil faturas;
  p50/p95 em ms, 300 execuções por consulta, cada uma em `begin; set_config; consulta; commit`):

  | Consulta | Dono (hoje) | Papel da aplicação, RLS desligado | Papel da aplicação, RLS ligado |
  | --- | --- | --- | --- |
  | agenda, uma semana (336 linhas) | 4,22 / 7,34 | 4,21 / 6,79 | 4,83 / 7,28 |
  | ficha: paciente por id | 0,28 / 0,63 | 0,31 / 0,61 | 0,26 / 0,43 |
  | ficha: evoluções do paciente | 0,26 / 0,43 | 0,35 / 0,50 | 0,24 / 0,33 |
  | ficha: consultas do paciente | 0,25 / 0,52 | 0,37 / 0,48 | 0,33 / 0,94 |
  | lista de pacientes (5 mil linhas) | 5,66 / 8,91 | 6,07 / 9,89 | 6,18 / 9,82 |
  | financeiro: lista de faturas (50) | 0,38 / 0,71 | 0,45 / 0,68 | 0,62 / 0,90 |
  | financeiro: resumo do mês | 2,17 / 3,60 | 2,28 / 3,86 | 2,72 / 4,11 |

  O `EXPLAIN ANALYZE` mostra que o predicado vira um `One-Time Filter` (`current_setting` é estável: avaliado uma vez por consulta)
  ou um `Index Cond` em `idx_*_clinic`, sem varredura nova e sem subconsulta por linha. A diferença com o RLS ligado está dentro
  do ruído, no pior caso 0,2 a 0,5 ms em consultas que já custam menos de 3 ms. Consulta **sem** o filtro de clínica na aplicação (a
  política sozinha) também usa o índice. Medido em Postgres local, não na staging (as threads não a alcançam): repetir lá antes de a
  aplicação trocar de papel.
- **Rollback**, instantâneo e sem restaurar backup, por tabela: `ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY;`. Para um lote
  inteiro, repita o comando nas tabelas da migração. **Não** use `DROP POLICY` sozinho. A coluna, o gatilho e os índices da `0077` são
  aditivos para o código e podem ficar; voltar a `DATABASE_URL` para o dono também desfaz o efeito sem tocar no banco.

## Premissa a verificar na etapa 1

A aplicação de produção conecta como o usuário `estomasystech` na base `estomasystech`, criado pelo Coolify junto
com o banco. Muito provavelmente é dono das tabelas e talvez superusuário, o que faz o Postgres ignorar qualquer
política. **Isto não foi conferido no servidor.** Conferência (sem aspas, para o zsh): abrir o psql com
`ssh -t vps sudo docker exec -it <container-do-banco> psql -U estomasystech -d estomasystech` e digitar `\du`;
`Superuser` ou `Bypass RLS` na linha do papel confirmam o risco. A etapa 1 cria um papel de aplicação **não dono e
sem `BYPASSRLS`** e o dono ajusta a `DATABASE_URL` no Coolify. Nada disto é feito por este PR.
