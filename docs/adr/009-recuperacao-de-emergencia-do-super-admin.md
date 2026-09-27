---
title: "ADR 009 — Recuperação de emergência do Super Admin por script no servidor"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-27
---

# ADR 009 — Recuperação de emergência do Super Admin por script no servidor

- **Data:** 2026-09-27
- **Status:** aceito (decisão do dono do produto na issue [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214))
- **Domínios afetados:** acesso
- **Emenda:** [ADR-004](./004-remocao-google-oauth-autenticacao.md) — a recuperação do Super Admin passa a ser um script, não "intervenção direta no banco"; [ADR-005](./005-revogacao-de-sessao-por-versao.md) — a sessão sem empresa é conferida contra a conta de sistema pelo papel. O resto dos dois continua valendo

## Contexto

O ADR-004 aceitou que, se o Super Admin perdesse o acesso, a recuperação "exige intervenção direta
no banco". Com o segundo fator obrigatório ([ADR-008](./008-segundo-fator-do-super-admin.md)),
perder o autenticador **e** os códigos de recuperação — ou a senha e a caixa de e-mail — deixaria o
operador único da plataforma ([ADR-007](./007-super-admin-operador-da-plataforma.md)) do lado de
fora, e o caminho de volta seria SQL escrito à mão em produção, sobre as tabelas de
autenticação. Discovery: [`.design/portal-super-admin.md`](../../.design/portal-super-admin.md),
bloco B3 (Journey 12).

A revogação de sessão do ADR-005 procura a conta pelo e-mail do cookie e, sem conta, deixa a sessão
valer (lista negra). Trocar o e-mail do Super Admin na recuperação faria o cookie antigo — o de
quem tomou a conta — não achar conta e seguir válido até expirar (12 h).

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Script no servidor (`npm run admin:recover`) com `DATABASE_URL` | Nenhuma porta nova; quem tem o banco já tem tudo | Exige acesso ao servidor ou à conexão do banco |
| B — Rota de recuperação protegida por segredo de deploy | Não exige shell | Mais uma porta pública no login da conta mais crítica |
| C — Manter "intervenção direta no banco" | Nada a construir | SQL à mão em produção, sem auditoria nem validação |

## Decisão

**Opção A.** `scripts/recover-super-admin.ts`
(`npm run admin:recover -- [--novo-email=<e-mail>] [--confirmar]`, com `DATABASE_URL` e `APP_URL`).
Roteiro em [`producao.md` § 10](../engineering/producao.md).

- **Simula por padrão.** Sem `--confirmar` mostra a conta, o e-mail novo e o que fará, sem gravar.
- **Uma transação, conta travada.** Remove o segundo fator e os códigos de recuperação, invalida a
  senha (`UNSET_PASSWORD_HASH`: quem tem a senha vazada não encontra a conta sem fator para
  cadastrar o próprio autenticador), reativa a conta se desativada, troca o e-mail se pedido,
  incrementa `session_version`, invalida convites e resets pendentes, emite um link `reset` e grava
  a auditoria. Falha em qualquer passo desfaz tudo.
- **Link só no terminal, 1 hora.** O operador usa na hora; o convite de 24 h só aumentaria o tempo
  em que um link impresso em histórico vale. Não vai por e-mail — o e-mail pode ser o que se perdeu.
- **E-mail novo** usado por qualquer outra conta é recusado (a identidade da plataforma não divide
  e-mail com conta de clínica). Sem Super Admin, o caminho é o bootstrap.
- **Saída:** `0` aplicado ou simulado; `2` comando ou pré-condição, nada gravado; `1` falha
  inesperada, transação desfeita.
- **Auditoria** pelo mesmo caminho do login (ator `super_admin`/`script:recover-super-admin`,
  `resourceType: 'account-recovery'`, sem empresa): hoje cai na clínica legada, como os eventos de
  login e segundo fator; vira evento de plataforma quando a trilha de plataforma (bloco B6) existir
  (decisão do dono, 2026-09-27).
- **Sessão de sistema pelo papel.** Sessão sem empresa é conferida contra a conta de sistema
  (`role = 'super_admin' AND clinic_id IS NULL`), não pelo e-mail: e-mail do cookie diferente do
  da conta revoga. Sem conta de sistema, a lista negra do ADR-005 vale. Sessões de clínica não
  mudam.

B perde porque abre uma porta pública para contornar exatamente o login que o ADR-008 endureceu. C
perde porque é SQL à mão, sem validação nem trilha.

## Consequências

**Positivas**

- Perder tudo tem um procedimento testado, auditado e atômico, sem porta pública nova.
- A sessão de quem tomou a conta cai em até 60 s, mesmo com o e-mail trocado.

**Negativas / custos aceitos**

- Recuperar exige `DATABASE_URL` de produção e um checkout do repositório.
- O link aparece no terminal; histórico de shell ou log de CI que o capture expõe-o por até 1 hora.
- Até o B6, o evento da recuperação aparece na auditoria da primeira clínica.
- Cookie de sistema forjado para teste precisa ser do e-mail da conta de sistema; o E2E passou a
  usar a sessão real do Super Admin.

**O que esta decisão fecha:** qualquer caminho de recuperação que não passe pelo servidor exige um
ADR novo, com a opção B como ponto de partida.

## Relacionado

- [ADR-004](./004-remocao-google-oauth-autenticacao.md) — emendado: recuperação por script.
- [ADR-005](./005-revogacao-de-sessao-por-versao.md) — emendado: sessão de sistema pelo papel.
- [ADR-008](./008-segundo-fator-do-super-admin.md) — perder o celular continua resolvido com código de recuperação.
- Checklist [`.checks/b3-recuperacao-super-admin.md`](../../.checks/b3-recuperacao-super-admin.md), issue [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214).
