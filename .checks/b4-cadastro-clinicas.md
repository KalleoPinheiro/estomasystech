# B4 — Cadastro de clínicas e gestão de admins

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) - fonte única (não há `.tasks/` do B4). Settle: Decisions "Alcance do super_admin", "Dados obrigatórios na criação", "Clínica do go-live (`legacy-clinic`)"; Shape › Adds (colunas de contato, `uq_clinics_cnpj`, rotas `GET/POST /api/platform/clinics`, `GET/PATCH /api/platform/clinics/[id]`, `GET /api/platform/clinics/[id]/admins`, `PATCH /api/platform/clinics/[id]/admins/[accountId]`, casos de uso `CreateClinic`/`UpdateClinicInfo`/`ManageClinicAdmins`, telas); Shape › Changes (`POST /api/accounts` sem `clinicId`, `PUT /api/settings/clinic-info` com contato); Journey 3–6; Open 1 e 5 como decididos
- Pedido do dono (@KalleoPinheiro) para este bloco, 2026-09-27 - o gate "cadastro completo antes do convite" foi adiado do B1 para cá e vale também para `POST /api/platform/clinics/[id]/admins`; ação do super_admin numa clínica grava auditoria com o `clinic_id` da clínica-alvo
- [`.tasks/b1-contencao-super-admin.md`](../.tasks/b1-contencao-super-admin.md) e [`.checks/b1-contencao-super-admin.md`](b1-contencao-super-admin.md) - contrato do convite (critérios 13–19), família `platform`, sessão padrão do E2E
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) - issue mãe (`Refs #214`, não fecha)
- Sem design de tela vinculante: o design só lista as telas; layout e textos decididos aqui (Landing)

## Out of scope

- `clinics.status`, suspender/reativar, login negado de clínica suspensa - B5
- Trilha de auditoria de plataforma, `audit_events.clinic_id` nullable - B6
- `partners.email` por empresa - B7
- Excluir clínica - abandonado pelo dono (Boundary Out)
- Gerir contas que não sejam `company_admin` pela plataforma - Alcance do super_admin (nada operacional)
- Dígito verificador do CNPJ - ver Landing

## Landing

