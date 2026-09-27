# B5 — Suspensão e reativação de clínica

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) - fonte única (não há `.tasks/` do B5). Settle: Decisions "Estado da clínica" e "Efeito da suspensão"; Shape › Adds (`POST /api/platform/clinics/[id]/suspend`, `POST /api/platform/clinics/[id]/reactivate`, `SuspendClinic`/`ReactivateClinic`, ações no detalhe, estado na lista); Shape › Changes (`POST /api/auth/login` nega clínica `suspended`; `isSessionRevoked`/`lookupAccountStatus` incluem o estado da clínica; `send-reminders.ts` ignora clínica `suspended`); Journey 7 e 8; Open 2 como decidido
- Pedido do dono (@KalleoPinheiro) para este bloco, 2026-09-27 - exclusão de clínica fora; ação do super_admin grava auditoria com o `clinic_id` da clínica-alvo; trilha de plataforma é o B6
- [`.checks/b4-cadastro-clinicas.md`](b4-cadastro-clinicas.md) - contratos de `PlatformClinicDto`, lista, telas, gate do convite, escrita write-ahead da auditoria
- [ADR-005](../docs/adr/005-revogacao-de-sessao-por-versao.md) - revogação por consulta com cache de 60 s
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) - issue mãe (`Refs #214`, não fecha)
- Sem design de tela vinculante: layout e textos da tela decididos aqui (Landing)

## Out of scope

- Excluir clínica - abandonado pelo dono (Boundary Out)
- Trilha de auditoria de plataforma, `audit_events.clinic_id` nullable - B6
- Motivo da suspensão - o design fixa as colunas (`status`, `status_changed_at`, `status_changed_by`) sem motivo; ver Landing
- Suspensão agendada, aviso prévio por e-mail à clínica - nada no design

## Landing

