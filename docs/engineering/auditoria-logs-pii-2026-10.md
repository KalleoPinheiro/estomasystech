---
title: "Auditoria de logs e dado pessoal — outubro de 2026"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/059-redacao-central-de-pii-nos-logs.md, docs/adr/014-observabilidade-sem-pii.md]
---

# Auditoria de logs e dado pessoal — outubro de 2026

> **TL;DR:** 56 chamadas de log em `src/` (45 `logError`, 11 `logger.*`). Nenhum grava dado de paciente
> hoje: só ids, e-mail mascarado (`maskEmail`) e metadados. A redação central (ADR-059) tornou isso
> uma garantia do logger, não do chamador. Este documento **não contém dado real**: todo exemplo
> está já mascarado (decisão do dono, [#381](https://github.com/KalleoPinheiro/estomasystech/issues/381)).
> Snapshot de 2026-10-21; a rotina mensal (`producao.md` § 9.4) repete o roteiro e gera novo snapshot.

## Método

1. `grep -rnE "logger\.(info|warn|error)|logError\(" src` lista os pontos; `tests/lib/log-error-architecture.test.ts`
   garante que não há `console.*` fora do logger.
2. Para cada ponto: o que a mensagem interpola, que campos extras leva e se o valor pode ser dado pessoal.
3. Risco: **A** nenhum (só id, contagem, config); **B** contato mascarado; **C** poderia levar dado pessoal
   se o chamador mudasse (coberto só pela redação central).

## Resultado por grupo

| Grupo | O que sai | Risco | Exemplo (já mascarado) |
| --- | --- | --- | --- |
| Banco, readiness, pool (`db.ts`, `readiness.ts`) | SQLSTATE, tabela, constraint, frames; nunca query nem parâmetros (#202) | A | `error: {name: "DatabaseError", code: "23505", table: "users"}` |
| Rotas de auth (`login`, `logout`, `forgot-password`, `set-password`) | contexto fixo + erro sanitizado | A | `msg: "Reset de senha: falha ao emitir o link"` |
| Auditoria, revogação, rate limit, tema, calendário, vínculo (`lib/*`) | contexto + ids (`professionalId`, `patientId`) | A | `Vínculo profissional-paciente pendente (profissional <uuid>, paciente <uuid>)` |
| Retenção, lembretes, alertas, prazo do titular (`application/*`) | `clinic.id`, `request.id`, `photo.id`, chave de alerta | A | `Pedido do titular <uuid>: falha no aviso` |
| Aviso ao paciente/clínica sem envio (`notify-clinic-status`, `revoke-guardian-access`) | id + destinatário por `maskEmail` | B | `não enviado para ma***@clinica.com` |
| Dry-run do e-mail (`NullEmailGateway`) | destinatário mascarado + assunto; corpo nunca; link de senha só fora de produção | B (dev) | `Para br***@estomasystech.test — Convite` |
| Foto sem sanitização de EXIF (`add-condition-photo`) | `conditionId` | A | `condição <uuid>` |
| API 404 e erro inesperado (`api-response`) | `entity`, `entityId` (id); erro sanitizado | A | `{entity: "Patient", entityId: "<uuid>"}` |
| Erro não tratado (`request-error`) | `method`, `route`, `routeType`, `requestId` | A | `route: "/api/patients/[id]"` (padrão, nunca o caminho real) |
| Configuração e chaves (`app-timezone`, `data-cipher`, `client-ip`) | nome da variável e fuso; nunca valor de chave | A | `[config] DATA_ENCRYPTION_KEY ausente` |
| Mocks (`mocks/server`) | aviso fixo | A | — |

Nenhum ponto interpola nome, CPF, telefone, e-mail cru ou conteúdo clínico (verificado por
`tests/lib/log-pii-architecture.test.ts`, C17).

## Achados

| # | Achado | Gravidade | Tratamento |
| --- | --- | --- | --- |
| 1 | `msg` e campos do logger não passavam por nenhuma limpeza: só `logError` limpava. Um `logger.info('…', { patient })` gravaria o objeto inteiro | alta (latente; nenhum chamador atual) | ADR-059: `redactFields`/`scrubText` no `emit` |
| 2 | Link de definição de senha (credencial) no log do dry-run fora de produção | baixa (só dev/E2E, dados fictícios) | mantido como **única exceção**, documentada; em produção sempre redigido |
| 3 | URL com `?token=` em mensagem de erro de fornecedor (Resend, Google) iria ao log e ao GlitchTip | média | `scrubText` troca a query por `?[redigido]`; credencial `Bearer`/JWT/opaca também |
| 4 | Tags e `transaction` do evento do GlitchTip não eram limpas | baixa | `scrubEvent`/`buildEvent` passam por `scrubText` |
| 5 | Campo de log podia sobrescrever `time`, `level`, `msg` | baixa (integridade do log) | metadados fixos no `emit` |

## Fora do alcance deste código (residual)

| Fonte | Risco | Situação |
| --- | --- | --- |
| Erro não tratado que o Next escreve em texto (`⨯ …`) | mensagem de exceção sem limpeza | o mesmo erro sai limpo em JSON pelo `onRequestError`; a linha crua segue (ADR-014) |
| Log de acesso do Traefik/Coolify (caminho e IP) | URL de convite/reset leva `?token=` | **não verificado nesta auditoria** (exige olhar o servidor); conferir na rotina mensal se o log de acesso guarda a query e por quanto tempo |
| Logs de terceiros (Coolify, GlitchTip, Postgres) | próprio de cada ferramenta | retenção do GlitchTip em 30 dias (`glitchtip.md`) |

## Como repetir

```bash
grep -rnE "logger\.(info|warn|error)|logError\(" src | wc -l        # chamadas (inclui as definições)
npx vitest run tests/lib/log-pii-architecture.test.ts                  # C17
docker logs <container-do-app> 2>&1 | jq -r '.msg' | sort | uniq -c    # mensagens reais, só leitura
```

Ao revisar log de produção, **não cole linha crua em chat, issue ou PR**: mascare antes (este
documento é o modelo) e registre o resultado como novo snapshot `auditoria-logs-pii-AAAA-MM.md`.
