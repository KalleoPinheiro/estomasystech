---
title: "Integração: WhatsApp (Meta Cloud API)"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-25
---

# WhatsApp (Meta Cloud API)

## Propósito

**Fora do job de lembretes.** O cron envia por [e-mail](resend.md); o WhatsApp chega ao paciente
pelo botão **Enviar WhatsApp** da recepção (`wa.me`, sem API nem credencial —
[comunicação](../../domains/comunicacao/README.md)). O gateway da Meta segue no código para o
RM-14 (templates *utility*, opt-in por clínica, em Later), que custa por mensagem entregue.

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | não — nenhum fluxo usa hoje |
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

- Telefone normalizado para E.164 Brasil (`55` + DDD + número) quando vier no formato nacional
  (`normalizeBrazilianPhone`, em `src/domain/messaging/whatsapp-link.ts`, também usado no `wa.me`).
- Timeout de 10 s; status fora de `2xx` lança erro.
- **Limitação da Meta:** mensagem de texto livre só chega dentro da janela de 24 h de conversa;
  fora dela a Meta exige template aprovado — hoje o gateway envia só texto.

## Modos de falha

Sem uso no job, os modos de falha só voltam a valer com o RM-14: sem credenciais o gateway nulo
loga `[mensageria desativada] Para …`; falha de API lança.

## Teste local

Nada a testar enquanto o RM-14 não religar o canal; o `wa.me` não precisa de credencial.