Toca `src/domain/clinic/clinic.ts`, `clinic-repository.ts`, `drizzle-clinic-repository.ts`, `schema.ts`, migração
`0044`, `UserAccountRepository` (Drizzle + in-memory), `src/application/platform/` (casos de uso novos),
rotas `src/app/api/platform/clinics/[id]/{suspend,reactivate}`, `.../admins/**` (gate), `src/app/api/auth/login`,
`src/lib/auth/staff-revocation.ts`, `src/application/reminders/send-reminders.ts` + `reminders/run`, DTOs, telas
`src/app/plataforma/**`, E2E, docs. Reaproveita `ClinicProvisioning` (transação clínica + contas),
`recordAuditNow` (write-ahead), `forgetSessionStatus`, `ConfirmAction`, `StatusBadge`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Estado no banco | migração `0044_clinic-status.sql`: `ALTER TABLE "clinics" ADD COLUMN "status" text DEFAULT 'active' NOT NULL; ADD COLUMN "status_changed_at" timestamptz; ADD COLUMN "status_changed_by" text; ADD CONSTRAINT "clinics_status_check" CHECK ("status" IN ('active', 'suspended'))`. Clínicas existentes nascem `active`, `status_changed_*` nulos | sem `CHECK` - o design só fixa os valores; o `CHECK` barra um terceiro valor gravado fora do domínio, custo zero |
| Escrita do estado | `ClinicRepository.saveStatus(clinic)` grava só `status`, `status_changed_at`, `status_changed_by`; `update` continua gravando só o cadastro | estado dentro de `update` - uma edição de cadastro concorrente com a suspensão regravaria o estado lido antes dela |
| `status_changed_by` | e-mail (`subject`) da sessão do super_admin, como `created_by` da criação de clínica | id da conta - `created_by` já usa o `subject` |
| Suspender derruba as sessões de vez | na mesma transação (`ClinicProvisioning.run`), `status = 'suspended'` e `session_version + 1` em **toda** conta da clínica (`UserAccountRepository.revokeAllSessions()`, escopado à clínica); o processo que atende esquece o cache de revogação da clínica inteira (`forgetClinicSessionStatus(clinicId)`) | só marcar a clínica - ao reativar, cookies emitidos antes da suspensão (12 h) voltariam a valer, e o Journey 8 diz "com novo login" |
| Reativar | `status = 'active'`, `status_changed_*` atualizados; `session_version` não muda (as sessões já morreram na suspensão) | incrementar de novo - nada a derrubar |
| Idempotência | suspender clínica já `suspended` (ou reativar já `active`) → `200` com o DTO atual, **sem** auditoria, sem mudar `status_changed_*`, sem incrementar versão | `409`/`400` - o duplo clique do operador viraria erro; o repositório não tem convenção de `409` e o resultado pedido já vale |
| Contrato das rotas | `POST /api/platform/clinics/[id]/suspend` e `.../reactivate`, sem corpo → `200` `PlatformClinicDto`; clínica inexistente → `404` `Clínica não encontrada` | `PATCH /api/platform/clinics/[id]` com `status` - o design fixa as duas rotas |
| `PlatformClinicDto` e lista | DTO ganha `status: 'active' \| 'suspended'`, `statusChangedAt: string \| null` (ISO), `statusChangedBy: string \| null`; `PlatformClinicSummaryDto` ganha `status` | lista sem estado - o design pede "o estado visível na lista" |
| Auditoria | write-ahead (`recordAuditNow` antes de gravar): `action: 'update'`, `resourceType: 'clinic-status'`, `resourceId` = `clinic_id` = `[id]`, `detail` `suspend`/`reactivate`, ator `super_admin`; auditoria falha → `500` e nada muda | `recordAudit` depois (fire-and-forget) - suspender derruba o acesso de uma clínica inteira; mesma régua das ações de admin do B4 |
| Login negado | `POST /api/auth/login`: das contas ativas com a senha certa, as de clínica `suspended` saem; sobrando uma, entra; nenhuma e ao menos uma suspensa → `403`. Equipe: `O acesso desta clínica está suspenso. Fale com o responsável pela clínica.` `patient`/`partner`: `O acesso desta clínica está suspenso. Fale com o responsável pela clínica: telefone <contactPhone>, e-mail <contactEmail>.` (só as partes preenchidas; sem nenhuma, a mensagem da equipe). Senha errada continua `401` `Email ou senha incorretos` (a suspensão só aparece para quem provou a senha). Auditoria do login `detail: 'clinic_suspended'`, ator = a conta | revelar a suspensão antes da senha - viraria oráculo de e-mail → clínica; `401` - o design pede mensagem própria, e `403` é "credencial certa, acesso negado" |
| Revogação | `lookupAccountStatus` (sessão com empresa) lê conta e clínica; clínica `suspended` → `isActive: false`. Clínica sem linha → estado da conta (lista negra do ADR-005). Sessão sem empresa (super_admin) inalterada | consultar só a versão - o design manda o status incluir o estado da clínica |
| Lembretes | `ReminderClinic` ganha `status`; `SendReminders.execute` pula clínica `suspended` sem abrir o escopo dela e ela não entra em `summary.clinics`; `reminders/run` passa o `status` de `clinics.findAll()` | item `{ clinicId, suspended: true }` no resumo - muda o contrato do cron sem consumidor; filtrar só na rota - o design nomeia `send-reminders.ts` |
| Convite e reenvio em clínica suspensa | `POST .../admins` e `PATCH .../admins/[accountId]` com `resend-invite` → `400` `Clínica suspensa: reative a clínica antes de convidar o admin`, nenhuma conta nem e-mail. `deactivate`/`reactivate` de admin e `PATCH` do cadastro seguem permitidos | permitir - o convidado definiria senha e toparia com o login negado; bloquear tudo - o design diz que o operador "continua vendo o cadastro", e desativar admin não abre acesso |
| Links pendentes (convite/reset) | `set-password` e `forgot-password` não mudam: definir senha não abre sessão, e o login seguinte recebe a mensagem de suspensa | invalidar os tokens da clínica ao suspender - apagaria um convite que a reativação tornaria útil de novo; nenhum acesso passa por eles |
| Demais rotas e crons | nenhuma mudança: `reminders/run` é o único cron (`vercel.json`); rotas públicas de token (`set-password`, `forgot-password`) acima; Google Agenda sincroniza só dentro de requisição da equipe e o callback exige sessão (`requireStaffSession`), que a suspensão revoga | parar a integração Google na suspensão - não há processo de fundo para parar |
| Telas | lista: coluna `Situação` com `Ativa`/`Suspensa`. Detalhe: selo `Suspensa` ao lado do título quando suspensa; seção `Situação da clínica` - ativa: texto `Clínica ativa.` e botão `Suspender clínica` com `ConfirmAction` (título `Suspender clínica?`, descrição `Todas as contas da clínica — equipe, pacientes e parceiros — perdem o acesso em até 1 minuto e os lembretes param. Nenhum dado é apagado.`, confirmar `Suspender`); suspensa: `Suspensa em <dd/mm/aaaa HH:mm> por <e-mail>.` e botão `Reativar clínica` sem confirmação (sucesso: toast `Clínica suspensa`/`Clínica reativada`). Suspensa: convite desabilitado com `Clínica suspensa: reative a clínica antes de convidar o admin.` e sem `Reenviar convite` | confirmar também a reativação - reativar só devolve o acesso que já existia |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`; E2E: `npx playwright test <spec> -g "<nome>"`.

### S1 - Estado no domínio e no banco · ~6k

**C1** - A migração 0044 cria `status` (default `active`, not null), `status_changed_at`, `status_changed_by`; clínica existente lê `active`; `status = 'outro'` → violação de `clinics_status_check`
Proof: `tests/infrastructure/clinic-status-migration.test.ts -t "estado da clínica no banco"`

**C2** - `Clinic.create` nasce `active` sem `statusChangedAt/By`; `suspend(by, at)` → `suspended` com `by`/`at`; `reactivate(by, at)` → `active` com `by`/`at`; `isSuspended` segue o estado; `updateInfo` preserva o estado
Proof: `tests/domain/clinic.test.ts -t "estado da clínica"`

**C3** - `saveStatus` grava só os campos de estado (um `update` de cadastro com a instância antiga não desfaz a suspensão); `findById`/`findAll` devolvem o estado
Proof: `tests/infrastructure/drizzle-clinic-repository.test.ts -t "estado"`

**C4** - `revokeAllSessions()` escopado à clínica incrementa `session_version` de todas as contas dela e de nenhuma outra
Proof: `tests/infrastructure/drizzle-user-account-revoke-all.test.ts -t "Quando revogar todas as sessões da clínica A"`

### S2 - Suspender e reativar pela API · ~10k

**C5** - `POST .../suspend` em clínica ativa → `200` DTO com `status: 'suspended'`, `statusChangedAt` ISO, `statusChangedBy` = e-mail do super_admin; toda conta da clínica tem `session_version` +1, contas de outra clínica não mudam
Proof: `tests/api/platform-clinic-status.test.ts -t "suspende a clínica"`

**C6** - `POST .../reactivate` em clínica suspensa → `200` `status: 'active'`, `statusChangedAt/By` atualizados, `session_version` das contas inalterada
Proof: `tests/api/platform-clinic-status.test.ts -t "reativa a clínica"`

**C7** - Repetir: suspender suspensa / reativar ativa → `200` com o mesmo `statusChangedAt`, sem novo evento de auditoria, sem incremento de versão
Proof: `tests/api/platform-clinic-status.test.ts -t "repetir é idempotente"`

**C8** - Clínica inexistente → `404` `Clínica não encontrada` nas duas rotas
Proof: `tests/api/platform-clinic-status.test.ts -t "clínica inexistente"`

**C9** - Cada mudança grava antes `update/clinic-status` com `detail` `suspend`/`reactivate`, `resourceId` = `clinic_id` = `[id]`, `actorRole: super_admin`; auditoria falhou → `500` e estado e versões não mudam
Proof: `tests/api/platform-clinic-status.test.ts -t "auditoria da suspensão"`
Proof: `tests/api/platform-clinic-status.test.ts -t "auditoria falhou"`

**C10** - `GET /api/platform/clinics` traz `status` por clínica; `GET /api/platform/clinics/[id]` traz `status`, `statusChangedAt`, `statusChangedBy`
Proof: `tests/api/platform-clinic-status.test.ts -t "estado na lista e no detalhe"`

**C11** - Em clínica suspensa: convite → `400` `Clínica suspensa: reative a clínica antes de convidar o admin` e nenhuma conta; `resend-invite` → mesmo `400`; `deactivate`/`reactivate` de admin → `200`; `PATCH` do cadastro → `200`
Proof: `tests/api/platform-clinic-status.test.ts -t "clínica suspensa na gestão de admins"`

**C12** - As rotas novas respondem `403` à equipe e ao portal (varredura da família)
Proof: `tests/api/route-guard-conformance.test.ts -t "família negada"`
Proof: `tests/api/route-guard-conformance.test.ts -t "com sessão de paciente"`
Proof: `tests/api/route-guard-conformance.test.ts -t "com sessão de parceiro"`

### S3 - Login negado e sessões revogadas · ~12k

**C13** - Login com senha certa de conta de clínica suspensa: `company_admin`/`atendente`/`profissional` → `403` com a mensagem da equipe, sem cookie; `patient`/`partner` → `403` com telefone e e-mail da clínica; senha errada → `401` `Email ou senha incorretos`
Proof: `tests/api/login-clinic-suspended.test.ts -t "equipe de clínica suspensa"`
Proof: `tests/api/login-clinic-suspended.test.ts -t "portal de clínica suspensa"`
Proof: `tests/api/login-clinic-suspended.test.ts -t "senha errada não revela"`

**C14** - Portal de clínica suspensa sem contato cadastrado → mensagem da equipe
Proof: `tests/api/login-clinic-suspended.test.ts -t "sem contato"`

**C15** - Mesmo e-mail e senha numa clínica ativa e noutra suspensa → entra na ativa (`200`, cookie com a empresa ativa)
Proof: `tests/api/login-clinic-suspended.test.ts -t "e-mail em clínica ativa e suspensa"`

**C16** - Login negado grava `read/session` com `detail: 'clinic_suspended'` na clínica da conta
Proof: `tests/api/login-clinic-suspended.test.ts -t "auditoria do login negado"`

**C17** - Depois de reativar, login volta a `200`
Proof: `tests/api/login-clinic-suspended.test.ts -t "reativada entra de novo"`

**C18** - Proxy: cookie de equipe e de paciente emitido antes da suspensão → `401` logo após `POST .../suspend` neste processo; continua `401` depois da reativação; login novo após reativar → `200`
Proof: `tests/api/session-revocation.test.ts -t "suspensão da clínica revoga"`

**C19** - `lookupAccountStatus` por si: clínica `suspended` (só o estado, sem incremento de versão) → sessão revogada; clínica ativa → válida
Proof: `tests/api/session-revocation.test.ts -t "estado da clínica na consulta"`

### S4 - Lembretes · ~5k

**C20** - `SendReminders` com uma clínica ativa e uma `suspended`: a suspensa não abre escopo (`servicesFor` não é chamado para ela), não envia e não aparece em `summary.clinics`; a ativa envia
Proof: `tests/application/send-reminders.test.ts -t "ignora clínica suspensa"`

**C21** - `POST /api/reminders/run` com consulta de amanhã em clínica suspensa → nenhum e-mail para ela e ela fora de `clinics`; reativada, o próximo disparo a processa e o e-mail sai
Proof: `tests/api/reminders-run-suspended.test.ts -t "clínica suspensa com consulta amanhã"`

### S5 - Telas · ~25k

**C22** - `/plataforma` mostra a coluna `Situação` com `Ativa`/`Suspensa`
Proof: `tests/pages/plataforma.test.tsx -t "situação da clínica"`

**C23** - Detalhe de clínica ativa: `Suspender clínica` abre a confirmação com o título e a descrição do Landing; só depois de `Suspender` chama `POST .../suspend`
Proof: `tests/pages/plataforma-clinica.test.tsx -t "suspende com confirmação"`

**C24** - Detalhe de clínica suspensa: selo `Suspensa`, texto `Suspensa em <data> por <e-mail>.`, `Reativar clínica` chama `POST .../reactivate`; convite desabilitado com o aviso e sem `Reenviar convite`
Proof: `tests/pages/plataforma-clinica.test.tsx -t "clínica suspensa"`

**C25** - Adoção do `@still-void/ui`
Proof: `npm run check:sv`

### S6 - E2E e documentação · ~20k

**C26** - Pela tela, o super_admin suspende e reativa uma clínica criada no teste; a lista mostra `Suspensa` e depois `Ativa` (roda nas duas configs)
Proof: `e2e/plataforma.spec.ts -g "suspende e reativa pela tela"`

**C27** - Admin de clínica suspensa pela tela vê a mensagem da equipe no login; reativada, entra (config dev: usa o convite do log)
Proof: `e2e/plataforma-suspensao.spec.ts -g "login de clínica suspensa"`

**C28** - Suítes E2E verdes nas duas configs
Proof: `npx playwright test`
Proof: `npm run build && npx playwright test -c playwright.prod.config.ts`

**C29** - `docs/domains/acesso/README.md` descreve suspensão (rotas, login negado com as mensagens, revogação ≤ 60 s, convite bloqueado); `docs/domains/comunicacao/README.md` diz que clínica suspensa não recebe lembretes; `CONTEXT.md` define "Clínica suspensa"; `check:docs` passa
Proof: `tests/docs/super-admin-docs.test.ts -t "suspensão de clínica"`
Proof: `npm run check:docs`

## Swept

- validation: rotas sem corpo; id inexistente C8; valor fora do domínio C1 (`CHECK`)
- failure modes: C8, C9 (auditoria falhou); falha na transação desfaz estado e versões (mesma `ClinicProvisioning` do B4)
- idempotency: C7
- authorization: C12 (família `platform`); login só revela a suspensão após a senha C13
- concurrency: C3 (`saveStatus` separado de `update`); versões incrementadas por instrução atômica (`session_version + 1`) C4
- data lifecycle: nada é apagado - suspender só muda estado e versão (C5); tokens pendentes preservados (Landing)
- dependency failure: revogação segue fail-open com log se o banco falha (AD-004, inalterado)
- state transitions: `active` → `suspended` C5; `suspended` → `active` C6; repetidos C7; sessões antigas não voltam C18
- observability: C9, C16

## Handoff

Lote único: S1–S6 somam ~78k de leitura estimada, abaixo de 150k; nada a passar adiante.

Registro do build (lote único, sem passagem de bastão):

- **Fronteira:** C1–C29 fechadas no próprio lote (`df17e8b..HEAD`).
- **Ajustado durante o build:** a prova do C21 mudou de arquivo (`tests/api/reminders-run-suspended.test.ts`, com clínica própria semeada) e o texto ficou mais preciso ("ela fora de `clinics`; ... a processa e o e-mail sai"); a checagem não baixou. Os fixtures `CLINIC`/`summary` dos testes de tela do B4 ganharam `status` (contrato novo do DTO). `readServerLog`/`waitForInviteUrl` saíram do `global-setup` para `e2e/support/server-log.ts`, para o spec do C27 ler o convite.
- **Descartado:** exportar a mensagem de suspensão do `route.ts` do login (o Next só aceita exports de handler em rota) — foi para `src/application/auth/suspended-clinic-message.ts`.
- **Ambiente local:** Chromium do container é a revisão 1194; as suítes E2E rodaram com um config temporário (não commitado) que só troca `launchOptions.executablePath` para `/opt/pw-browsers/chromium`, e com `NODE_USE_ENV_PROXY=1` (o `next/font/google` precisa sair pelo proxy do container).
- **Verifier, rodada 1 (FAIL 28/29):** C4 — o filtro da prova não casava com o nome do teste (`revoga` × `revogar`); a prova agora usa o nome do teste existente, a checagem não mudou. Achados menores fechados no mesmo commit: C6 reativa com outro operador e exige data estritamente posterior; C11 lê o admin ativo do banco; C24 amarra o selo `Suspensa` ao título e confere os toasts; C29 confere também `.../reactivate`; mensagem do portal com contato parcial ganhou `tests/application/suspended-clinic-message.test.ts`. Mantidos: revogação de `partner` pelo proxy sem teste próprio (mesmo caminho de `patient`, e C13 cobre `partner` no login); consulta da clínica fora do `handleRequest` no handler de estado (mesmo padrão das rotas do B4).
