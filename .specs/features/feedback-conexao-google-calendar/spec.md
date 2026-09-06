# Feedback visual da conexão Google Agenda — Specification

Issue: #124

## Problem Statement

O fluxo OAuth de conexão do Google Agenda redireciona no sucesso pra
`/configuracoes?calendar=conectado`, mas ninguém lê esse parâmetro. No erro,
o callback devolve JSON cru — o navegador sai do app inteiro pra ver uma
página de erro sem estilo. A única forma de confirmar que a conexão
funcionou hoje é consultar `google_accounts` direto no banco.

## Goals

- [ ] Sucesso da conexão mostra feedback visível (toast) na volta do OAuth.
- [ ] Falha da conexão mostra mensagem visível dentro do app, nunca JSON cru
      fora dele.
- [ ] A seção de configurações mostra o status real da conexão (conectado —
      com qual conta e desde quando — ou não conectado), buscado via rota
      dedicada.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Botão de desconectar/revogar | Explicitamente fora de escopo na issue |
| Barrar múltiplas contas conectadas por clínica | Repositório já resolve por "mais recente" (issue #74); não pedido aqui |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde ler o status de conexão | Nova rota `GET /api/settings/calendar-integration` (`requireStaffSession` + `googleAccounts.findMostRecent()`), consumida via `useApiQuery` | Mesmo padrão testável já usado por toda a página de configurações e pela #126 | y |
| Como sinalizar sucesso/erro do redirect do OAuth | `useToast` (não `ErrorAlert` persistente) pros dois casos | Página já usa esse padrão pra toda mutação (`ClinicInfoSection`, `AccountsSection`); status de conexão em si (linha "conectado como X") já é permanente e não precisa de alerta fixo | y |
| Mensagens de erro do redirect | Allowlist fixa por código (`reason=nao_configurado\|fluxo_invalido\|sem_credencial\|falha_conexao`), nunca texto bruto da URL | Mesmo padrão de `LOGIN_ERROR_MESSAGES` em `src/app/login/page.tsx` — texto arbitrário de `?reason=` refletido na tela é vetor de phishing por texto refletido, mesmo com o React escapando | y |
| Callback do OAuth quando a guarda de sessão (`requireStaffSession`) falha (401) | Mantém JSON (não vira redirect) | Fora do escopo da issue — só os `fail()` específicos do fluxo OAuth (config ausente, state inválido, sem refresh token, falha na troca) viram redirect; a guarda de sessão é a mesma usada em toda rota do app e seu contrato de 401 não muda | y |

**Open questions:** nenhuma — todas resolvidas acima.

---

## User Stories

### P1: Ver e confiar no status da conexão do Google Agenda ⭐ MVP

**User Story**: Como Admin de Empresa, quero ver se a conexão do Google
Agenda da minha clínica está ativa (e receber feedback claro ao conectar ou
falhar), pra não precisar consultar o banco pra saber se funcionou.

**Why P1**: É o achado inteiro da issue.

**Acceptance Criteria**:

1. WHEN a clínica tem uma conta do Google conectada THEN a seção de
   Google Agenda em Configurações SHALL mostrar o e-mail e a data da conexão
   mais recente (`googleAccounts.findMostRecent()`).
2. WHEN a clínica não tem conta conectada THEN a seção SHALL indicar
   claramente "nenhuma conta conectada" (nunca um estado ambíguo/em branco).
3. WHEN o navegador retorna do OAuth com `?calendar=conectado` THEN a página
   SHALL mostrar um toast de sucesso.
4. WHEN o callback do OAuth falha por config ausente, state inválido, Google
   não devolver refresh token, ou falha na troca do código THEN o callback
   SHALL redirecionar para `/configuracoes?calendar=erro&reason=<code>` (nunca
   retornar JSON cru pro navegador) e a página SHALL mostrar um toast de erro
   com mensagem da allowlist correspondente ao `reason`.
5. WHEN `reason` não está na allowlist conhecida THEN a página SHALL mostrar
   uma mensagem de erro genérica (nunca o valor bruto do parâmetro).

**Independent Test**: conectar uma conta do Google como Admin de Empresa,
ver toast de sucesso + linha "conectado como <email> em <data>"; forçar um
erro (ex. revogar credencial e reconectar sem devolver refresh token), ver
toast de erro com mensagem legível e a página de configurações intacta (sem
navegar pra JSON cru).

---

## Edge Cases

- WHEN a sessão é `super_admin`/modo aberto (`clinicId === null`) THEN o
  status de conexão SHALL ser escopado como "sistema" (mesma convenção de
  `rowId` em `DrizzleGoogleAccountRepository`, já implementada pela #74) —
  sem vazar credencial de clínica nenhuma.
- WHEN o parâmetro `calendar` não está presente na URL (navegação normal pra
  Configurações) THEN nenhum toast SHALL disparar.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CALINT-01 | P1 | Implement | Pending |
| CALINT-02 | P1 | Implement | Pending |
| CALINT-03 | P1 | Implement | Pending |
| CALINT-04 | P1 | Implement | Pending |
| CALINT-05 | P1 | Implement | Pending |

**Coverage:** 5 total, 5 mapped to implementation, 0 unmapped.

---

## Success Criteria

- [ ] Nenhum `fail()` (JSON) sobra nos ramos de erro específicos do fluxo
      OAuth em `callback/route.ts` — todos viram redirect.
- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv`,
      `npm run test:coverage` (≥90%) e `npm run test:e2e` verdes.
