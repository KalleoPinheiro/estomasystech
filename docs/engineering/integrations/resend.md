---
title: "Integração: Resend (e-mail transacional)"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Resend (e-mail transacional)

## Propósito

Entrega os links de **convite** (primeiro acesso, 24 h, uso único) e de **reset de senha** (1 h).
Sem e-mail ninguém faz o primeiro acesso — por isso é a única integração obrigatória em produção
([ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md)). Domínio: [acesso](../../domains/acesso/README.md).

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | sim em produção |
| Gateway | `src/infrastructure/email/resend-email-gateway.ts` |
| Porta | `src/application/ports/email-gateway.ts` (`NullEmailGateway` = dry-run) |
| Doc oficial | https://resend.com/docs/api-reference/emails/send-email |

## Credenciais

| Credencial | Obrigatória | Onde obter | Formato |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | produção | painel Resend → API Keys | `re_…` |
| `EMAIL_FROM` | produção | domínio verificado no Resend | `"VittaFlow <nao-responda@suaclinica.com>"` |

Rotação: troque a variável e reinicie o app — a chave é lida na construção do gateway.

## Contrato

```http
POST https://api.resend.com/emails
Authorization: Bearer $RESEND_API_KEY
Content-Type: application/json

{ "from": "$EMAIL_FROM", "to": ["<destinatário>"], "subject": "…", "text": "…" }
```

Timeout de 10 s. Qualquer status fora de `2xx` vira erro com os primeiros 300 caracteres do corpo.

## Modos de falha

| Situação | Comportamento | Visível para |
| --- | --- | --- |
| sem credenciais em produção | a construção do gateway lança erro explícito — o app não sobe | log de boot |
| sem credenciais fora de produção | `NullEmailGateway`: loga o link (`[e-mail desativado] …`) | log do servidor |
| API fora do ar / timeout / 4xx-5xx | a chamada lança; o bootstrap devolve `delivered: false` e `inviteUrl` | quem chamou a rota |

## Teste local

```bash
# dry-run: deixe RESEND_API_KEY vazio e procure o link no log
npm run dev
# envio real com a conta de teste do Resend
RESEND_API_KEY=re_... EMAIL_FROM="Teste <onboarding@resend.dev>" npm run dev
```

A suíte (`vitest.config.mts`) força `RESEND_API_KEY=""` para sempre exercitar o gateway nulo.
