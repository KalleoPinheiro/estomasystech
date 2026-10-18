---
title: "Integração: Resend (e-mail transacional)"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-10
---

# Resend (e-mail transacional)

## Propósito

Entrega os links de **convite** (primeiro acesso, 24 h, uso único) e de **reset de senha** (1 h),
e os **lembretes ao paciente** do [cron](cron.md) — confirmação D-1 e recall de retorno
([comunicação](../../domains/comunicacao/README.md)).
Opcional em produção ([ADR-011](../../adr/011-canal-de-comunicacao-por-clinica.md)): cada clínica
cadastra a própria chave, e a da plataforma (`RESEND_API_KEY`) só atende as contas sem clínica. Sem
ela o bootstrap devolve o link de convite em `inviteUrl`. Domínio: [acesso](../../domains/acesso/README.md).

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | não — por clínica e, opcional, a da plataforma |
| Gateway | `src/infrastructure/email/resend-email-gateway.ts` |
| Porta | `src/application/ports/email-gateway.ts` (`NullEmailGateway` = dry-run) |
| Doc oficial | https://resend.com/docs/api-reference/emails/send-email |

## Credenciais

| Credencial | Obrigatória | Onde obter | Formato |
| --- | --- | --- | --- |
| chave da clínica | por clínica, opcional | a clínica cria a conta no Resend e verifica o domínio dela | `re_…`, gravada cifrada em `clinic_channels` ([ADR-011](../../adr/011-canal-de-comunicacao-por-clinica.md)) |
| `RESEND_API_KEY` | opcional | painel Resend da plataforma → API Keys | `re_…` — só contas sem clínica (Super Admin) |
| `EMAIL_FROM` | com `RESEND_API_KEY` | domínio verificado no Resend | `"VittaFlow <nao-responda@suaclinica.com>"` |

Qual chave sai: o e-mail de uma clínica sai **só** pela chave dela (`clinic_channels`, lida no primeiro
envio do request); sem canal, não sai. O escopo de sistema usa `RESEND_API_KEY`/`EMAIL_FROM`.
Desde a C2 ([#265](https://github.com/KalleoPinheiro/estomasystech/issues/265)), o job de lembretes e o
"esqueci a senha" também saem pelo canal da clínica de cada envio.

Cadastro e rotação: a da plataforma, troque a variável e reinicie o app. A da clínica, o
`company_admin` informa remetente e chave em `/configuracoes` → **Canal de e-mail** (C3,
[#266](https://github.com/KalleoPinheiro/estomasystech/issues/266)), usa **Enviar e-mail de teste** para
conferir chave e domínio (vai para o e-mail dele; o erro do provedor aparece na tela) e salva uma chave
nova por cima para rotacionar. A chave não é lida de volta — a tela mostra só os 4 últimos caracteres.

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
| clínica sem canal | gateway nulo: nada sai, nem pela chave da plataforma | quem chamou (`delivered: false`) |
| chave da clínica não decifra (chave de dados trocada sem `_PREVIOUS`) | gateway nulo e `logError` com o id da clínica, sem a chave | log do servidor |
| sem `RESEND_API_KEY` em produção | canal da plataforma desativado; o app sobe | — |
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
