---
title: "ADR 113 — Release deploy migra o banco antes do deploy e reverte a imagem se a fumaça reprovar"
status: living
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-17
related:
  - docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md
  - docs/adr/095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md
  - docs/adr/110-rls-por-clinica-spike-e-plano-de-rollout.md
  - docs/engineering/producao.md
  - docs/engineering/migracoes-aditivas.md
---

# ADR 113 — Release deploy migra o banco antes do deploy e reverte a imagem se a fumaça reprovar

- **Data:** 2026-11-17
- **Status:** aceito (decisão do coordenador a partir do postmortem da publicação da v0.9.1; o dono pediu que
  nunca mais se repita). **Emenda o [ADR-095](./095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md)** na
  linha "Rollback automático em falha da fumaça: rejeitada".
- **Domínios afetados:** engenharia (release, deploy, banco), operação (produção).

## Contexto

Em 2026-11-17 o *Release deploy* colocou a v0.9.1 no ar com o banco ainda na v0.8.0. O container novo subiu
como `estomasystech_login` (sem `CREATE`, sem superusuário) com `ESTOMASYSTECH_MIGRATE_ON_BOOT=false`, então
**ninguém** migrou: o código novo leu colunas, políticas e a função `public.app__drizzle_migrations()` que o
banco não tinha. Resultado: readiness 503 (`migrations: pending`), erros `42501` e `42703` em produção e a
fumaça vermelha, com o container já no ar e nenhuma volta. As dez migrações (`0074` a `0083`) entraram à mão por
`psql`, com hash calculado fora do Drizzle; um `db:migrate` futuro poderia discordar delas.

