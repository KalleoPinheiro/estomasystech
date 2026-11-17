---
title: Incidente de 2026-11-17, release v0.9.1 com código novo e banco da v0.8.0
status: frozen
audience: operação, engenharia
owner: Kalléo Pinheiro
last_reviewed: 2026-11-17
---

# Incidente de 2026-11-17: código novo, banco velho

O Release deploy colocou a v0.9.1 (`f4b9bab`) no ar com o banco ainda na v0.8.0. O app respondeu 503 no readiness e gerou erro de banco (`42501` e `42703`) até as dez migrações faltantes (`0074` a `0083`) serem aplicadas à mão.

## Causa

O Release deploy não migra com o dono. Ele sobe o container e a fumaça exige o esquema novo. Com `ESTOMASYSTECH_MIGRATE_ON_BOOT=false` e a `DATABASE_URL` no login restrito (`estomasystech_login`, sem superusuário), o container novo não migra. Resultado: código novo, banco velho, run vermelho e nenhum rollback automático. O workflow marcou backup, tag e deploy como sucesso; a falha só apareceu na fumaça, com o container já no ar.

A tentativa de completar pelo `drizzle-kit` falhou porque a senha do dono não autenticou numa URL passada pelo túnel. O único canal que funcionou foi `psql` como `estomasystech` dentro do container do Postgres.

## Linha do tempo (America/Sao_Paulo)

1. Antes do disparo: produção na v0.8.0 como dono `estomasystech`. Criados `estomasystech_app`, `estomasystech_login` e `estomasystech_sistema`; no Coolify, `DATABASE_SYSTEM_URL`, `ESTOMASYSTECH_MIGRATE_ON_BOOT=false` e `DATABASE_URL` no login restrito.
2. 14:00: PR da release #917 na `main`. A staging falhou às 14:12 (`GET /api/patients?limit=100` com 500: o minify apagava o nome `ClinicScopedPool`, o `BEGIN REPEATABLE READ` caía dentro de outra transação, `25001`). Corrigido no #918 (`f4b9bab`, 15:11).
3. 15:25: Release deploy na `main` (SHA `f4b9bab`, `rollback=backup`). Validação passou; backup, tag e deploy no Coolify.
4. 15:31: a fumaça falhou, readiness 503 com migrações pendentes. O app já gerava `42501` e `42703`.
5. 15:39 a 15:42: `npm run db:migrate` pelo túnel falhou na autenticação, sem aplicar nada.
6. 15:49: `psql` no container mostrou 74 linhas em `drizzle.__drizzle_migrations` contra 84 no journal da imagem, e a função `public.app__drizzle_migrations()` inexistente (o readiness lê essa função; sem ela o estado fica `pending`).
7. 15:50 a 16:02: as dez migrações foram aplicadas à mão, em ordem, com `ON_ERROR_STOP` e um `INSERT` do carimbo. A `0083` ligou `FORCE ROW LEVEL SECURITY` com a app já no login restrito.
8. 16:03: readiness ok; o `data:reencrypt` regravou 3 e-mails de login e respondeu «Nada pendente».

## Prova de integridade pós-conserto

Depois do conserto não havia prova de atendente, profissional, busca, isolamento nem backup após o `FORCE`, e os hashes das dez migrações tinham sido calculados fora do kit. Em 2026-11-17 foi rodado em produção um script somente leitura (`psql` dentro do container do banco como dono; só `SELECT`, com o isolamento testado em transação com `SET LOCAL ROLE` que não persiste). Resultado: **0 falhas e 0 avisos**.

| Item | Resultado |
| --- | --- |
| `/api/health/ready` | 200, `database: ok`, `migrations: ok` |
| Registros em `drizzle.__drizzle_migrations` | 84, igual ao journal da imagem; nenhum faltando, sobrando ou duplicado |
| Último carimbo | `1794864000000`, igual ao da `0083` (o migrador só compara este valor, então o próximo `db:migrate` não reaplica nada) |
| Hashes | 0 divergentes; as dez migrações aplicadas à mão (`0074` a `0083`) batem com o que o `drizzle-kit` calcula (sha256 do arquivo) |
| `public.app__drizzle_migrations()` | existe, `SECURITY DEFINER`, devolve os 84 carimbos; o login restrito a executa e não lê `drizzle` direto |
| RLS | 45 políticas `clinic_isolation`, 45 tabelas com FORCE, nenhuma tabela com RLS sem FORCE ou sem política |
| Papéis | `estomasystech_login` sem BYPASSRLS e sem superusuário; `estomasystech_sistema` com BYPASSRLS; `estomasystech_app` sem BYPASSRLS |
| Conexão da app | `estomasystech_login` |
| Isolamento | nas 2 clínicas, como `estomasystech_login`, só as linhas da própria clínica ficam visíveis (138 e 25, iguais ao esperado) e nenhuma de outra; sem `app.clinic_id` ou com id inexistente, 0 linhas em todas as 45 tabelas |
| Backup | `pg_dump` completo como o usuário do backup (superusuário) terminou com código 0 |
| Cifra | 0 e-mails de login, nomes, telefones, e-mails e CPFs em claro; 0 sem índice cego |

Como o hash não diverge, **não há SQL de reconciliação a aplicar**: o `drizzle-kit` não vai discordar dos registros feitos à mão.

### Pendente (ação manual)

- Backup de teste de ponta a ponta: `sudo systemctl start estomasystech-backup.service`, conferir `BACKUP_OK` no `journalctl` e `sha256sum -c SHA256SUMS` na pasta nova.
- Telas: entrar como atendente e como profissional; buscar paciente por nome, CPF e telefone; recuperar senha do admin.

## Regra que sai do incidente

Não disparar o Release deploy com `ESTOMASYSTECH_MIGRATE_ON_BOOT=false` e migrações pendentes enquanto o workflow não migrar com o dono antes da fumaça. A correção do workflow e do runbook (`producao.md`) é tratada à parte.