Toca `src/domain/clinic/clinic.ts` (+ `cnpj.ts`), `drizzle-clinic-repository.ts`, migração `0043`, porta nova
`ClinicProvisioning` (transação clínica + conta), `src/application/platform/` (casos de uso), rotas
`src/app/api/platform/clinics/**`, `src/app/api/accounts/route.ts`, `src/app/api/settings/clinic-info/route.ts`,
telas `src/app/plataforma/**`, Configurações, `e2e/global-setup.ts`, docs. Reaproveita `CreateAccount`,
`sendInvite`, `IssueAuthToken`, `assertCanDeactivate`, `recordAudit`/`recordAuditNow`, `isUniqueViolation`,
`ConfirmAction`, `StatusBadge`, `useApiQuery`, `EmptyState`/`ErrorAlert`/`LoadingIndicator`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Contato e unicidade de CNPJ no banco | migração `0043_clinic-contact-cnpj-unique.sql`: `ALTER TABLE "clinics" ADD COLUMN "contact_phone" text; ADD COLUMN "contact_email" text; CREATE UNIQUE INDEX "uq_clinics_cnpj" ON "clinics" ("cnpj") WHERE "cnpj" IS NOT NULL;` - sem saneamento: CNPJ repetido já gravado faz a migração falhar (mesma linha do B1, nada em produção) | normalizar/deduplicar CNPJs existentes na migração - não há dado real, e sanear escolheria sozinho qual clínica fica com o CNPJ |
| Forma canônica do CNPJ | domínio normaliza para `AA.AAA.AAA/AAAA-DD`: tira espaço, `.`, `/`, `-`; maiúsculas; exige 14 caracteres, os 12 primeiros `[0-9A-Z]` e os 2 últimos dígitos (aceita o CNPJ alfanumérico da Receita, jul/2026). Sem dígito verificador. Mensagem `CNPJ inválido: use 14 caracteres (12 letras ou números e 2 dígitos)`. Vale em criar e editar, pelos dois caminhos | só dígitos - recusaria o CNPJ alfanumérico em vigor desde jul/2026; conferir DV - nenhum documento do repositório confere DV (CPF, CNPJ), as fixtures usam CNPJ de exemplo e a unicidade já pega o erro que importa (duas clínicas com o mesmo número); guardar como veio - `uq_clinics_cnpj` deixaria passar o mesmo CNPJ com e sem pontuação |
| Telefone e e-mail de contato | telefone: `trim`, obrigatório na criação, ≤ 50 (como `phone` de paciente/parceiro); e-mail: `trim` + minúsculas, regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` (a de `person-validation`), ≤ 200. Mensagens `Telefone de contato é obrigatório`, `E-mail de contato é obrigatório`, `E-mail de contato inválido` | formato de telefone (DDD, máscara) - o repositório não valida telefone em lugar nenhum; WhatsApp usa o número como veio |
| "Cadastro completo" | `Clinic.isRegistrationComplete()` = `name`, `cnpj`, `contactPhone`, `contactEmail` preenchidos (literal do design). A `legacy-clinic` (só nome) é incompleta | tratar o nome `Clínica legada` como vazio - o design fala em "preenchidos"; os outros três campos já tornam a clínica incompleta |
| Editar não obriga cadastro completo | `PATCH` da plataforma e `PUT /api/settings/clinic-info` aceitam `null`/vazio em `cnpj`, `contactPhone`, `contactEmail` (como hoje com `cnpj`); `name` vazio continua `400`. A clínica passa a aparecer como "Cadastro incompleto" | recusar limpar campo obrigatório - muda o comportamento atual de `clinic-info` (limpar CNPJ) e o design só obriga na criação |
| Gate do convite (B1) | `POST /api/platform/clinics/[id]/admins` em clínica com cadastro incompleto → `400` `Complete o cadastro da clínica (nome, CNPJ, telefone e e-mail de contato) antes de convidar o admin`, nenhuma conta criada | `409` - o repositório usa `400` (`ValidationError`) para recusa por estado (ex.: `Conta desativada não pode receber convite`) |
| CNPJ repetido | `400` `Já existe clínica com este CNPJ`, por checagem prévia e pela tradução de `23505` em `uq_clinics_cnpj` (corrida), nos dois caminhos de escrita | `409` - mesma convenção de `Já existe conta com este email` (`400`) |
| Transação clínica + conta | porta nova `ClinicProvisioning.run(clinicId, fn({ clinics, userAccounts }))` em `src/application/ports/`, implementada com `db.transaction` e repositórios sobre o `tx` (conta escopada à clínica nova); `Services.clinicProvisioning` | estender `TransactionScope`/`TransactionManager` - ele nasce preso à empresa do escopo, e a clínica nova ainda não existe quando o escopo é montado |
| Escopo das rotas de lista/criação | `app/api/platform/clinics/route.ts` usa `systemScope()` só para `clinics` e `clinicProvisioning` (entrada nova na allowlist de `tests/lib/tenant-scope.test.ts`); contas e convite de cada clínica sempre por `clinicScope(id)` | `systemScope().userAccounts.findAll()` para montar a lista - teto de 500 linhas somando pacientes de todas as clínicas |
| Contrato `GET /api/platform/clinics` | `[{ id, name, cnpj, registrationComplete, adminStatus: 'none' \| 'pending' \| 'active', createdAt }]`, ordenado por `name` (`localeCompare` pt-BR). `adminStatus`: `active` se algum `company_admin` ativo já definiu senha; senão `pending` se há `company_admin` ativo sem senha; senão `none` | ordenar por criação - com poucas clínicas o operador procura pelo nome; mostrar contagem de pacientes/consultas - dado operacional da clínica, fora do alcance |
| Contrato `POST /api/platform/clinics` | in `{ name ≤200, cnpj ≤30, contactPhone ≤50, contactEmail ≤200, adminEmail 3..200, professionalName? ≤200, professionalRegistry? ≤60 }` · out `{ clinic: PlatformClinicDto, admin: { id, email, role, clinicId, active, passwordSet, professionalId, delivered } }`, sem link · auditoria `create/clinic` e `create/account`, ambos com `clinic_id` = clínica nova | criar a clínica e convidar em duas chamadas - o design pede clínica + primeiro admin + convite num caso de uso |
| `PlatformClinicDto` | `{ id, name, cnpj, contactPhone, contactEmail, address, city, professionalName, professionalRegistry, registrationComplete, createdAt }` | reusar `ClinicInfoDto` - não tem id nem estado do cadastro |
| Contrato `GET/PATCH /api/platform/clinics/[id]` | `GET` → `PlatformClinicDto`; `PATCH` in parcial `{ name, cnpj, contactPhone, contactEmail, address, city, professionalName, professionalRegistry }` (mesmos limites de `clinic-info`) → `PlatformClinicDto`; `404` `Clínica não encontrada`; auditoria `update/clinic-info`, `resourceId` e `clinic_id` = `[id]` | `PUT` - o design fixa `PATCH` |
| Contrato `GET /api/platform/clinics/[id]/admins` | só contas `company_admin` da clínica: `[{ id, email, active, passwordSet }]`, ordem por e-mail (a do repositório); `404` sem clínica | listar todas as contas - expõe a equipe e o portal (pacientes) ao operador, contra a minimização do Alcance |
| Contrato `PATCH /api/platform/clinics/[id]/admins/[accountId]` | in `{ action: 'resend-invite' \| 'deactivate' \| 'reactivate' }` · out `{ id, email, active, passwordSet, delivered: boolean \| null }` (`delivered` só no reenvio) · conta que não é `company_admin` da clínica → `404` `Admin não encontrado` · reenvio segue `IssueAuthToken` (convite sem senha, redefinição com senha; conta desativada `400`) · desativar segue `assertCanDeactivate` (último ativo `400`) e revoga as sessões · auditoria write-ahead `update/account` com `detail` = a ação e `clinic_id` = `[id]` | três rotas `POST .../resend-invite`, `.../deactivate`, `.../reactivate` - o design fixa um `PATCH` no recurso |
| `POST /api/accounts` sem caminho do super_admin | `clinicId` sai do schema (o `zod` descarta a chave); a empresa é sempre `writeClinicId(session)`; no modo aberto (sem sessão, só dev) o ator é `company_admin` da clínica de escrita | manter o ator `super_admin` no modo aberto - é exatamente o caminho que o design manda remover |
| Telas | `/plataforma` = lista (tabela Nome · CNPJ · Cadastro · Admin, link "Nova clínica"); `/plataforma/clinicas/nova` = formulário; `/plataforma/clinicas/[id]` = cadastro editável + admins (convidar, reenviar, desativar com `ConfirmAction`, reativar). Rótulos: `Cadastro completo`/`Cadastro incompleto`; `Sem admin`/`Aguardando primeiro acesso`/`Ativo`. Vazio `Nenhuma clínica cadastrada.`; carregando/erro com `LoadingIndicator`/`ErrorAlert` | modal de criação na lista - o design pede a tela "nova clínica" |
| Semente da `legacy-clinic` no E2E | `global-setup` completa o cadastro da `legacy-clinic` como super_admin (`PATCH /api/platform/clinics/legacy-clinic` com nome, CNPJ, telefone e e-mail) antes do convite do B1 - o mesmo caminho que o operador fará no go-live | `INSERT`/fixture no banco - é o SQL que o Success do design diz que não pode ser preciso |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`; E2E: `npx playwright test <spec> -g "<nome>"`.

