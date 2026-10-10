---
title: "ADR 011 — Canal de comunicação por clínica"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-10
---

# ADR 011 — Canal de comunicação por clínica

- **Data:** 2026-10-10
- **Status:** aceito (decisão do dono do produto na discovery [`.design/canal-por-clinica.md`](../../.design/canal-por-clinica.md); issue [#264](https://github.com/KalleoPinheiro/vitta-flow/issues/264))
- **Domínios afetados:** comunicação, acesso
- **Emenda:** [ADR-004](./004-remocao-google-oauth-autenticacao.md) — o provedor de e-mail transacional deixa de ser obrigatório em produção

## Contexto

Todo e-mail de todas as clínicas saía de uma conta Resend única do operador (`RESEND_API_KEY`),
obrigatória em produção (o boot falhava sem ela). O operador pagava o tráfego de todas as clínicas, o
remetente nunca era o da clínica, e o plano grátis (100 envios/dia) estoura entre a 3ª e a 4ª
clínica. O dono do produto decidiu que a plataforma é agnóstica: cada clínica traz a própria chave e
responde pelo próprio custo.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — canal por clínica, sem fallback | custo e remetente da clínica; nenhuma clínica gasta a conta da plataforma | clínica sem canal não envia nada, nem convite nem redefinição |
| B — canal por clínica com fallback para a plataforma | ninguém fica sem e-mail | o operador volta a pagar o tráfego de quem não configurou |
| C — conta única Pro e repasse do custo | zero trabalho de configuração para a clínica | contraria a decisão de plataforma agnóstica |

## Decisão

**A.** Tabela `clinic_channels` (uma linha por `(clinic_id, channel)`; hoje só `channel = 'email'`,
`provider = 'resend'`), com a chave cifrada pela chave de dados ([ADR-006](./006-chave-de-dados-clinicos.md))
e só os 4 últimos caracteres em claro. O `EmailGateway` dos serviços é resolvido pelo escopo:

- escopo de clínica → canal da clínica, lido no primeiro uso (`LazyEmailGateway`); sem canal, ou com
  a chave que não decifra, o gateway é o nulo — **nunca** o da plataforma;
- escopo de sistema (contas sem clínica: o Super Admin) → `RESEND_API_KEY`/`EMAIL_FROM`, agora
  **opcionais**; sem elas, o gateway é o nulo, também em produção.

A porta `EmailGateway` troca `enabled` por `isEnabled(): Promise<boolean>`, porque saber se o canal
existe exige ler o banco. Um provedor novo entra em `EMAIL_PROVIDERS` e em `EMAIL_PROVIDER_GATEWAYS`.

## Consequências

**Positivas**

- A clínica é dona da conta, do remetente e do custo do provedor.
- Nenhuma credencial de uma clínica é usada por outra: não há cache de gateway entre requests.

**Negativas / custos aceitos**

- Clínica sem canal fica sem e-mail. O convite do 1º admin passa a ser link manual e a redefinição
  passa a ser gerada pelo admin (bloco C2, [#265](https://github.com/KalleoPinheiro/vitta-flow/issues/265)).
- Uma consulta a `clinic_channels` no primeiro envio de cada request que envia e-mail.
- Trocar a chave de dados sem `DATA_ENCRYPTION_KEY_PREVIOUS` desliga o e-mail das clínicas até a
  chave ser recadastrada (o log nomeia a clínica).

## Relacionado

- [ADR-004](./004-remocao-google-oauth-autenticacao.md) — convite e redefinição por e-mail.
- [ADR-006](./006-chave-de-dados-clinicos.md) — chave de dados que cifra a credencial.
- [ADR-007](./007-super-admin-operador-da-plataforma.md) — o Super Admin vê o status do canal, nunca a chave.