Duas falhas de desenho: (1) o workflow não tinha passo que migrasse com o dono, e a fumaça exige o esquema
novo; (2) uma falha depois do deploy deixava a produção quebrada até um humano agir (ADR-095 rejeitava o
rollback automático porque as migrações não têm `down`). Um terceiro defeito apareceu no caminho (#918): o
minificador do build apagava o nome de uma classe de que o drizzle dependia, e nenhum teste rodava o código
minificado.

## Decisão

1. **Migrar com o dono, antes de trocar o container.** O job `producao` aplica as migrações pendentes depois do
   backup e antes do deploy, pelo **dono** do banco (`estomasystech`), pelo canal que funcionou: `ssh` com
   comando forçado (`deploy/migrate/ci-migrate.sh`, chave própria e separada da do backup) que roda `psql`
   **dentro do container do Postgres**, pelo socket local, sem senha em URL. O SQL vem de
   `scripts/release/migrar-producao.ts`, que usa o `readMigrationFiles` do drizzle-orm: o `hash` (sha256 do
   arquivo) e o `created_at` (`when` do journal) gravados são **os mesmos** do `drizzle-kit`. Nada de hash à mão.
   A regra de "o que falta" é a do migrador do Drizzle (`when` maior que o último carimbo); um buraco (migração
   antiga ausente, a armadilha 0050/0051) reprova antes de escrever. Tudo numa transação com `lock_timeout`.
2. **Trava.** Migração pendente que falha para o job **antes** do deploy: o código antigo segue no ar sobre o
   esquema antigo. Depois de migrar, o script lê o banco de novo e confere que a tabela do Drizzle **e**
   `public.app__drizzle_migrations()` (o que o readiness lê) cobrem o journal inteiro; senão, não há deploy.
3. **Rollback automático da imagem.** Antes de qualquer escrita o workflow registra a versão em produção
   (`/api/health/version` → tag → SHA) e prova que o token do Coolify consegue escrever no recurso (PATCH do
   `git_commit_sha` com o valor atual). A fumaça passa a rodar dentro do job `producao` e, se reprovar depois
   de um deploy bem-sucedido, o workflow fixa o SHA anterior, faz o deploy forçado, confere o commit, devolve
   o recurso a `HEAD` (sempre), apaga a versão revertida de `app_releases` e roda a fumaça de novo. **O banco
   fica como está** (expand/contract). O run termina **vermelho** de propósito, com a anotação
   `ROLLBACK AUTOMÁTICO EXECUTADO`. A tag e a Release só saem **depois** da fumaça verde, para não existir
   Release de versão que não está no ar.
4. **`dry_run` e ensaio.** O job `validar` (sem segredo, para `dry_run` e publicação) ensaia a migração num
   Postgres 18 descartável: monta o banco da tag anterior, roda o **mesmo** `migrar-producao.sh` e o **mesmo**
   `ci-migrate.sh` (transporte local no lugar do ssh) em `simular` (nada pode mudar), `migrar` e de novo
   `migrar` (nada pendente), e compara `(hash, created_at)` com um banco migrado do zero pelo drizzle-orm.
   Sem isso o disparo não chega à aprovação. O estado real de produção é lido (só leitura) no passo
   "Detectar migrações pendentes" do job `producao`, antes do backup.
   O mesmo job ensaia o **rollback** (#925): `scripts/release/ensaio-rollback.sh` roda os scripts reais e o texto
   do passo "Rollback automático da imagem" (lido do YAML) contra um simulador local do Coolify, com a fumaça
   reprovando de propósito. Limite: o Coolify é simulado; a imagem real e o proxy não entram.
5. **Teste da classe do #918.** `tests/integracao/bundle-minificado.integracao.ts` empacota e **minifica** o
   código do pool com escopo de clínica (esbuild) e o roda contra Postgres real: sem a correção reproduz o
   `25001`. Roda no gate do PR, antes da staging.

## Opções consideradas

| Opção | Decisão |
| --- | --- |
| Migrar no boot do container novo com o dono (`MIGRATE_ON_BOOT` ligado) | Rejeitada: obriga o app a conectar como dono, o oposto do RLS (ADR-110) |
| `drizzle-kit migrate` do runner por túnel SSH | Rejeitada: a senha do dono não autentica numa URL por túnel (postmortem) e exigiria segredo de banco no GitHub |
| `psql` no container do Postgres como o dono, comando forçado, SQL gerado pelo drizzle-orm | **Aceita** |
| Hash calculado à mão | Rejeitada: o `db:migrate` seguinte poderia discordar |
| Simular a migração no banco de produção em todo disparo | Rejeitada: segura travas em tabelas vivas; o ensaio descartável cobre o SQL e a produção só é lida |
| Rollback automático da imagem e do banco | Rejeitada: sem `down`; só a imagem volta |
| Rollback manual (ADR-095) | Substituída pelo rollback automático da imagem |

## Consequências

- **Setup único do dono** (`producao.md` § 4.9): script e sudoers no VPS, chave SSH `VPS_MIGRATE_SSH_KEY` no
  *Environment* `producao`, Auto Deploy do Coolify **desligado** (o preflight reprova se a API disser que está ligado), `COOLIFY_TOKEN` com a habilidade **write**. Sem eles o workflow para **antes** do
  backup, nunca no meio.
- O rollback da imagem só é seguro se o código antigo funciona sobre o esquema novo. O lint de migração aditiva
  classifica `0074` a `0083` como não aditivas (falha fechada: criam papel, política, `FORCE`). Nesse caso o
  workflow reverte mesmo assim, avisa na anotação e o dono confere login e busca; se falhar, restaura o
  backup (`producao.md` § 3.1, passo 6).
- A chave de migração executa SQL arbitrário como dono do banco: quem a controla controla o banco. A mitigação é a mesma
  da publicação: o segredo vive só no *Environment* `producao` (revisor único, só `main`), o comando forçado aceita
  quatro verbos e o `restrict` do `authorized_keys` tira shell, túnel e agente. Rotacionar junto da chave de backup (§ 6).
- `dry_run` agora também ensaia a migração (mais ~3 min) e continua sem segredo, sem aprovação e sem tag.
- Conversão de dados (`data:reencrypt`) segue fora do workflow.
- Não prova: login de atendente e profissional, busca de paciente e isolamento entre clínicas em produção
  (a fumaça é sem login). Essa conferência continua manual depois de uma release que toca RLS.