### S1 - Cadastro e contato no domínio e no banco · 6 arquivos · 16 KB · ~4k

**C1** - A migração 0043 cria `contact_phone` e `contact_email` e `uq_clinics_cnpj`: segunda clínica com o mesmo CNPJ → `23505` nomeando `uq_clinics_cnpj`; duas clínicas com CNPJ nulo convivem
Proof: `tests/infrastructure/clinic-cnpj-unique-migration.test.ts -t "recusa o mesmo CNPJ em duas clínicas"`
Proof: `tests/infrastructure/clinic-cnpj-unique-migration.test.ts -t "CNPJ nulo não conflita"`

**C2** - `Clinic.create` exige `name`, `cnpj`, `contactPhone`, `contactEmail` (cada ausente/vazio → `ValidationError` com a mensagem do campo); `professionalName`/`professionalRegistry` opcionais
Proof: `tests/domain/clinic.test.ts -t "campos obrigatórios na criação"`

**C3** - CNPJ normaliza para `AA.AAA.AAA/AAAA-DD` (com ou sem pontuação, alfanumérico em maiúsculas) e recusa 13 ou 15 caracteres, símbolo estranho e letra nos 2 últimos, em criar e em `updateInfo`
Proof: `tests/domain/clinic.test.ts -t "normaliza o CNPJ"`
Proof: `tests/domain/clinic.test.ts -t "recusa CNPJ malformado"`

