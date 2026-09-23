---
title: "Integração: Google Calendar"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Google Calendar

## Propósito

Espelha as consultas da [agenda](../../domains/agenda/README.md) num calendário Google: agendar
cria o evento, remarcar atualiza, cancelar/falta remove. **É integração, não login**
([ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md)): conectar nunca cria nem troca sessão.

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | não — sem ela a agenda funciona sem sincronizar |
| Gateway | `src/infrastructure/calendar/google-calendar-gateway.ts` (resolvido de forma preguiçosa por `LazyCalendarGateway`) |
| Porta | `src/application/ports/calendar-gateway.ts` (`NullCalendarGateway` quando nada está configurado) |
| Rotas | `GET /api/integrations/google-calendar` (inicia OAuth) · `GET /api/integrations/google-calendar/callback` |
| Doc oficial | https://developers.google.com/calendar/api/v3/reference/events |

## Credenciais

Dois modos; o OAuth tem precedência quando há uma conta conectada.

| Credencial | Modo | Onde obter |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth (recomendado) | Google Cloud Console → Credentials → OAuth client ID (Web). Redirect URI: `{APP_URL}/api/integrations/google-calendar/callback`. Habilite a Google Calendar API |
| `APP_URL` | OAuth | URL pública do app (compõe o redirect) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID` | service account | crie a service account, compartilhe o calendário com ela ("Fazer alterações em eventos"); a chave aceita `\n` escapado |

O refresh token do OAuth fica cifrado (AES-256-GCM, chave derivada de `AUTH_SECRET`) em
`google_accounts`, escopado por clínica.

## Contrato

- Escopo pedido: só `calendar.events`, com `access_type=offline` e `prompt=consent` (garante o refresh token).
- Calendário destino: `primary` da conta conectada; `GOOGLE_CALENDAR_ID` sobrescreve.
- O id do evento é persistido em `appointments.google_event_id`.
- A sincronização roda depois da resposta (`after()`), fora do caminho da requisição.

## Modos de falha

| Situação | Comportamento | Visível para |
| --- | --- | --- |
| OAuth não configurado | `GET /api/integrations/google-calendar` responde `503` | quem tenta conectar |
| nenhuma credencial | `NullCalendarGateway`: nenhuma consulta a `google_accounts`, nenhuma chamada | ninguém |
| Google fora do ar / token revogado | a operação na agenda **não** falha; o evento fica dessincronizado | log |

## Teste local

Preencha `GOOGLE_CLIENT_ID`/`SECRET` e `APP_URL=http://localhost:3000`, entre com uma conta de
equipe e use **Configurações → Google Agenda → Conectar**. O gateway real fica fora da cobertura
de unit test (`vitest.config.mts`); o comportamento da agenda é testado com o gateway nulo/fake.
