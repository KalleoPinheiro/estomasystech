---
title: Sessão expirada leva ao login e devolve a pessoa ao lugar (#207)
status: draft
issue: 207
audience: [agent, dev]
---

# Sessão expirada leva ao login e devolve a pessoa ao lugar — Specification

## Problem Statement

A sessão acaba 12 h depois do login. Hoje:

1. `apiFetch` (`src/lib/client.ts`) trata `401` como erro qualquer: cada tela
   mostra "Não autenticado" num `ErrorAlert` e nada leva ao login.
2. O proxy (`src/proxy.ts`) redireciona páginas para `/login` sem parâmetro, e
   `LOGIN_ERROR_MESSAGES.session_expired` nunca aparece.
3. Depois do login o destino é sempre `/` (ou `/plataforma`): quem estava numa
   ficha perde o lugar.
4. `apiFetch` chama `response.json()` sem proteção: um 502/504 HTML do proxy
   reverso vira `SyntaxError: Unexpected token '<'` na tela.
5. Um SOAP longo digitado perto da 12ª hora se perde no salvamento.

Origem: revisão pré-produção #183, issue #207 (P2).

## Goals

- [ ] `401` de API em tela autenticada leva a `/login?error=session_expired&next=<rota atual>`.
- [ ] `next` só aceita caminho interno (sem open redirect), validado num lugar só.
- [ ] Login (senha e segundo fator) volta ao `next` validado; o proxy também anexa `next`.
- [ ] Corpo não-JSON vira "Serviço indisponível, tente novamente" com o status preservado.
- [ ] SOAP e anamnese que falham por `401` voltam ao formulário depois do login.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Renovação deslizante da sessão | A própria issue manda para a issue de sessão do mapa #183 |
| Aviso antes de expirar | O critério aceita "preservam o rascunho **ou** avisam"; o cookie é `HttpOnly` e o cliente não sabe a expiração sem rota nova |
| Rascunho em outros formulários (consulta, plano de cuidados, etc.) | O critério nomeia SOAP e anamnese |
| Mudanças em `src/app/api/auth/login/` e `src/lib/auth/` | #208 mexe no login em paralelo; nada aqui precisa delas |

## Assumptions & Open Questions

| Assunção / decisão | Padrão escolhido | Motivo | Confirmado? |
| --- | --- | --- | --- |
| Onde guardar o rascunho | `sessionStorage` (só a aba, apagado ao fechar), gravado só quando o salvamento falha por `401`, consumido na primeira leitura | Menor exposição de dado de saúde no dispositivo (LGPD); `localStorage` sobreviveria ao fechamento do navegador num computador de recepção compartilhado | n — pergunta aberta na PR para @KalleoPinheiro |
| Outra pessoa entra na mesma aba | O rascunho guarda o e-mail da conta; outra conta não o vê e ele é apagado | Mesmo computador compartilhado | n — pergunta aberta |
| Quando o proxy põe `error=session_expired` | Só quando havia cookie de sessão (vencido, inválido ou revogado); sem cookie é primeiro acesso e vai só com `next` | Não dizer "sua sessão expirou" a quem nunca entrou | y (decorre do texto da mensagem) |
| Sessão revogada (logout em outro lugar, troca de senha) | Mesmo aviso "Sua sessão expirou. Entre novamente." | Texto já existente; não inventar mensagem nova | n — pergunta aberta |
| `next` vale para o Super Admin | Sim: a etapa do segundo fator volta ao `next` em vez de `/plataforma`. Papel sem acesso ao `next` é redirecionado pelo proxy à própria área (ACE-RN-10) | Critério "Login respeita `next`" não distingue papel | y |
| Texto do aviso de rascunho | "Recuperamos o texto que não foi salvo quando sua sessão expirou. Revise e registre/salve de novo." | Não há texto definido na issue | n — pergunta aberta |

## Acceptance Criteria

1. **SESS-01** WHEN uma chamada de `apiFetch`/`apiFetchPage` recebe `401` e a página
   atual não é `/login`, `/definir-senha` nem `/esqueci-senha` THEN o cliente SHALL
   navegar a `/login?error=session_expired&next=<pathname+search+hash>` e lançar
   `ApiError(401, "Sua sessão expirou. Entre novamente.")`.
2. **SESS-02** WHEN o `401` vem numa dessas telas sem sessão (ex.: senha errada) THEN
   o cliente SHALL manter a mensagem do servidor e não navegar.
3. **SESS-03** `safeNextPath` SHALL aceitar só caminho que começa com uma `/`, sem `//`,
   `/\`, caractere de controle, outra origem ou normalização para `//`; SHALL
   descartar `/`, `/login`, `/definir-senha` e `/esqueci-senha`.
4. **SESS-04** WHEN uma página protegida é aberta sem sessão válida THEN o proxy SHALL
   redirecionar a `/login?next=<pathname+search>`, com `error=session_expired` só se
   havia cookie de sessão; `/` vai sem `next`.
5. **SESS-05** WHEN o login (senha ou segundo fator) conclui THEN a tela SHALL ir ao
   `next` validado; inválido ou ausente → `/` (senha) ou `/plataforma` (segundo fator).
6. **SESS-06** WHEN a resposta não é JSON THEN `apiFetch` SHALL lançar
   `ApiError(status original, "Serviço indisponível, tente novamente")`.
7. **SESS-07** WHEN registrar SOAP ou salvar anamnese falha por `401` THEN o formulário
   SHALL guardar os valores em `sessionStorage` com o e-mail da conta; WHEN a mesma
   conta volta à ficha do mesmo paciente THEN os valores SHALL voltar ao formulário
   (SOAP reaberto) com o aviso de rascunho recuperado; outra conta não vê e o rascunho
   é apagado; falha que não é `401` não grava nada.

## Verificação

| Critério | Teste |
| --- | --- |
| SESS-01, SESS-02, SESS-06 | `tests/lib/client.test.ts`, `tests/lib/login-redirect.test.ts`, `tests/pages/login.test.tsx` |
| SESS-03 | `tests/lib/login-redirect.test.ts`, `tests/proxy.test.ts` |
| SESS-04 | `tests/proxy.test.ts`, `tests/lib/proxy-revocation.test.ts`, `e2e/sessao-expirada.spec.ts` |
| SESS-05 | `tests/pages/login.test.tsx`, `e2e/sessao-expirada.spec.ts` |
| SESS-07 | `tests/pages/patient-draft-recovery.test.tsx`, `e2e/sessao-expirada.spec.ts` |