**C4** - E-mail de contato sai `trim` + minúsculas, formato inválido → `E-mail de contato inválido`; telefone sai `trim`
Proof: `tests/domain/clinic.test.ts -t "normaliza o contato"`

**C5** - `isRegistrationComplete()` só é `true` com nome, CNPJ, telefone e e-mail; faltando qualquer um, `false`
Proof: `tests/domain/clinic.test.ts -t "cadastro completo"`

**C6** - O repositório grava e lê `contactPhone`/`contactEmail` na criação e na edição
Proof: `tests/infrastructure/drizzle-clinic-repository.test.ts -t "contato"`

### S2 - Criar e listar clínicas · 10 arquivos · 30 KB · ~8k

**C7** - `POST /api/platform/clinics` válido → `200` com `{ clinic, admin }` no contrato do Landing; clínica gravada, conta `company_admin` na clínica nova sem senha usável, convite emitido para o e-mail do admin
Proof: `tests/api/platform-clinics.test.ts -t "cria a clínica e convida o primeiro admin"`

**C8** - A resposta da criação nunca traz o link do convite, com `delivered` `true` ou `false`
Proof: `tests/api/platform-clinics.test.ts -t "criação sem link de convite"`

**C9** - Faltando ou inválido `name`, `cnpj`, `contactPhone`, `contactEmail` ou `adminEmail` → `400`, e nenhuma clínica nem conta é criada
Proof: `tests/api/platform-clinics.test.ts -t "valida os campos obrigatórios"`

**C10** - CNPJ já usado → `400` `Já existe clínica com este CNPJ`, nada criado; duas criações simultâneas com o mesmo CNPJ → uma `200`, outra `400`, uma clínica
Proof: `tests/api/platform-clinics.test.ts -t "CNPJ repetido"`
Proof: `tests/api/platform-clinics.test.ts -t "criações concorrentes"`

**C11** - Clínica e conta na mesma transação: se gravar a conta falha, a clínica não fica
Proof: `tests/api/platform-clinics.test.ts -t "falha ao gravar a conta desfaz a clínica"`

**C12** - Falha no envio do e-mail → `200` com `admin.delivered: false`, clínica e conta criadas
Proof: `tests/api/platform-clinics.test.ts -t "falha no envio do convite"`

**C13** - A criação grava `create/clinic` (`resourceId` = clínica) e `create/account` (`resourceId` = conta), ambos com `actorRole: super_admin` e `clinic_id` = clínica nova
Proof: `tests/api/platform-clinics.test.ts -t "auditoria da criação"`

**C14** - `GET /api/platform/clinics` → `200`, ordenado por nome, cada item no contrato do Landing; `adminStatus` `none`/`pending`/`active` pela regra; `legacy-clinic` só com nome → `registrationComplete: false`
Proof: `tests/api/platform-clinics.test.ts -t "lista as clínicas"`
Proof: `tests/application/platform-clinic-overview.test.ts -t "estado do admin"`

**C15** - Toda rota nova de `platform` responde `403` à equipe da clínica e ao portal no handler (varredura)
Proof: `tests/api/route-guard-conformance.test.ts -t "família negada"`

### S3 - Detalhe e edição do cadastro pela plataforma · 4 arquivos · 12 KB · ~3k

**C16** - `GET /api/platform/clinics/[id]` → `200` `PlatformClinicDto`; id inexistente → `404` `Clínica não encontrada`
Proof: `tests/api/platform-clinic-detail.test.ts -t "detalhe da clínica"`

**C17** - `PATCH` parcial altera só os campos enviados, devolve o DTO atualizado; `name` vazio → `400` e nada muda; id inexistente → `404`
Proof: `tests/api/platform-clinic-detail.test.ts -t "edita o cadastro"`
Proof: `tests/api/platform-clinic-detail.test.ts -t "nome vazio"`

