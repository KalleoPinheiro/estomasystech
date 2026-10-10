# C2 — Envios pelo canal da clínica e link manual

> Build this with **tlc-implement**.
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Depois da C1, uma clínica sem canal fica com e-mail desativado. Os fluxos, porém, ainda supõem que o
e-mail sai. O convite do primeiro `company_admin` (`POST /api/platform/clinics`) só devolve
`delivered`, e o link se perde. Convite e reenvio feitos pelo admin da clínica também perdem o link
quando não entregues. "Esqueci a senha" emite tudo em `systemScope()`
(`src/app/api/auth/forgot-password/route.ts`), e o job de lembretes recebe um gateway único
(`src/app/api/reminders/run/route.ts:46`). Não existe jeito de o admin entregar uma redefinição de
senha quando a clínica não tem canal. Sem isto, uma clínica nova fica sem nenhum caminho de
primeiro acesso.

Com esta task, todo envio de clínica passa a sair pelo canal dela. O link de convite ou de
redefinição volta na tela de quem o gerou sempre que o e-mail não saiu, e o admin da clínica (e o
super admin, para o `company_admin`) consegue gerar um link de redefinição.

16 critérios em 5 fatias · 2 portas sem volta · 2 em aberto, 0 bloqueiam

## Criteria

### Primeiro admin por link manual

1. Quando o super admin cria uma clínica (`POST /api/platform/clinics`), então nenhum e-mail é enviado e a resposta traz `admin.delivered = false` e `admin.inviteUrl` igual a `<APP_URL>/definir-senha?token=<segredo>`, válido por 24 h.
2. Quando o super admin abre a resposta na tela `/plataforma/clinicas/nova`, então vê o link num campo somente leitura com um botão "Copiar link" e o texto "Envie este link ao administrador da clínica. Ele vale por 24 horas e só pode ser usado uma vez."

### Convite e reenvio devolvem o link quando não entregue

3. Dada clínica sem canal, quando o `company_admin` cria uma conta (`POST /api/accounts`) ou reenvia o convite (`POST /api/accounts/[id]/resend-invite`), então a resposta traz `delivered: false` e `inviteUrl` preenchido, e `/configuracoes` mostra o link com "Copiar link" e o aviso "E-mail desativado nesta clínica — envie o link manualmente."
4. Dada clínica com canal que entrega, quando a mesma ação acontece, então o e-mail sai pela chave da clínica e a resposta traz `delivered: true` e `inviteUrl: null`.
5. Se o canal da clínica falha no envio (não-2xx do provedor), então a resposta traz `delivered: false` e `inviteUrl` preenchido, e a conta continua criada.
6. Quando o super admin reenvia o convite de um `company_admin` (`PATCH /api/platform/clinics/[id]/admins/[accountId]`, `action: 'resend-invite'`), então vale a mesma regra de 3–5, usando o canal da clínica-alvo.

### Redefinição gerada por quem administra

7. Dado `company_admin` da clínica A e conta alvo ativa da clínica A com papel em `PROVISIONING_MATRIX.company_admin`, quando ele chama `POST /api/accounts/[id]/reset-link`, então um token `reset` de 1 h é emitido, os tokens `reset` anteriores não usados da conta ficam inválidos, e a resposta segue a regra de 3–5 (`delivered` + `inviteUrl`).
8. Se o alvo é de outra clínica ou não existe, então `404`; se o chamador não é `company_admin`, então `403`; se a conta alvo está inativa, então `409` com `"Conta desativada"`.
9. Quando o super admin chama `PATCH /api/platform/clinics/[id]/admins/[accountId]` com `action: 'reset-link'` para um `company_admin` ativo, então vale o critério 7 para esse alvo.
10. Sempre, gerar um link de redefinição grava na trilha da clínica `action: 'update'`, `resourceType: 'account'`, `resourceId: <alvo>`, `detail: 'reset-link'`, e nem o link nem o segredo aparecem na auditoria ou no log.
11. Quando a conta alvo define a senha pelo link gerado, então as sessões anteriores dela ficam revogadas (`session_version + 1`, comportamento atual do `set-password`, mantido).

### Esqueci a senha pelo canal da conta

12. Dado e-mail com conta ativa na clínica A (com canal) e na clínica B (sem canal), quando `POST /api/auth/forgot-password` é chamado, então sai um e-mail pela chave de A para a conta de A, nada sai para a conta de B, e a resposta é o `NEUTRAL_RESPONSE` de sempre (`200`, mesmo corpo).
13. Dado e-mail do super admin, quando a mesma rota é chamada, então o link sai pelo canal da plataforma se ele existir, senão não sai nada, e a resposta é a mesma.
14. Quando `/esqueci-senha` é exibida, então mostra, abaixo do formulário, "Não recebeu? Peça ao administrador da sua clínica um link de redefinição."

### Lembretes pelo canal de cada clínica

