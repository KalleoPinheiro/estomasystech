---
title: "ADR 019 — Gestão de contas: senha só pela própria pessoa, trava do último admin e reset de 2FA"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/005-revogacao-de-sessao-por-versao.md, docs/adr/012-segundo-fator-e-senha-da-equipe.md]
---

# ADR 019 — Gestão de contas: senha só pela própria pessoa, trava do último admin e reset de 2FA

- **Data:** 2026-10-17
- **Status:** aceito. Implementa as respostas de @KalleoPinheiro de 2026-10-11 e 2026-10-12 (issue #295, AD-024).
- **Domínios afetados:** acesso

## Contexto

O `PATCH /api/accounts/[id]` deixava quem gere a conta definir a senha de outra pessoa (AD-024). Isso
dá a um administrador uma credencial que não é dele e quebra a atribuição na auditoria: uma ação
feita com a senha trocada parece da pessoa dona da conta. O dono decidiu que o administrador só gera
o link de redefinição (C2, #265), que a pessoa troca a própria senha numa tela "Minha conta" e que
desativar o último admin ativo dá `409`. Em 2026-10-12 acrescentou que o Admin da mesma empresa
remove o segundo fator de quem perdeu o celular, com a ação auditada.

## Decisão

1. **Sem senha pelo PATCH.** O corpo do `PATCH` aceita só `active` (`strict`): `password` ou qualquer
   campo desconhecido responde `400`. Quem esqueceu a senha usa o link (ACE-RN-34/35).
2. **Minha conta** (`/minha-conta`, `/plataforma/minha-conta`; API em `/api/me/**`, família `shared`
   para a equipe). A troca da própria senha exige a senha atual (errada → `400`), aplica a política
   do ACE-RN-41, recusa senha igual à atual, grava a auditoria antes (write-ahead) e incrementa a
   `session_version` (ACE-RN-08). A resposta renova o cookie da sessão que trocou, então só as
   **outras** sessões caem. Tentativas limitadas a 5 por minuto por conta (`429`), porque quem rouba
   uma sessão aberta tentaria adivinhar a senha atual ali.
3. **2º fator opcional ligado em Minha conta.** Atendente e Profissional ligam o autenticador com a
   senha atual e a confirmação do código, reaproveitando o cadastro e a confirmação do login
   (`beginEnrollment` e `verifyMfaCode`, ACE-RN-19; a confirmação é `POST /api/me/mfa/confirm`, que responde `400` e não `401` ao código errado, porque o `401` leva a tela ao login): os 10 códigos de recuperação saem
   uma vez e as outras sessões caem. Desligar sozinho **não** entra: quem quiser sair do segundo
   fator passa pelo Admin (item 5), o que evita que uma sessão roubada o desligue.
4. **Trava do último admin é `409`.** Desativar o último `company_admin` ativo da empresa responde
   `409` (era `400`), dentro da transação com `SELECT ... FOR UPDATE` (#244), no PATCH da clínica e
   na plataforma. Desativar a própria conta segue `400`. De duas desativações cruzadas, uma dá `200`
   e a outra `409`. O Super Admin continua convidando um substituto antes de trocar o admin.
5. **Reset do 2º fator por quem gere a conta.** `POST /api/accounts/[id]/reset-mfa` (família
   `administrative`, só `company_admin`, dentro da matriz do ACE-RN-05 e da própria empresa) e a ação
   `reset-mfa` da plataforma para o `company_admin` (o Super Admin cobre a clínica com um admin só).
   Audita `update/account` com `detail: reset-mfa` antes de mudar, derruba as sessões, apaga fator
   e códigos de recuperação. Conta sem fator ou desativada → `409`; a própria conta → `400` (quem
   perdeu o celular e ainda tem sessão usa os códigos de recuperação).

## Por que não

- **Admin troca a senha de outro "só em emergência".** É o caminho que o item 1 fecha; a emergência
  tem o link de redefinição, que a pessoa consome sem o admin ver a senha.
- **Desligar o 2º fator na própria tela.** Sessão roubada passaria a poder remover a defesa extra;
  sem pedido do dono, o padrão seguro é não oferecer.
- **Admin redefine o próprio fator.** Quem está logado pode usar os códigos de recuperação; permitir
  o reset em si mesmo deixaria um token roubado apagar o segundo fator.

## Consequências

- Depois do reset, `company_admin` cai no cadastro obrigatório do autenticador no próximo login
  (ACE-RN-42); Atendente e Profissional voltam a entrar só com a senha e religam em Minha conta.
- Clientes que mandavam `password` no PATCH (a UI não mandava) passam a receber `400`.
- A tela do Super Admin ganhou a mesma Minha conta, só com a senha (o 2º fator dele é cadastrado no login
  e recuperado por `npm run admin:recover`, ACE-RN-21).

## Relacionado

- Regras: ACE-RN-11, ACE-RN-25, ACE-RN-41, ACE-RN-52 a ACE-RN-54. Decisão de execução: AD-024 no STATE.
- [ADR-005](./005-revogacao-de-sessao-por-versao.md), [ADR-012](./012-segundo-fator-e-senha-da-equipe.md).