**C18** - `PATCH` com CNPJ de outra clínica → `400` `Já existe clínica com este CNPJ` e a clínica não muda; o próprio CNPJ de novo → `200`
Proof: `tests/api/platform-clinic-detail.test.ts -t "CNPJ de outra clínica"`

**C19** - `PATCH` grava `update/clinic-info` com `resourceId` e `clinic_id` = `[id]` e `actorRole: super_admin`
Proof: `tests/api/platform-clinic-detail.test.ts -t "auditoria da edição"`

### S4 - Admins da clínica · 8 arquivos · 24 KB · ~6k

**C20** - `GET /api/platform/clinics/[id]/admins` → só as contas `company_admin` daquela clínica, `{ id, email, active, passwordSet }`; atendente/paciente da mesma clínica e admin de outra não aparecem; clínica inexistente → `404`
Proof: `tests/api/platform-clinic-admins.test.ts -t "lista só os admins da clínica"`

**C21** - Convite em clínica de cadastro incompleto → `400` com a mensagem do gate, nenhuma conta; completando o cadastro, o mesmo convite → `200`
Proof: `tests/api/platform-clinic-admins.test.ts -t "cadastro incompleto bloqueia o convite"`

**C22** - `resend-invite` em admin pendente → `200` com `delivered`, novo e-mail de convite para ele, sem link na resposta; admin desativado → `400` `Conta desativada não pode receber convite`
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "reenvia o convite"`

**C23** - `deactivate` com outro `company_admin` ativo → `200` `active: false` e `session_version` da conta sobe; o único ativo → `400` `Não é possível desativar o último administrador ativo da empresa` e nada muda
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "desativa o admin"`
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "último admin ativo"`

**C24** - `reactivate` → `200` `active: true`
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "reativa o admin"`

**C25** - `accountId` que não é `company_admin` da clínica (atendente dela, admin de outra, inexistente) → `404` `Admin não encontrado` e nada muda; clínica inexistente → `404` `Clínica não encontrada`; `action` fora das três → `400`
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "só admin da clínica"`
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "ação inválida"`

