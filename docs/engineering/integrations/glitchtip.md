---
title: "Integração: GlitchTip (error tracking)"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
---

# GlitchTip (error tracking self-hosted)

> **Desligado em produção (2026-10-18).** O app roda como Dockerfile no Coolify, sem o
> `docker-compose.glitchtip.yml`; sem `GLITCHTIP_DSN` o app funciona igual. Ligar exige subir o
> GlitchTip à parte (runbook § 9.5).

## Propósito

Todo erro inesperado que passa por `logError` (e todo erro não tratado que o Next entrega ao
`onRequestError`) vira um evento no GlitchTip da própria VPS, com o `requestId` para achar as
linhas do mesmo request no log. Decisão do dono na [#212](https://github.com/KalleoPinheiro/estomasystech/issues/212);
desenho em [ADR-014](../../adr/014-observabilidade-sem-pii.md).

| Campo | Valor |
| --- | --- |
| Direção | saída (app → GlitchTip, rede interna do compose). A interface só abre por túnel SSH (`127.0.0.1:8000`), sem porta pública |
| Obrigatória? | não — sem DSN, no-op |
| Código | `src/lib/observability/error-tracker.ts` (SDK `@sentry/core`, sem integrações) |
| Servidor | [`docker-compose.glitchtip.yml`](../../../docker-compose.glitchtip.yml), imagem `glitchtip/glitchtip:v6`, modo `all_in_one` |

## Credenciais

| Credencial | Onde | Nota |
| --- | --- | --- |
| `GLITCHTIP_DSN` | app | `http://<chave>@glitchtip:8000/<projeto>` (copiado do projeto no GlitchTip, trocando o host pelo nome do serviço) |
| `APP_RELEASE` | app | opcional; a versão em cada evento (ex. o commit do deploy) |
| `GLITCHTIP_DB_PASSWORD` | compose | `openssl rand -hex 24`; Postgres próprio do GlitchTip, separado do banco clínico |
| `GLITCHTIP_SECRET_KEY` | compose | `openssl rand -hex 32` |
| `GLITCHTIP_DOMAIN` | compose | URL que o operador usa; padrão `http://localhost:8000` (túnel SSH) |
| `GLITCHTIP_MAX_EVENT_LIFE_DAYS` | compose | retenção dos eventos; **30 dias** (decidido, [runbook](../producao.md) § 1) |
| `GLITCHTIP_EMAIL_URL` | compose | SMTP do GlitchTip para os avisos dele; padrão `consolemail://` (não envia) |

## O que sai do processo

Lista do que **pode** sair (`buildEvent`), não do que não pode:

| Campo do evento | Conteúdo |
| --- | --- |
| `message` | o contexto do `logError` (ids, nunca nome/e-mail) |
| `exception` | tipo, mensagem já limpa (sem SQL e parâmetros, #202; e-mail e número de 8+ dígitos viram `[e-mail]`/`[número]`) e os frames do stack (sem a linha da mensagem) |
| `tags` | `requestId`, `code` (SQLSTATE ou código do Node), `table` |
| `environment`, `release`, `platform`, `sdk` | metadados do processo |

Nunca: `request` (URL, cabeçalhos, cookies, corpo), `user`, `breadcrumbs`, `extra`, `contexts`,
`server_name`. O `beforeSend` (`scrubEvent`) apaga esses campos e limpa o texto de novo, se
alguma versão do SDK os preencher. O erro do navegador **não é capturado por ora** (decisão do dono, [#313](https://github.com/KalleoPinheiro/estomasystech/issues/313)).

## Modos de falha

| Situação | Efeito |
| --- | --- |
| `GLITCHTIP_DSN` vazio | nada sai; log normal |
| DSN malformado | no-op, sem derrubar o app |
| GlitchTip fora do ar ou lento | o envio falha em até 5 s, fora da requisição; o log JSON continua sendo a fonte |

## Teste local

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.glitchtip.yml \
  GLITCHTIP_DB_PASSWORD=dev GLITCHTIP_SECRET_KEY=dev-dev-dev docker compose up -d glitchtip
docker compose exec glitchtip ./manage.py createsuperuser
```

Abra `http://localhost:8000`, crie organização e projeto (plataforma Node), copie o DSN e rode o
app com `GLITCHTIP_DSN=http://<chave>@localhost:8000/<projeto>`.
