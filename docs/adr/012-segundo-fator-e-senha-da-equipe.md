---
title: "ADR 012 — Segundo fator do Admin de Empresa e política de senha da equipe"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
---

# ADR 012 — Segundo fator do Admin de Empresa e política de senha da equipe

- **Data:** 2026-10-11
- **Status:** aceito (decisões do dono do produto na issue [#291](https://github.com/KalleoPinheiro/vitta-flow/issues/291), que respondeu às perguntas abertas da #208, AD-031)
- **Domínios afetados:** acesso
- **Amplia:** [ADR-008](./008-segundo-fator-do-super-admin.md). O mecanismo continua o mesmo: TOTP, login em duas etapas, cadastro obrigatório e códigos de recuperação. Muda só quem precisa dele. O "só para ele" do ADR-008 deixa de valer.

## Contexto

O `company_admin` vê todo o prontuário e todas as contas da própria clínica. Até aqui ele entrava
só com e-mail e senha, e a senha da equipe aceitava 8 caracteres, inclusive `12345678`. Quem
descobrisse a senha de um Admin levava os dados de saúde de uma clínica inteira (LGPD).

## Decisão

1. **Segundo fator por papel** (`mfaPolicy`, `src/domain/auth/mfa.ts`):
   - `super_admin` e `company_admin`: **obrigatório**. Sem fator cadastrado, o login leva ao
     cadastro do autenticador antes de qualquer sessão; com fator, pede o código.
   - `atendente` e `profissional`: **opcional**. O login pede o código só se a conta cadastrou um. O
     cadastro voluntário fica na tela "Minha conta" (#295).
   - `patient` e `partner`: não têm segundo fator.

   O fluxo é o do ADR-008, sem mudança (`/api/auth/mfa/enroll`, `/api/auth/mfa/verify`, token
   pendente de 5 min, 10 códigos de recuperação). Os eventos do Admin de Empresa vão para a
   trilha da clínica dele, como o login. Os do Super Admin continuam na de plataforma.

2. **Política de senha da equipe** (`src/domain/auth/password-policy.ts`): para os 4 papéis de
   equipe vale o mínimo de **10 caracteres** e a recusa das senhas de uma **lista embutida** de
   senhas comuns (`common-passwords.ts`, sem chamada externa). A comparação ignora maiúsculas e os
   espaços nas pontas. A regra vale ao definir a senha (convite e redefinição) e ao trocá-la
   (`PATCH /api/accounts/[id]`). Senha antiga continua valendo até a próxima troca. Paciente e
   parceiro mantêm o mínimo de 8.

3. **Trava por conta** (6 erros = 1 min, #208): fica como está.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — lista embutida | Sem dependência nem rede; dado de senha nunca sai do servidor | Cobre só as senhas mais comuns |
| B — Have I Been Pwned (k-anonimato) | Cobre bilhões de senhas vazadas | Chamada externa a cada definição de senha; o dono recusou |

## Consequências

- A conta de Admin que já existe sem fator cadastra o autenticador no **próximo login**. As
  sessões abertas antes da mudança valem até expirar (12 h, ADR-005). A troca para revogá-las
  na hora está registrada como pergunta aberta na PR.
- A senha recusada pela política não queima o link de convite ou redefinição: o token é lido sem
  ser consumido, a senha é conferida contra o papel da conta, e só então o token é reivindicado.
- O Admin que perde o celular e os códigos de recuperação depende de outro Admin da clínica ou do
  Super Admin para um link de redefinição (ACE-RN-34). O link troca a senha mas **não** apaga o
  fator. Remover o fator de um Admin fica para a gestão de contas (#295).

## Relacionado

- [ADR-005: Revogação de sessão por versão](./005-revogacao-de-sessao-por-versao.md).
- [ADR-008: Segundo fator TOTP do Super Admin](./008-segundo-fator-do-super-admin.md).
- `.specs/STATE.md` AD-031; issues [#208](https://github.com/KalleoPinheiro/vitta-flow/issues/208), [#291](https://github.com/KalleoPinheiro/vitta-flow/issues/291), [#250](https://github.com/KalleoPinheiro/vitta-flow/issues/250) (QR), [#295](https://github.com/KalleoPinheiro/vitta-flow/issues/295) (Minha conta).
