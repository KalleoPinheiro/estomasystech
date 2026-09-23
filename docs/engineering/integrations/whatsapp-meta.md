---
title: "Integração: WhatsApp (Meta Cloud API)"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# WhatsApp (Meta Cloud API)

## Propósito

Canal dos lembretes ao paciente ([comunicação](../../domains/comunicacao/README.md)): confirmação
da consulta de amanhã e recall de retorno vencido. Disparado pelo [cron](cron.md).

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | não — sem credenciais o job roda em dry-run |
| Gateway | `src/infrastructure/messaging/meta-whatsapp-gateway.ts` |
| Porta | `src/application/ports/messaging-gateway.ts` (`NullMessagingGateway` = dry-run) |
| Doc oficial | https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages |

## Credenciais

| Credencial | Obrigatória | Onde obter |
| --- | --- | --- |
| `WHATSAPP_TOKEN` | para enviar | Business Manager → WhatsApp → API Setup (token permanente de system user em produção) |
| `WHATSAPP_PHONE_NUMBER_ID` | para enviar | mesma tela, id do número remetente |

## Contrato

```http
POST https://graph.facebook.com/v20.0/$WHATSAPP_PHONE_NUMBER_ID/messages
Authorization: Bearer $WHATSAPP_TOKEN
Content-Type: application/json

{ "messaging_product": "whatsapp", "to": "55DDDNUMERO", "type": "text", "text": { "body": "…" } }
```

- Telefone normalizado para E.164 Brasil (`55` + DDD + número) quando vier no formato nacional.
- Timeout de 10 s; status fora de `2xx` lança erro.
- **Limitação da Meta:** mensagem de texto livre só chega dentro da janela de 24 h de conversa;
  fora dela a Meta exige template aprovado — hoje o gateway envia só texto.

## Modos de falha

| Situação | Comportamento | Visível para |
| --- | --- | --- |
| sem credenciais | `NullMessagingGateway` loga `[mensageria desativada] Para …`; resumo sai com `channelEnabled: false` | log / resposta do cron |
| falha de API numa mensagem | conta em `failed` no resumo; as demais seguem | resposta do cron |
| mesma mensagem no mesmo dia | não reenvia — um lembrete por (tipo, referência, dia) | — |

## Teste local

```bash
# dry-run
CRON_SECRET=dev npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/reminders/run
```
