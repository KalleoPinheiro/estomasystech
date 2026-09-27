# B1 — Contenção do super_admin

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [`.tasks/b1-contencao-super-admin.md`](../.tasks/b1-contencao-super-admin.md) - critérios 1–24, Decided, Impact, Out of scope; registro de decisão
- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) - bloco B1; Journey 10 ajustado para "redireciona para `/`"
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) - issue mãe (o B1 não a fecha: `Refs #214`)
- Conversa com @KalleoPinheiro, 2026-09-27 - as 4 perguntas de `Unresolved` confirmadas com a recomendação padrão: convite do 1º admin no B1; migração falha sem alterar nada; equipe em `/plataforma` → `/`; sem bloqueio do próprio e-mail
- Sem design de tela vinculante: `/plataforma` é título + botão (critério 12)

## Out of scope

- Listar/criar/editar clínicas, listar admins, reenviar convite, desativar admin em `/plataforma` - B4
- Remover `clinicId`/caminho super_admin de `POST /api/accounts` - B4 (fica inalcançável por sessão; só modo aberto)
- 2º fator (B2), recuperação de emergência (B3), suspensão de clínica (B5), trilha de auditoria de plataforma (B6)
- UI para a importação de taxonomias - não pedida

## Landing

Toca `src/lib/auth/{route-family,access-policy}.ts`, `src/proxy.ts`, `src/domain/auth/role-hierarchy.ts`,
`src/app/api/settings/clinic-info/route.ts`, novas rotas `src/app/api/platform/**`, nova página
`src/app/plataforma/page.tsx`, migração `0041`, E2E (`global-setup`, specs), docs (ADR-007, acesso, CONTEXT).
Reaproveita `requireStaffSession` (a família `platform` já decide o papel), `CreateAccount`, `sendInvite`,
`recordAudit`, `importTaxonomyCatalog`, `isUniqueViolation`, `LogoutButton`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Unicidade do super_admin no banco | migração `0041_user-accounts-system-role-clinic-check.sql`: `ALTER TABLE "user_accounts" ADD CONSTRAINT "ck_user_accounts_system_role_has_no_clinic" CHECK (("role" = 'super_admin') = ("clinic_id" IS NULL));` + `check()` no `schema.ts` | só a regra no `CreateAccount` - não protege de escrita direta nem de caminho novo |
| Família de rota `platform` | `RouteFamily` ganha `'platform'`; `PLATFORM_PREFIXES = ['/plataforma', '/api/platform']`, classificado antes de todas as outras; `FAMILY_ALLOWED_ROLES.platform = ['super_admin']`; `super_admin` sai de `operational`, `clinical`, `administrative`, `professional_self` (fica em `shared`: logout e portal) | app/subdomínio separado - só compensa com vários operadores |
| Redirecionamento de página negada | `forbidden()` no proxy: `super_admin` → `/plataforma`; outro papel de equipe → `/`; `patient`/`partner` → `/portal` | tela "sem permissão" - dono confirmou `/` (Unresolved 3) |
| Contrato do convite do 1º admin | `POST /api/platform/clinics/[id]/admins` · in `{ email: string(3..200) }` · out `{ ...toUserAccountDto, role, clinicId, delivered }`, sem link · 404 `Clínica não encontrada` · 23505 → 400 `Já existe conta com este email` · auditoria `create/account` com `clinicId` = `[id]` | `POST /api/accounts` com `clinicId` - rota da clínica, contradiz critério 4 |
| Rota da importação | `POST /api/platform/taxonomy/import`; `src/app/api/admin/taxonomy/import` removida sem alias | alias - continuaria `administrative`, aberta ao `company_admin` |
| Guarda das rotas de plataforma | `requireStaffSession` (família `platform` só admite `super_admin`); sem guarda nova | `requirePlatformSession` nova - duplicaria a mesma decisão, que já mora na matriz de famílias |
| Sessão padrão do E2E | `ADMIN_STORAGE_STATE_PATH` = `company_admin` `e2e-admin@vitta.test` da `legacy-clinic`, convidado pelo super_admin pela rota nova; na suíte de produção (sem link de convite) é cookie assinado de `company_admin` sem conta | manter super_admin - perde acesso a toda rota da clínica |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`; E2E: `npx playwright test <spec> -g "<nome>"`.

### S1 - Só um super_admin · 5 arquivos · 60 KB · ~15k

**C1** - `CreateAccount` com `role: 'super_admin'` lança `ProvisioningDeniedError` e não grava, para todo ator (6 papéis) e com `clinicId` qualquer
Proof: `tests/application/create-account.test.ts -t "nenhum ator cadastra super_admin"`
Proof: `tests/domain/role-hierarchy.test.ts -t "nenhum papel provisiona super_admin"`

**C2** - O banco recusa com `23514`/`ck_user_accounts_system_role_has_no_clinic` super_admin com clínica e não-super_admin sem clínica
Proof: `tests/infrastructure/system-role-clinic-check-migration.test.ts -t "recusa super_admin com clínica"`
Proof: `tests/infrastructure/system-role-clinic-check-migration.test.ts -t "recusa conta de empresa sem clínica"`

**C3** - Migração 0041 sobre banco com linha inválida falha nomeando a constraint e não altera nenhuma linha
Proof: `tests/infrastructure/system-role-clinic-check-migration.test.ts -t "falha sem alterar nada"`

### S2 - Super_admin fora da clínica · 12 arquivos · 90 KB · ~22k

**C4** - Handler: super_admin recebe 403 `Seu papel não tem acesso a este recurso` em toda rota guardada que não é `platform` (varredura de `src/app/api`)
Proof: `tests/api/route-guard-conformance.test.ts -t "com sessão de super_admin, Quando chamar cada handler, Então responde 403"`

**C5** - Proxy: super_admin em `GET /api/patients`, `/api/audit`, `PUT /api/settings/clinic-info`, `/api/auth/identity`, `POST /api/accounts` → 403 com a mensagem
Proof: `tests/proxy.test.ts -t "super_admin recebe 403 nas rotas da clínica"`

**C6** - Proxy: super_admin em `/`, `/agenda`, `/pacientes/x`, `/configuracoes`, `/documentos/x` → 307 para `/plataforma`
Proof: `tests/proxy.test.ts -t "super_admin é levado a /plataforma"`

**C7** - Super_admin com senha válida entra por `/login` e termina em `/plataforma`
Proof: `e2e/auth.spec.ts -g "Super Admin entra e termina em /plataforma"`

**C8** - `PUT /api/settings/clinic-info` com sessão super_admin (handler, sem proxy) → 403 e a clínica não muda
Proof: `tests/api/clinic-info-settings.test.ts -t "super_admin recebe 403 e a clínica não muda"`

**C9** - Matriz: `company_admin`, `atendente`, `profissional`, `patient`, `partner` mantêm as famílias de hoje e `platform` é negada a todos
Proof: `tests/lib/route-family.test.ts -t "matriz papel × família"`

### S3 - Família `platform` · 6 arquivos · 40 KB · ~10k

**C10** - `/api/platform/**`: `company_admin`/`atendente`/`profissional` → 403 `Seu papel não tem acesso a este recurso`; `patient`/`partner` → 403 `Acesso restrito à equipe da clínica` (proxy)
Proof: `tests/proxy.test.ts -t "família platform nega a API aos demais papéis"`

**C11** - Idem no handler (camada 2), para toda rota de `platform`
Proof: `tests/api/route-guard-conformance.test.ts -t "família negada"`
Proof: `tests/api/route-guard-conformance.test.ts -t "com sessão de paciente"`

**C12** - `/plataforma`: equipe não-super_admin → 307 `/`; `patient`/`partner` → 307 `/portal`
Proof: `tests/proxy.test.ts -t "página /plataforma redireciona os demais papéis"`

**C13** - Sem sessão: `/plataforma` → `/login`; `/api/platform/**` → 401 `Não autenticado`
Proof: `tests/proxy.test.ts -t "sem sessão, /plataforma"`

**C14** - `/plataforma` do super_admin mostra título `Plataforma` e botão `Sair`, sem sidebar; `Sair` faz `POST /api/auth/logout` e leva a `/login`
Proof: `tests/pages/plataforma.test.tsx -t "título Plataforma e botão Sair"`
Proof: `e2e/plataforma.spec.ts -g "Sair encerra a sessão"`

### S4 - Primeiro admin de uma clínica · 6 arquivos · 45 KB · ~11k

**C15** - `POST /api/platform/clinics/X/admins` → 200 `{ id, email, role: company_admin, clinicId: X, active: true, passwordSet: false, delivered }`, conta em X, convite emitido
Proof: `tests/api/platform-clinic-admins.test.ts -t "cria o company_admin na clínica"`

**C16** - A resposta nunca traz link de convite, nem com `delivered: false`
Proof: `tests/api/platform-clinic-admins.test.ts -t "sem link de convite"`

**C17** - Clínica inexistente → 404 `Clínica não encontrada`, nenhuma conta criada
Proof: `tests/api/platform-clinic-admins.test.ts -t "clínica inexistente"`

**C18** - `email` ausente, não texto, 2 ou 201 caracteres → 400; e-mail válido com 200 caracteres aceito (3 caracteres cai no formato do domínio, `a@b` → 400)
Proof: `tests/api/platform-clinic-admins.test.ts -t "valida o e-mail"`

**C19** - E-mail já existente na clínica → 400 `Já existe conta com este email`
Proof: `tests/api/platform-clinic-admins.test.ts -t "e-mail repetido"`

**C20** - Concorrência: duas requisições → uma 200, outra 400 com a mensagem, uma conta; `23505` traduzido
Proof: `tests/api/platform-clinic-admins.test.ts -t "concorrentes"`
Proof: `tests/api/platform-clinic-admins.test.ts -t "violação 23505 vira 400"`

**C21** - Falha de e-mail → conta criada, 200 com `delivered: false`, reenvio possível
Proof: `tests/api/platform-clinic-admins.test.ts -t "falha no envio"`

**C22** - Auditoria `create`/`account`/id da conta/`super_admin`/`clinic_id` = X
Proof: `tests/api/platform-clinic-admins.test.ts -t "auditoria"`

### S5 - Catálogo de taxonomias · 5 arquivos · 25 KB · ~6k

**C23** - super_admin `POST /api/platform/taxonomy/import` → 200 com as contagens; 2ª chamada não duplica
Proof: `tests/api/platform-taxonomy-import.test.ts -t "importa e é idempotente"`

**C24** - `POST /api/admin/taxonomy/import` não existe: sem arquivo de rota, e o `company_admin` (quem a chamava antes) recebe 404. Sem sessão o proxy responde 401 e o super_admin recebe 403 antes do roteamento (a família da rota decide primeiro)
Proof: `tests/api/platform-taxonomy-import.test.ts -t "rota antiga não existe"`
Proof: `e2e/plataforma.spec.ts -g "rota antiga de importação responde 404"`

**C25** - `company_admin` → 403 e o catálogo não muda
Proof: `tests/api/platform-taxonomy-import.test.ts -t "company_admin recebe 403"`

### S6 - Registro da decisão · 4 arquivos · 40 KB · ~10k

**C26** - ADR-007 aceito, emenda ADR-003, cobre os 4 pontos; `check:docs` passa
Proof: `tests/docs/super-admin-docs.test.ts -t "ADR-007"`
Proof: `npm run check:docs`

**C27** - Acesso README e CONTEXT descrevem o super_admin como operador sem dado de clínica (ACE-RN-10, tabela de papéis, § Access Control, fechamento de repasses)
Proof: `tests/docs/super-admin-docs.test.ts -t "operador da plataforma"`

### S7 - Impacto na suíte E2E · 10 arquivos · 60 KB · ~15k

**C28** - A suíte E2E roda com a sessão padrão `company_admin` da `legacy-clinic` nas duas configs
Proof: `npx playwright test`
Proof: `npm run build && npx playwright test -c playwright.prod.config.ts`

## Swept

- validation: C18
- failure modes: C3, C17, C21
- idempotency: C23; C19 (repetir o convite → 400, sem 2ª conta)
- authorization: C4–C6, C8–C13, C25
- concurrency: C20
- data lifecycle: n/a - nada é removido
- dependency failure: C21
- state transitions: n/a - nenhum ciclo de vida muda
- observability: C22

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| atores do CreateAccount com alvo super_admin (6) | table-driven em C1 | - |
| famílias negadas ao super_admin (4) | `clinical`, `operational`, `administrative`, `professional_self` - C4 varre toda rota por família | - |
| papéis × família (6 × 6) | table-driven em C9 | - |
| destino de página negada (3) | super_admin C6 · equipe C12 · portal C12 | - |
| limites de `email` (4) | 2, 3 (formato), 200, 201 em C18 | - |
| suítes E2E (2 configs) | dev e prod em C28 | - |

- Claims naming a status code, route or response shape: C4, C5, C6, C8, C10–C13, C15–C25 - cada uma tem proof que chama o handler ou o proxy
- Nenhuma outra check afirma mais do que o caso que a proof exercita

## Handoff

Lote único: S1–S7 somam ~89k de leitura, abaixo de 150k; nada a passar adiante.