15. Dadas a clínica A com canal e a clínica B sem canal, quando `POST /api/reminders/run` dispara, então os lembretes de A saem pela chave de A; os de B contam `skipped`, sem `reminder_logs`; e o resumo traz, por clínica, `channel: 'configured'` para A e `channel: 'none'` para B, sem o campo `channelEnabled` no topo.
16. Se o envio de um lembrete de A falha, então conta `failed` e o lote segue (comportamento atual, mantido), sem tentar outro canal.

## Out of scope

- Configurar o canal — C3.
- Mostrar o status do canal na plataforma — C4.
- Aviso proativo à clínica de que está sem canal (fora do momento da ação) — não decidido.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/plataforma/clinicas/nova` (resultado) | estado de sucesso com link | 2 |
| screen `/plataforma/clinicas/nova` | erro | existing - `ErrorAlert` da página |
| screen `/plataforma/clinicas/[id]` admins | link após reenvio ou redefinição | 6, 9 (mesmo componente de 2) |
| screen `/plataforma/clinicas/[id]` admins | gerar redefinição confirma antes | Unresolved 2 |
| screen `/configuracoes` contas | link e aviso sem canal | 3 |
| screen `/configuracoes` contas | botão "Gerar link de redefinição" por conta | Unresolved 2 |
| screen `/esqueci-senha` | texto de ajuda | 14 |
| API `POST /api/accounts/[id]/reset-link` | resposta, erros e quem chama | 7, 8 |
| API `POST /api/accounts/[id]/reset-link` | limite de taxa | Unresolved 1 |
| API `POST /api/platform/clinics` | resposta | 1 |
| API `POST /api/auth/forgot-password` | resposta | 12, 13 |
| API `POST /api/reminders/run` | formato do resumo | 15 |

## Swept

- validation: 8
- failure modes: 5, 16
- idempotency and retry: 7 (reemitir invalida os anteriores — `replaceUnused`, issue #50)
- authorization: 8, 9
- concurrency and ordering: existing - `replaceUnused` é atômico (issue #50); duas emissões concorrentes não deixam dois links vivos
- data lifecycle: existing - token `reset` expira em 1 h e convite em 24 h (`auth-token.ts`)
- external-dependency failure: 5, 16
- state transitions: 11
- observability: 10, 15

## Impact

| Front | What changes |
|---|---|
| domain | existing term: `delivered` era informativo; passa a ser acompanhado de `inviteUrl` quando `false` — a UI de `/configuracoes` (`undelivered`, `page.tsx:402`) ramifica nele hoje |
| domain | existing term: `ReminderRunSummary.channelEnabled` sai do topo — `tests/api/reminders-routes.test.ts`, `tests/application/send-reminders.test.ts` e a doc `cron.md` o leem |
| domain | existing term: `ADMIN_ACTIONS` ganha `'reset-link'` — `clinic-admins-section.tsx` ramifica nas ações |
| security | o admin passa a ver links de credencial de contas da clínica: aceito pelo dono, mitigado por 10 e 11 |
| stored data | nada a migrar |
| e2e | `e2e/support/invite-log.ts` lê o link do log do gateway nulo; segue funcionando, e `inviteUrl` na resposta passa a ser alternativa |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Contrato de resposta | `{ delivered: boolean; inviteUrl: string \| null }` em `POST /api/accounts`, `POST /api/accounts/[id]/resend-invite`, `POST /api/accounts/[id]/reset-link`, `PATCH /api/platform/clinics/[id]/admins/[accountId]`; `admin.{delivered, inviteUrl}` em `POST /api/platform/clinics`; `inviteUrl` só quando `delivered === false` | Sempre devolver o link — expõe credencial sem necessidade quando o e-mail saiu |
| Redefinição por quem administra | `POST /api/accounts/[id]/reset-link` (família `administrative`) e `ADMIN_ACTIONS = ['resend-invite','deactivate','reactivate','reset-link']` | Só reconvite — o dono escolheu "admin gera link" (2026-10-10) |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `POST /api/accounts/[id]/reset-link` | — | `delivered`, `inviteUrl` | `200`, `403`, `404`, `409` | 7, 8, 10 |
| `PATCH /api/platform/clinics/[id]/admins/[accountId]` | `action: 'reset-link'` | admin + `delivered`, `inviteUrl` | `200`, `404` | 6, 9 |
| `POST /api/platform/clinics` | inalterado | `admin.inviteUrl` | `200` | 1 |
| `POST /api/reminders/run` | inalterado | `clinics[].channel` | `200` | 15 |

## Sources

- `.design/canal-por-clinica.md` — Decisions: Convite do 1º admin, Link quando não entregue, Redefinição pelo admin, Esqueci a senha, Lembretes sem canal.
- Conversa de discovery, 2026-10-10: "Só link manual" (convite da clínica nova); "Admin gera link (Recomendado)" (redefinição sem canal).

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | Limite de taxa de `reset-link` | `SharedRateLimiter('reset-link', 5, 60_000)` por conta do chamador |
| 2 | open | Botão "Gerar link de redefinição" pede confirmação? | Sim, com `ConfirmAction`: "Gerar um link de redefinição de senha para <e-mail>? Links anteriores deixam de valer." |
