---
title: "ADR 035 — Renomeação completa para estomasystech: banco, variáveis, rótulos de chave, cookie e marca"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/034-renomeacao-do-repositorio-para-estomasystech.md, docs/adr/006-chave-de-dados-clinicos.md, docs/engineering/producao.md]
---

# ADR 035 — Renomeação completa para estomasystech: banco, variáveis, rótulos de chave, cookie e marca

- **Data:** 2026-10-18
- **Status:** aceito. Complementa o [ADR-034](034-renomeacao-do-repositorio-para-estomasystech.md), que trocou só repositório e infraestrutura e deixou o resto: @KalleoPinheiro decidiu trocar tudo, porque o sistema ainda não foi para produção e não há dado nem sessão a preservar.
- **Domínios afetados:** engenharia (banco, configuração), acesso (cookie, tokens), pacientes-prontuario (cifra de dados clínicos)

## Contexto

O ADR-034 manteve `vitta`/`vitta-flow`/`VittaFlow` onde a troca quebraria dado existente. Sem produção, esse custo some, e conviver com dois nomes só confunde.

## Decisão

**Trocar tudo, sem camada de compatibilidade.**

| Antes | Depois |
| --- | --- |
| banco e usuário Postgres `vitta` | `estomasystech` |
| variáveis `VITTA_*` (`VITTA_BOOTSTRAP_TOKEN`, `VITTA_MIGRATE_ON_BOOT`, `VITTA_DB_DRIVER`, `VITTA_ALLOW_OPEN_MODE`, `VITTA_PGLITE_TEMPLATE_PATH`) | `ESTOMASYSTECH_*` |
| cookie `vitta_session` e demais `vitta_*` | `estomasystech_*` |
| rótulos de chave `vitta-flow/clinical-data/v1`, `vitta-flow/key-id:`, `vitta-flow/mfa-pending/v1`, `vitta-flow-dev-only-data-key:` | `estomasystech/...` |
| `/etc/vitta`, `/var/backups/vitta`, `vitta-backup.key` | `/etc/estomasystech`, `/var/backups/estomasystech`, `estomasystech-backup.key` |
| marca "VittaFlow" / "Vitta Flow" (interface, e-mails, README) | "EstomaSysTech" |

ADRs aceitos e o handoff antigo **não foram reescritos**: neles, `vitta*` e `VITTA_*` são os nomes da época; use a tabela acima para traduzir.

## Consequências

- **Quebra de uma vez, aceita por não haver produção:** dado cifrado com a chave derivada do rótulo antigo não abre; sessões e tokens de segundo fator em voo caem. Bancos de desenvolvimento precisam ser recriados (`docker compose down -v`, depois `up`); o volume antigo guarda o banco `vitta`.
- **Quem já tem `.env`, cron ou Coolify configurado** deve renomear as variáveis `VITTA_*` para `ESTOMASYSTECH_*`; o app não lê mais os nomes antigos.
- **Antes do primeiro dado real**, qualquer novo rótulo de chave volta a ser mudança de dados (ADR-006).
