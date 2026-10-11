# Política de senha da equipe e 2FA obrigatório para o Admin de Empresa (#291)

## Problem Statement

Decisões de @KalleoPinheiro (2026-10-11) sobre as perguntas abertas da #208 (AD-031). Até aqui a
senha da equipe aceitava 8 caracteres, inclusive `12345678`. O `company_admin`, que vê todo o
prontuário e todas as contas da clínica, entrava sem segundo fator.

## Goals

- [x] Senha da equipe: mínimo de 10 caracteres e recusa das senhas de uma lista embutida, sem
      chamada externa. Vale ao definir (convite/redefinição) e ao trocar. A senha antiga continua
      valendo até a próxima troca.
- [x] 2FA (TOTP) obrigatório para `company_admin`, reaproveitando o fluxo do super_admin
      (ADR-008, ACE-RN-18 a ACE-RN-20) com códigos de recuperação.
- [x] Atendente e Profissional: 2FA opcional. O login pede o código só se a conta cadastrou um.
- [x] Trava por conta (6 erros = 1 min): fica como está.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Tela "Minha conta" para Atendente/Profissional ligarem o 2FA | É a #295. Aqui só o login respeita o fator, quando ele existe |
| QR code no cadastro do autenticador | É a #250. Segue chave em texto e link `otpauth://` |
| Política para paciente e parceiro | A issue fala da "senha da equipe". O portal mantém o mínimo de 8 (pergunta aberta 3) |
| Lista de senhas vazadas externa (HIBP) | Recusada pelo dono: só lista embutida |
| Remover o fator de um Admin que perdeu tudo | Gestão de contas (#295); hoje só o Super Admin tem recuperação no servidor (ADR-009) |

## Acceptance Criteria (EARS)

| ID | Critério | Prova |
| --- | --- | --- |
| R1 | WHEN uma conta da equipe define senha pelo link com 9 caracteres, THEN a API responde 400 "A senha precisa ter ao menos 10 caracteres" AND o link continua usável | `tests/application/auth-token-flow.test.ts` |
| R2 | WHEN a senha está na lista (ignorando maiúsculas e espaços nas pontas), THEN 400 "Essa senha é muito comum e fácil de adivinhar. Escolha outra." AND o link continua usável | idem, `tests/domain/password-policy.test.ts` |
| R3 | WHEN a senha tem 10 caracteres e não está na lista, THEN é gravada | idem |
| R4 | WHEN o Admin troca a senha de uma conta da equipe (`PATCH /api/accounts/[id]`) fora da política, THEN 400, sem auditoria e sem troca | `tests/api/accounts-hierarchy.test.ts` (C-291) |
| R5 | WHILE a conta é paciente ou parceiro, a regra continua 8 caracteres, sem lista | `tests/domain/password-policy.test.ts`, `tests/api/accounts-hierarchy.test.ts` |
| R6 | WHEN um `company_admin` sem fator acerta a senha, THEN recebe `mfaEnrollmentRequired` e nenhuma sessão. Ao confirmar o código, recebe os 10 códigos e a sessão da própria clínica | `tests/api/mfa-login-por-papel.test.ts`, `e2e/plataforma-suspensao.spec.ts` |
| R7 | WHEN um `company_admin` com fator acerta a senha, THEN recebe `mfaRequired`, e só o código emite a sessão | `tests/api/mfa-login-por-papel.test.ts`, `e2e/sessao-expirada.spec.ts` |
| R8 | WHEN Atendente/Profissional sem fator acerta a senha, THEN sessão direta. WITH fator, THEN pede o código | `tests/api/mfa-login-por-papel.test.ts` |
| R9 | IF um token pendente aponta para conta de portal, THEN 401 de verificação expirada | idem |

## Decisões de execução

| Decisão | Padrão escolhido | Motivo |
| --- | --- | --- |
| Validar antes de queimar o link | `findUsableBySecretHash` (leitura) → política do papel → `claimBySecretHash` (atômico) | Uma senha recusada não pode inutilizar o convite. O uso único continua no `UPDATE … RETURNING` |
| Admin que já existe sem fator | Cadastro no próximo login. As sessões abertas valem até expirar (12 h) | É o texto da issue ("no próximo login"). Revogar na hora é a pergunta aberta 1 |
| Destino depois do 2FA | `?next=` ou `/`, e o proxy leva o super_admin de `/` à plataforma | A tela não sabe o papel. O mesmo vale para o login sem 2FA |
| Trilha dos eventos de 2FA do Admin | Clínica dele (o `actorOverride` leva a clínica da conta) | Igual ao login da equipe. O Super Admin continua na trilha de plataforma (ACE-RN-31) |
| Sem migração | `user_mfa`/`mfa_recovery_codes` já são por conta, sem restrição de papel | — |

## Perguntas abertas para @KalleoPinheiro

1. **Admins logados agora.** Hoje a sessão aberta antes do deploy vale até expirar (até 12 h), e o
   cadastro do 2FA acontece no próximo login. A opção mais conservadora é revogar na hora as
   sessões dos `company_admin` sem fator (incrementar `session_version` numa migração). Não foi
   feito porque a issue diz "no próximo login".
2. **Admin que perde o celular e os códigos.** O link de redefinição troca a senha, mas não apaga o
   fator, e o Admin fica sem entrar. Hoje só o Super Admin tem recuperação no servidor (ADR-009).
   Sugestão conservadora: um botão "remover segundo fator" para o Super Admin ou outro Admin, com
   auditoria, na gestão de contas (#295).
3. **Portal.** Paciente e parceiro seguem com mínimo de 8 e sem lista. A opção mais conservadora é
   estender a lista ao portal.