**C26** - Cada ação grava antes `update/account` com `detail` = ação, `clinic_id` = `[id]`, `actorRole: super_admin`; se a auditoria falha, a conta não muda
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "auditoria das ações"`
Proof: `tests/api/platform-clinic-admin-actions.test.ts -t "auditoria falhou"`

### S5 - Rotas da clínica · 6 arquivos · 20 KB · ~5k

**C27** - `POST /api/accounts` descarta `clinicId`: `company_admin` da clínica A mandando `clinicId` da B cria a conta na A
Proof: `tests/api/accounts-provisioning.test.ts -t "clinicId no corpo é ignorado"`

**C28** - `PUT /api/settings/clinic-info` do `company_admin` grava `contactPhone`/`contactEmail` e o `GET` os devolve; e-mail inválido → `400`; CNPJ de outra clínica → `400` `Já existe clínica com este CNPJ`
Proof: `tests/api/clinic-info-settings.test.ts -t "contato da clínica"`
Proof: `tests/api/clinic-info-settings.test.ts -t "CNPJ de outra clínica"`

**C29** - `PUT /api/settings/clinic-info` segue só do `company_admin` (atendente → `403`)
Proof: `tests/api/clinic-info-settings.test.ts -t "Dado papel atendente, Quando tentar salvar"` (teste existente; a checagem não muda)

### S6 - Telas da plataforma e Configurações · 12 arquivos · 140 KB · ~35k

**C30** - `/plataforma` lista as clínicas (Nome, CNPJ, Cadastro, Admin) com os rótulos do Landing e link para o detalhe; lista vazia → `Nenhuma clínica cadastrada.`; erro da API → alerta com a mensagem
Proof: `tests/pages/plataforma.test.tsx -t "lista as clínicas"`
Proof: `tests/pages/plataforma.test.tsx -t "sem clínicas"`
Proof: `tests/pages/plataforma.test.tsx -t "erro ao listar"`

**C31** - `/plataforma/clinicas/nova` envia os 7 campos a `POST /api/platform/clinics` e leva ao detalhe da clínica criada; erro da API aparece na tela
Proof: `tests/pages/plataforma-nova-clinica.test.tsx -t "cria e abre o detalhe"`
Proof: `tests/pages/plataforma-nova-clinica.test.tsx -t "mostra o erro"`

**C32** - `/plataforma/clinicas/[id]` edita o cadastro (`PATCH`) e lista os admins; convidar envia `POST .../admins`; `Reenviar convite` só em admin pendente; `Desativar` pede confirmação antes do `PATCH`; `Reativar` em admin inativo; clínica inexistente → `Clínica não encontrada`
Proof: `tests/pages/plataforma-clinica.test.tsx -t "edita o cadastro"`
Proof: `tests/pages/plataforma-clinica.test.tsx -t "ações dos admins"`
Proof: `tests/pages/plataforma-clinica.test.tsx -t "clínica inexistente"`

**C33** - Configurações mostra e envia `Telefone/WhatsApp de contato` e `E-mail de contato`
Proof: `tests/pages/staff-operations.test.tsx -t "contato da clínica"`

**C34** - Adoção do `@still-void/ui` nas telas novas
Proof: `npm run check:sv`

### S7 - E2E e documentação · 8 arquivos · 60 KB · ~15k

**C35** - Pela tela, o super_admin cria uma clínica, cai no detalhe com o admin `Aguardando primeiro acesso`, e a lista mostra a clínica
Proof: `e2e/plataforma.spec.ts -g "cria clínica pela tela"`

**C36** - A suíte E2E roda com a `legacy-clinic` completada pelo super_admin antes do convite, nas duas configs
Proof: `npx playwright test`
Proof: `npm run build && npx playwright test -c playwright.prod.config.ts`

**C37** - `docs/domains/acesso/README.md` descreve cadastro de clínica, gate do convite, gestão de admins e contato na Configuração; `CONTEXT.md` lista o contato da clínica e o cadastro pela plataforma; `check:docs` passa
Proof: `tests/docs/super-admin-docs.test.ts -t "cadastro de clínicas"`
Proof: `npm run check:docs`

## Swept

- validation: C2–C4, C9, C17, C25 (ação), C28
- failure modes: C11, C12, C16, C17, C25
- idempotency: C10 (repetir a criação → `400`, sem 2ª clínica); C22 (reenvio invalida o link anterior - `IssueAuthToken` existente)
- authorization: C15 (varredura por família), C20/C25 (só `company_admin` daquela clínica), C29
- concurrency: C10 (corrida no CNPJ); convite repetido já é o C20 do B1
- data lifecycle: n/a - nada é removido; desativar mantém a conta (ACE-RN-11)
- dependency failure: C12, C22 (`delivered: false`)
- state transitions: admin ativo ↔ inativo C23/C24; `adminStatus` derivado C14; cadastro completo ↔ incompleto C5/C21
- observability: C13, C19, C26

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| campos obrigatórios da criação (5) | `name` · `cnpj` · `contactPhone` · `contactEmail` · `adminEmail` - table-driven em C9; os 4 da clínica também em C2 | - |
| formas de CNPJ (6) | pontuado C3 · só dígitos C3 · alfanumérico C3 · 13 car. C3 · 15 car. C3 · letra no DV C3 | - |
| `adminStatus` (3) | `none` · `pending` · `active` - C14 (aplicação, table-driven) | - |
| ações de admin (3) | `resend-invite` C22 · `deactivate` C23 · `reactivate` C24; auditoria das 3 em C26 | - |
| contas que não são alvo (3) | atendente da clínica · admin de outra · inexistente - C25 | - |
| caminhos de escrita do CNPJ (3) | criação C10 · `PATCH` plataforma C18 · `PUT clinic-info` C28 | - |
| rótulos do estado do admin na tela (3) | `Sem admin` · `Aguardando primeiro acesso` · `Ativo` - C30 | - |
| suítes E2E (2 configs) | dev e prod em C36 | - |

- Claims naming a status code, route or response shape: C7–C29 - cada uma tem proof que chama o handler
- Nenhuma outra check afirma mais do que o caso que a proof exercita

## Handoff

Lote único: S1–S7 somam ~76k de leitura (`wc -c`/4 sobre os arquivos tocados), abaixo de 150k; nada a passar adiante.
