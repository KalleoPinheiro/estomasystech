---
title: "ADR 008 — Segundo fator TOTP obrigatório para o Super Admin"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-27
---

# ADR 008 — Segundo fator TOTP obrigatório para o Super Admin

- **Data:** 2026-09-27
- **Status:** aceito (decisão do dono do produto na issue [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214))
- **Domínios afetados:** acesso
- **Complementa:** [ADR-007](./007-super-admin-operador-da-plataforma.md) — o operador da plataforma passa a entrar com senha **e** segundo fator; o ADR-007 não muda

## Contexto

O Super Admin controla todas as clínicas (ADR-007): comprometer a conta dele compromete a
plataforma. Até aqui ele entrava só com e-mail e senha (ADR-004), e o e-mail é o mesmo canal do
reset de senha — quem toma a caixa de entrada toma a plataforma. Há um operador (o dono do
produto), técnico, e nada em produção. O repositório já recusou dependência nativa por superfície
de build (`.specs/STATE.md`, decisão sobre fotos). Discovery:
[`.design/portal-super-admin.md`](../../.design/portal-super-admin.md), bloco B2.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — TOTP (RFC 6238) próprio sobre `node:crypto` | Padrão aberto, qualquer app autenticador, sem dependência | Não resiste a phishing em tempo real |
| B — Passkeys/WebAuthn | Resiste a phishing | Biblioteca nova e registro por dispositivo, sem a condição que o justifica (vários operadores, exigência de conformidade) |
| C — Código enviado por e-mail | Nada a instalar | O e-mail é o mesmo canal do reset de senha: não é fator independente |

## Decisão

**Opção A**, obrigatória para `super_admin` e só para ele.

- **TOTP.** `src/domain/auth/totp.ts`: HMAC-SHA-1, 6 dígitos, passo de 30 s, janela de ±1 passo.
  O segredo fica em `user_mfa.totp_secret` cifrado com a chave de dados do
  [ADR-006](./006-chave-de-dados-clinicos.md); `user_mfa.last_used_step` impede que o mesmo código
  entre duas vezes (compare-and-set numa única instrução).
- **Login em duas etapas.** Para o `super_admin`, `POST /api/auth/login` não emite sessão: devolve
  `{ mfaRequired: true, pendingToken }` (fator cadastrado) ou `{ mfaEnrollmentRequired: true,
  pendingToken }` (sem fator). O token pendente é `mfa.<payload>.<hmac>`, HMAC-SHA256 com chave
  derivada do `AUTH_SECRET` e rótulo próprio (um cookie de sessão nunca passa por ele, nem o
  contrário), validade de 5 min, e só vale enquanto a `session_version` da conta for a do token.
  `POST /api/auth/mfa/verify` confere o código e emite a sessão. Nunca existe sessão de
  super_admin sem segundo fator.
- **Cadastro obrigatório.** Sem fator, `POST /api/auth/mfa/enroll` devolve a chave em texto e o
  link `otpauth://` (sem QR code por ora); a chave viaja cifrada no token de confirmação e só vai
  ao banco quando o código dela for confirmado. A confirmação incrementa `session_version` (o
  token de cadastro vira uso único e toda sessão anterior cai) e devolve os códigos de recuperação.
- **Códigos de recuperação.** 10 códigos de uso único (`xxxxx-xxxxx`), guardados como hash scrypt
  em `mfa_recovery_codes`, exibidos uma única vez. Usar um deles **não** abre sessão: leva ao
  recadastro obrigatório do autenticador (decisão do dono, 2026-09-27); o fator antigo vale até o
  novo ser confirmado, e o recadastro troca os 10 códigos.
- **Tentativas.** `POST /api/auth/mfa/verify` aceita 5 chamadas por minuto **por conta** (entre
  tokens e réplicas); a 6ª recebe `429`.

B vence se phishing do operador virar a ameaça principal ou surgir exigência de conformidade. C
perde porque não acrescenta um fator.

## Consequências

**Positivas**

- Senha vazada ou caixa de e-mail tomada não bastam para entrar na plataforma.
- Perder o celular se resolve com um código de recuperação, sem acesso ao servidor.

**Negativas / custos aceitos**

- Phishing em tempo real (página falsa que repassa o código) continua possível.
- Quem tem a senha de um super_admin **sem** fator cadastrado (instalação nova, antes do primeiro
  login) cadastra o próprio autenticador; a janela é o intervalo entre definir a senha e o
  primeiro login.
- Perder o celular **e** os códigos exige a recuperação de emergência no servidor (bloco B3).

**O que esta decisão fecha:** trocar para passkeys exige outro ADR e migrar o fator cadastrado.

## Relacionado

- [ADR-004: Remoção do login Google](./004-remocao-google-oauth-autenticacao.md) — o login por senha continua o único primeiro fator.
- [ADR-005: Revogação de sessão por versão](./005-revogacao-de-sessao-por-versao.md) — a `session_version` também invalida tokens pendentes.
- [ADR-006: Chave de dados](./006-chave-de-dados-clinicos.md) — cifra o segredo TOTP.
- [ADR-007: Super Admin operador da plataforma](./007-super-admin-operador-da-plataforma.md).
- Checklist [`.checks/b2-segundo-fator-super-admin.md`](../../.checks/b2-segundo-fator-super-admin.md), issue [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214).
