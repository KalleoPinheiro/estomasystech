---
title: "Arquitetura"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
related:
  - docs/adr/001-multi-tenancy.md
  - docs/adr/002-autorizacao-em-duas-camadas.md
---

# Arquitetura

> **TL;DR:** monólito Next.js 16 (App Router) em DDD por camadas, dependências apontando para
> dentro. Postgres 16 via Drizzle; isolamento multiempresa na aplicação (`clinic_id` + escopo
> tipado); autorização em duas camadas que falha fechado. Integrações externas entram por portas.

## Camadas

```text
src/
├── domain/          entidades, value objects, regras, contratos de repositório (sem I/O)
├── application/     casos de uso (um por arquivo) + ports/ (e-mail, agenda, mensageria, fotos, transação)
├── infrastructure/  repositórios Drizzle e in-memory, gateways externos, container.ts (composição)
├── app/             páginas (staff em (staff)/, portal/, documentos/) e api/ (route handlers)
├── components/      UI sobre @still-void/ui
├── lib/             auth (sessão, política, tenant scope), DTOs, cliente HTTP, hooks
└── proxy.ts         borda: autenticação, papel, rate limit, CSP com nonce
```

| Regra | Onde é garantida |
| --- | --- |
| `domain` não importa de nenhuma outra camada | revisão + convenção (sem lint dedicado) |
| rota nunca acessa Drizzle direto: `getRepositories(scope)` → caso de uso | `src/infrastructure/container.ts` |
| `getRepositories` só aceita escopo tipado (`sessionScope`/`writeScope`/`clinicScope`/`systemScope`) | tipo `TenantScope` em `src/lib/auth/tenant-scope.ts` + `tests/lib/tenant-scope.test.ts` |
| toda resposta de API usa o envelope `{ success, data, error, meta? }` | `src/lib/api-response.ts` |
| serviço externo só via porta em `application/ports/` | gateways em `infrastructure/` |

## Fluxo de uma requisição

1. `src/proxy.ts` — sem `AUTH_SECRET` responde `503`; valida o cookie assinado, o papel da
   família de rota e o rate limit (por conta autenticada ou por IP se anônimo, somado entre réplicas no Postgres); gera o nonce da CSP.
2. Route handler em `src/app/api/**` — `require-session` reautoriza (camada 2, [ADR-002](../adr/002-autorizacao-em-duas-camadas.md)).
3. `getRepositories(sessionScope(guard.session))` — repositórios já filtrados pela clínica da sessão ([ADR-001](../adr/001-multi-tenancy.md)).
4. Caso de uso em `src/application/**` aplica as regras do `domain`.
5. Resposta no envelope; efeitos externos (ex.: Google Calendar) rodam em `after()`, fora do caminho da resposta.

## Decisões transversais

| Tema | Decisão | Fonte |
| --- | --- | --- |
| Multiempresa | `clinic_id` em toda tabela, filtro na aplicação; RLS adiada | [ADR-001](../adr/001-multi-tenancy.md) |
| Autorização | proxy + handler, fail-closed | [ADR-002](../adr/002-autorizacao-em-duas-camadas.md) |
| Papéis | catálogo fechado de 6 | [ADR-003](../adr/003-modelo-de-papeis-multi-empresa.md) |
| Autenticação | só e-mail + senha própria; Google é integração | [ADR-004](../adr/004-remocao-google-oauth-autenticacao.md) |
| Paginação | cursor opaco em `meta.nextCursor` (pacientes, faturas) | `.specs/features/paginacao-cursor-csp-nonce/` |
| CSP | nonce por request, sem `unsafe-inline`; por isso o layout raiz é `force-dynamic` | `src/proxy.ts` |
| Headers estáticos | HSTS, `X-Frame-Options`, COOP/CORP `same-origin`, sem `X-Powered-By` (#219) | `next.config.ts` |
| Várias réplicas | rate limit no Postgres, fotos no S3, caches só de dado imutável | [`CONTEXT.md`](../../CONTEXT.md) § Critical constraints |
| Migrações | Drizzle em `drizzle/`, aplicadas no boot com advisory lock (`VITTA_MIGRATE_ON_BOOT=false` desliga) | `src/infrastructure/persistence/drizzle/db.ts` |

API por recurso: [api.md](api.md). Padrões de código e testes: [conventions.md](conventions.md).
