---
title: "Integração: Resend (e-mail transacional)"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
---

# Resend (e-mail transacional)

## Propósito

Entrega os links de **convite** (primeiro acesso, 24 h, uso único) e de **reset de senha** (1 h),
e os **lembretes ao paciente** do [cron](cron.md) — confirmação D-1 e recall de retorno
([comunicação](../../domains/comunicacao/README.md)).
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
| sem credenciais fora de produção | `NullEmailGateway`: loga destinatário mascarado (`fu***@x.com`) e assunto; do corpo, só o link `/definir-senha` — nunca o texto (CWE-532). Com `NODE_ENV=production` nem o link sai | log do servidor |
| API fora do ar / timeout / 4xx-5xx | a chamada lança; o bootstrap devolve `delivered: false` e `inviteUrl` | quem chamou a rota |
| falha num lembrete (inclui e-mail recusado) | conta em `failed` no resumo da empresa, sem `reminder_log`; o lote segue e a próxima rodada tenta de novo | resposta do cron |
| teto do plano grátis (100/dia, 3.000/mês) | os envios acima do teto voltam erro e contam `failed`, sem alarme | resposta do cron / painel Resend |

## Teste local

```bash
# dry-run: deixe RESEND_API_KEY vazio e procure o link de senha no log (só fora de produção)
npm run dev
# envio real com a conta de teste do Resend
RESEND_API_KEY=re_... EMAIL_FROM="Teste <onboarding@resend.dev>" npm run dev
```

A suíte (`vitest.config.mts`) força `RESEND_API_KEY=""` para sempre exercitar o gateway nulo.
