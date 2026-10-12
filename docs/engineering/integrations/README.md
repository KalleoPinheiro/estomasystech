---
title: "Integrações externas"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
---


# Integrações externas

Todo serviço externo entra por uma **porta** em `src/application/ports/` e um **gateway** em
`src/infrastructure/`. Sem credencial, fora de produção, todo gateway degrada para dry-run
(loga em vez de enviar) — nunca derruba o dev local.

| Serviço | Direção | Obrigatório | Sem credencial | Doc |
| --- | --- | --- | --- | --- |
| Resend (e-mail) | saída | não — chave por clínica + chave opcional da plataforma ([ADR-011](../../adr/011-canal-de-comunicacao-por-clinica.md)) | clínica sem canal não envia; dev: loga o link | [resend.md](resend.md) |
| Google Calendar (OAuth ou service account) | saída | não | agenda funciona sem sync | [google-calendar.md](google-calendar.md) |
| Meta WhatsApp Cloud API | saída | não | job de lembretes em dry-run | [whatsapp-meta.md](whatsapp-meta.md) |
| S3 / R2 / MinIO (fotos) | saída | não | fotos em disco local | [s3-storage.md](s3-storage.md) |
| Cron externo → `POST /api/reminders/run` | **entrada** | não | rota responde 503 | [cron.md](cron.md) |
| Cron externo → `POST /api/retention/run` | **entrada** | sim em produção (LGPD) | rota responde 503 | [retencao.md](retencao.md) |
| Cron externo → `POST /api/alerts/run` (alertas por e-mail ao operador) | **entrada** | sim em produção | rota responde 503; sem destinatário, alerta só no log | [alertas.md](alertas.md) |
| GlitchTip (error tracking self-hosted) | saída | não | no-op | [glitchtip.md](glitchtip.md) |

**Adicionando uma integração:** copie [`docs/templates/integration.md`](../../templates/integration.md),
crie a porta antes do gateway, adicione um fake em `src/infrastructure/persistence/in-memory/` se
houver, e registre as variáveis em [onboarding § 4](../onboarding.md#4-variáveis-de-ambiente) e no `.env.example`.
