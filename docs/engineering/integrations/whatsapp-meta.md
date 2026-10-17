---
title: "Integração: WhatsApp (Meta Cloud API) — planejada"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
---

# WhatsApp (Meta Cloud API) — planejada, sem código

## Propósito

**Não há código nem variável de ambiente desta integração.** O gateway da Meta
(`MetaWhatsAppGateway`), a porta `MessagingGateway` e as variáveis `WHATSAPP_TOKEN` e
`WHATSAPP_PHONE_NUMBER_ID` foram removidos na #328: nenhum caso de uso os consumia e o container
montava um gateway a cada requisição sem necessidade. Remover custou menos que manter; religar
quando o RM-14 for priorizado é aditivo.

O cron envia por [e-mail](resend.md); o WhatsApp chega ao paciente pelo botão **Enviar WhatsApp**
da recepção (`wa.me`, sem API nem credencial — [comunicação](../../domains/comunicacao/README.md)).

| Campo | Valor |
| --- | --- |
| Status | planejada — RM-14 (*Later*), em [`docs/plano-evolucao-faseado.md`](../../plano-evolucao-faseado.md) |
| Especificação | [`.specs/features/lembretes-whatsapp-templates-cadencia/`](../../../.specs/features/lembretes-whatsapp-templates-cadencia/spec.md) |
| Obrigatória? | não |
| Doc oficial | https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages |

## Credenciais

Nenhuma hoje. No RM-14 serão **por clínica** (token de system user e id do número remetente),
nunca variáveis globais de ambiente.

## Contrato

Referência para quem religar o RM-14:

- Templates *utility* aprovados pela Meta, opt-in por clínica, com custo por mensagem entregue.
- `POST https://graph.facebook.com/<versão>/<phone-number-id>/messages` com `Authorization: Bearer`,
  timeout curto e erro em status fora de `2xx`.
- Telefone em E.164 Brasil: reaproveitar `normalizeBrazilianPhone`
  (`src/domain/messaging/whatsapp-link.ts`, já usado pelo `wa.me`).
- **Limitação da Meta:** texto livre só chega dentro da janela de 24 h de conversa; fora dela,
  só template aprovado.

## Modos de falha

Sem código, não há modo de falha hoje. Ao religar: dry-run sem credencial deve logar só metadados
(telefone mascarado, nunca o corpo — CWE-532) e falha de API deve lançar.

## Teste local

Nada a testar: o `wa.me` não precisa de credencial e o RM-14 ainda não tem implementação.
