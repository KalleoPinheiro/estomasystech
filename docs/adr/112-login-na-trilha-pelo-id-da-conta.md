---
title: "ADR 112 — Login na trilha de auditoria pelo id da conta"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-17
related:
  - docs/adr/010-trilha-de-auditoria-de-plataforma.md
  - docs/adr/111-email-de-login-cifrado-com-indice-cego-global.md
---

# ADR 112 — Login na trilha de auditoria pelo id da conta

- **Data:** 2026-11-17
- **Status:** aceito (decisão do dono em 2026-11-17, issue #887)
- **Domínios afetados:** acesso

## Contexto

O [ADR-111](./111-email-de-login-cifrado-com-indice-cego-global.md) cifra `user_accounts.email`. O login
continuava gravando o e-mail em claro em `audit_events.resource_id` e em `actor_id` (`action = 'read'`,
`resource_type = 'session'`): sucesso usava o e-mail da conta; falha usava o que a pessoa digitou, exista
conta ou não. Um dump da trilha revelava esses endereços. O cookie de sessão segue com o e-mail no `subject`
(ADR-111); esta decisão não mexe nele.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Id da conta | Já existe, não é o e-mail, liga o evento à conta quando ela foi identificada | Tentativa sem conta não tem id |
| B — Hash cego (`login-email`) | Dá para correlacionar o e-mail digitado sem gravá-lo | É outro identificador, e o pepper o torna reversível para quem o tem |
| C — E-mail cifrado | O valor continua recuperável com a chave | A cifra não é determinística; cada tentativa grava um blob diferente |
| D — Claro com retenção curta | A trilha continua legível | O dump no prazo ainda revela o e-mail; o prazo seria outra decisão |

## Decisão

**Opção A.** No login, `resource_id` e `actor_id` recebem o id da conta. Quando a tentativa não identifica
uma conta — e-mail desconhecido, senha errada ou a mesma senha em mais de uma empresa — os dois ficam vazios
(`''`). Não se grava o e-mail e não se inventa outro identificador. Clínica suspensa com senha provada
identifica a conta: grava o id dela, na clínica. O segundo fator do mesmo login usa o mesmo id. Eventos já
gravados ficam como estão. Logout e definir senha não entram nesta decisão.

B, C e D ficam de fora porque o dono escolheu o id da conta e, na ausência dele, o vazio.

## Consequências

- Dump novo do login não traz o e-mail. A tentativa sem conta não dá para ligar a um endereço pela trilha.
- A coluna continua `NOT NULL`: vazio é `''`, não `NULL`.
- O `subject` do cookie de sessão continua sendo o e-mail.

## Relacionado

- [ADR-010](./010-trilha-de-auditoria-de-plataforma.md) — login com falha segue evento de plataforma.
- [ADR-111](./111-email-de-login-cifrado-com-indice-cego-global.md) — e-mail da conta cifrado; o `subject` do cookie fica de fora.
- [ACE-RN-73](../domains/acesso/README.md).
