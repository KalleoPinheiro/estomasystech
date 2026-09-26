---
title: "ADR 005 — Revogação de sessão por versão da conta"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
---

# ADR 005 — Revogação de sessão por versão da conta

- **Data:** 2026-09-26
- **Status:** aceito (decisão do dono do produto na issue [#194](https://github.com/KalleoPinheiro/vitta-flow/issues/194))
- **Domínios afetados:** acesso, portal

## Contexto

A sessão é um token HMAC stateless de 12 h (`src/lib/auth/session.ts`). Até aqui a única
revogação era a deny-list de conta **staff** inativa (AD-001, cache de 60 s no proxy). Logout só
apagava o cookie do navegador; reset e troca de senha não derrubavam sessões já emitidas; contas
de portal (`patient`/`partner`) desativadas seguiam válidas; o cache era chaveado só pelo e-mail,
e o mesmo e-mail pode existir em duas empresas (MT-06). Para dado de saúde, uma conta comprometida
precisa perder o acesso quando a senha é trocada.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — `user_accounts.session_version` + claim `sv` no token | reaproveita a consulta que o proxy já faz a cada 60 s: custo marginal zero | revoga todas as sessões da conta de uma vez (não uma só) |
| B — `sessions_valid_after timestamptz` | mesma consulta | depende de relógio entre réplicas; dois eventos no mesmo ms se confundem |
| C — tabela de sessões server-side | revogação imediata e por sessão | consulta ao banco em toda requisição; tabela nova com ciclo de vida próprio |

## Decisão

**Opção A.** Coluna `user_accounts.session_version integer NOT NULL DEFAULT 0` (migração `0039`);
o login grava a versão vigente no claim `sv`; token sem `sv` vale como 0. O proxy (camada 1)
revoga quando a conta **existe** e está inativa ou com `session_version ≠ sv`, para todos os
papéis. Sem renovação deslizante: a sessão continua expirando 12 h após o login.

- **Quem incrementa:** logout (`POST /api/auth/logout`), definição/reset de senha pelo link
  (`updatePasswordHash`), troca de senha e desativação pelo admin (`PATCH /api/accounts/:id`).
- **Só incremento atômico:** `UserAccountRepository.revokeSessions(id)` faz
  `SET session_version = session_version + 1`; `save` nunca grava a coluna. Um bump no domínio
  seguido de `save` deixaria dois eventos concorrentes gravarem o mesmo número — e um token
  emitido entre eles sobreviveria à troca de senha.
- **Cache:** `{ isActive, sessionVersion }` por `${clinicId ?? 'system'}|${subject}` por 60 s; o
  processo que incrementa apaga a própria entrada (`forgetSessionStatus`), as demais instâncias
  revogam quando o cache delas expira.
- **Mudança de papel/profissional:** não há hoje caminho no código que altere `role` ou
  `professionalId` de uma conta. Qualquer mutador futuro **deve** chamar `revokeSessions`.

Opção B perde por depender do relógio; C, pelo custo por requisição, que o dono descartou.

## Consequências

**Positivas**

- Logout, reset e troca de senha invalidam cookies copiados ou roubados em até 60 s.
- Conta de portal desativada perde o acesso como a de equipe.
- Mesmo e-mail em duas empresas não contamina a revogação da outra.

**Negativas / custos aceitos**

- Logout em um aparelho encerra a sessão em todos os aparelhos da conta.
- Janela de até 60 s em outras instâncias (cache). Falha do banco na checagem segue fail-open
  com log (AD-004).
- A camada 2 (`requireStaffSession`) continua sem checar revogação (limitação de ADR-002):
  síncrona, consumida por ~75 handlers.
- Subject sem conta (sessões forjadas da suíte E2E) segue válido — semântica de deny-list.
