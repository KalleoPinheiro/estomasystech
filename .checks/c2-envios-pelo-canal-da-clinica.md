# C2 — Envios pelo canal da clínica e link manual

Sources:

- [KalleoPinheiro/estomasystech#265](https://github.com/KalleoPinheiro/estomasystech/issues/265) — a issue; aponta para a task
- `.tasks/c2-envios-pelo-canal-da-clinica.md` — critérios 1–16, Decided, Unresolved 1–2 (defaults adotados)
- `.design/canal-por-clinica.md` — Decisions: Convite do 1º admin, Link quando não entregue, Redefinição pelo admin, Esqueci a senha, Lembretes sem canal; Open 3 e 4

Profile: `light` (AGENTS.md não declara outro).

## Out of scope

- Configurar o canal — C3 (#266). Status do canal em `/plataforma` — C4 (#267).
- Aviso proativo de clínica sem canal fora do momento da ação — não decidido.
- `POST /api/platform/clinics/[id]/admins` (convite de admin substituto pela plataforma) — a task não o lista no contrato; segue devolvendo só `delivered`. Registrado como lacuna no PR.

## Landing

Toca `IssueAuthToken` (ganha emissão sem envio), as rotas de convite/reenvio/plataforma, uma rota nova `reset-link`, `ManageClinicAdmins` (`'reset-link'`), `forgot-password`, `SendReminders` (perde o gateway único), `route-family.ts`, as telas `/plataforma/clinicas/nova`, `/plataforma/clinicas/[id]`, `/configuracoes`, `/esqueci-senha` e um componente novo de link copiável. Reaproveita `issueAndTryDeliver`, `replaceUnused` (#50), `assertCanManageAccount`, `SharedRateLimiter`, `recordAuditNow`, `ConfirmAction` e o gateway por escopo da C1.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Contrato `{ delivered, inviteUrl }` (Decided na task) | `inviteUrl: string \| null`, preenchido só quando `delivered === false`; idem `admin.{delivered, inviteUrl}` no `POST /api/platform/clinics` | sempre devolver o link — expõe credencial quando o e-mail saiu |
| `POST /api/accounts/[id]/reset-link` na família `administrative` | `/api/accounts/<id>/reset-link` classificado `administrative` por padrão de rota (o resto de `/api/accounts` continua `operational`); handler também recusa não-`company_admin` com `403` | prefixo `/api/accounts` inteiro em `administrative` — tiraria do Atendente/Profissional o cadastro de portal (RBAC-07..10) |
| `ReminderRunSummary` sem `channelEnabled` | `ClinicReminderSummary.channel?: 'configured' \| 'none'`, ausente só na entrada com `error` (a clínica nem abriu o escopo) | `channel: 'none'` na entrada com erro — afirmaria "sem canal" sem ter lido o canal |

- Nada mais nesta mudança é difícil de reverter.

Leitura do critério 10 ("nem o link nem o segredo aparecem … no log"): vale para o log de produção. Fora de produção, o `NullEmailGateway` loga o link de propósito (C1 C10, `e2e/support/invite-log.ts`); a prova roda com `NODE_ENV=production`.

## Checks

### S1 — Primeiro admin por link manual · 5 files · 31 KB · ~8k

**C1** — `POST /api/platform/clinics` não chama `send` em gateway nenhum e responde `admin.delivered = false` e `admin.inviteUrl = https://app.vitta.test/definir-senha?token=<segredo>`; o token persistido é `invite` com expiração em 24 h
Proof: `npx vitest run tests/api/platform-clinics.test.ts -t "link manual"`

**C2** — `/plataforma/clinicas/nova`, após criar, mostra o link num campo somente leitura, o botão "Copiar link" (que grava o link na área de transferência) e o texto "Envie este link ao administrador da clínica. Ele vale por 24 horas e só pode ser usado uma vez."
Proof: `npx vitest run tests/pages/plataforma-nova-clinica.test.tsx -t "link de convite"`

### S2 — Convite e reenvio devolvem o link quando não entregue · 9 files · 74 KB · ~18k

**C3** — clínica sem canal: `POST /api/accounts` e `POST /api/accounts/[id]/resend-invite` respondem `delivered: false` e `inviteUrl` com o link
Proof: `npx vitest run tests/api/account-invite-link.test.ts -t "sem canal"`

**C4** — `/configuracoes`, com `delivered: false` na criação ou no reenvio, mostra o link, "Copiar link" e "E-mail desativado nesta clínica — envie o link manualmente."
Proof: `npx vitest run tests/pages/configuracoes-accounts.test.tsx -t "link manual"`

**C5** — clínica com canal que entrega: as duas rotas fazem POST ao Resend com `Bearer <chave da clínica>` e respondem `delivered: true`, `inviteUrl: null`
Proof: `npx vitest run tests/api/account-invite-link.test.ts -t "com canal"`

**C6** — canal da clínica responde não-2xx: as duas rotas respondem `delivered: false` com `inviteUrl`, e a conta criada existe
Proof: `npx vitest run tests/api/account-invite-link.test.ts -t "canal falha"`

**C7** — `PATCH /api/platform/clinics/[id]/admins/[accountId]` `resend-invite`: sem canal → `delivered: false` + `inviteUrl`; com canal → POST com a chave da clínica-alvo, `delivered: true`, `inviteUrl: null`; canal falha → `delivered: false` + `inviteUrl`
Proof: `npx vitest run tests/api/platform-clinic-admin-actions.test.ts -t "link do reenvio"`

**C8** — `/plataforma/clinicas/[id]` mostra o link com "Copiar link" quando o reenvio volta `delivered: false`
Proof: `npx vitest run tests/pages/plataforma-clinica.test.tsx -t "link manual"`

### S3 — Redefinição gerada por quem administra · 8 files · 70 KB · ~18k

**C9** — `company_admin` da clínica A, alvo ativo da clínica A: `POST /api/accounts/[id]/reset-link` responde `200` com `delivered`/`inviteUrl` (regra de C3/C5), o token emitido é `reset` com 1 h, e o link anterior não usado da conta deixa de valer
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "emite reset"`

**C10** — alvo de outra clínica → `404`; id inexistente → `404`
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "404"`

**C11** — chamador `atendente` → `403` no handler, e a rota é classificada `administrative`
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "403"`
Proof: `npx vitest run tests/lib/route-family.test.ts -t "reset-link"`

**C12** — alvo desativado → `409` com `"Conta desativada"`
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "409"`

**C13** — 6ª chamada do mesmo chamador em 60 s → `429` (Unresolved 1, default)
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "429"`

**C14** — super admin, `PATCH …/admins/[accountId]` `action: 'reset-link'` num `company_admin` ativo: token `reset` de 1 h, `delivered: false` + `inviteUrl` sem canal
Proof: `npx vitest run tests/api/platform-clinic-admin-actions.test.ts -t "reset-link"`

**C15** — as duas rotas gravam na trilha da clínica `action: 'update'`, `resourceType: 'account'`, `resourceId: <alvo>`, `detail: 'reset-link'`; com `NODE_ENV=production`, nem o segredo nem o link aparecem na auditoria nem em `console.*`
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "auditoria"`
Proof: `npx vitest run tests/api/platform-clinic-admin-actions.test.ts -t "reset-link auditado"`

**C16** — definir a senha pelo link do `reset-link` incrementa `session_version` da conta alvo
Proof: `npx vitest run tests/api/account-reset-link.test.ts -t "revoga sessões"`

**C17** — `/configuracoes` e `/plataforma/clinicas/[id]` têm "Gerar link de redefinição" atrás de `ConfirmAction` com "Gerar um link de redefinição de senha para <e-mail>? Links anteriores deixam de valer."; confirmar chama a rota e mostra o link quando `delivered: false` (Unresolved 2, default)
Proof: `npx vitest run tests/pages/configuracoes-accounts.test.tsx -t "redefinição"`
Proof: `npx vitest run tests/pages/plataforma-clinica.test.tsx -t "redefinição"`

### S4 — Esqueci a senha pelo canal da conta · 4 files · 24 KB · ~6k

**C18** — mesmo e-mail na clínica A (com canal) e na B (sem canal): sai exatamente um POST ao Resend, com a chave de A e destinatário a conta; a resposta é `200` com `NEUTRAL_RESPONSE`
Proof: `npx vitest run tests/api/forgot-password-route.test.ts -t "canal da conta"`

**C19** — e-mail do super admin: com `RESEND_API_KEY`/`EMAIL_FROM` sai pela chave da plataforma; sem elas, nenhum `fetch`; resposta igual
Proof: `npx vitest run tests/api/forgot-password-route.test.ts -t "super admin"`

**C20** — `/esqueci-senha` mostra "Não recebeu? Peça ao administrador da sua clínica um link de redefinição." abaixo do formulário
Proof: `npx vitest run tests/pages/esqueci-senha.test.tsx -t "administrador da sua clínica"`

### S5 — Lembretes pelo canal de cada clínica · 8 files · 55 KB · ~14k

**C21** — clínica A com canal e B sem canal: o lembrete de A sai pela chave de A; o de B conta `skipped` sem `reminder_logs`; o resumo traz `channel: 'configured'` em A, `'none'` em B, e não tem `channelEnabled`
Proof: `npx vitest run tests/api/reminders-run-channel.test.ts -t "canal de cada clínica"`

**C22** — falha no envio de um lembrete de A conta `failed`, o lote segue para o próximo, e nenhum outro gateway é tentado
Proof: `npx vitest run tests/application/send-reminders.test.ts -t "falha de envio não tenta outro canal"`

## Handoff

S1–S5 ≈ 64k tokens de leitura, abaixo de 150k: uma só batch, sem handoff.

## Swept

- validation: C10–C12
- failure modes: C6, C7, C22
- idempotency: C9 — reemitir invalida o link anterior (`replaceUnused`, #50)
- authorization: C10, C11, C14
- concurrency: existente — `replaceUnused` atômico (#50)
- data lifecycle: existente — `reset` 1 h, `invite` 24 h (`auth-token.ts`); C1 e C9 afirmam os valores
- dependency failure: C6, C7, C22
- state transitions: C16
- observability: C15, C21

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| rotas com `{ delivered, inviteUrl }` (5) | `POST /api/platform/clinics` C1 · `POST /api/accounts` C3/C5/C6 · `resend-invite` C3/C5/C6 · `reset-link` C9 · `PATCH admins` C7/C14 | - |
| estado do canal no envio (3) | sem canal C3, C7 · entrega C5, C7 · falha C6, C7 | - |
| erros de `reset-link` (5) | outra clínica C10 · inexistente C10 · não-admin C11 · inativa C12 · taxa C13 | - |
| escopo do forgot-password (3) | clínica com canal C18 · clínica sem canal C18 · super admin C19 | - |
| canal no resumo de lembretes (2) | `configured` C21 · `none` C21 | - |
| telas com link (3) | `/plataforma/clinicas/nova` C2 · `/configuracoes` C4, C17 · `/plataforma/clinicas/[id]` C8, C17 | - |

- Checks que afirmam status, rota ou formato de resposta: C1, C3, C5, C6, C7, C9–C14, C18, C19, C21 — todas as provas chamam o handler da rota.
