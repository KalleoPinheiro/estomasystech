# Revisão pré-produção — P1 restantes (#194, #195, #196, #206)

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [#194](https://github.com/KalleoPinheiro/estomasystech/issues/194) - sessão não revogável; decisão do dono (2026-09-26): **`session_version`** em `user_accounts`, incrementado em logout, troca/reset de senha, mudança de papel e desativação, comparado no check de 60 s do proxy, vale para portal, cache por `(subject, clinicId)`, **sem** renovação deslizante
- [#195](https://github.com/KalleoPinheiro/estomasystech/issues/195) - cifra acoplada ao `AUTH_SECRET`; decisão: **chave dedicada + tudo** — `DATA_ENCRYPTION_KEY` versionada, leitura do legado, cifra de anamnese e de todos os textos clínicos livres, migração idempotente executável em produção, SSE obrigatório no S3
- [#196](https://github.com/KalleoPinheiro/estomasystech/issues/196) - portal por e-mail mutável; decisão: **FK, login não muda** — `user_accounts.patient_id/partner_id`, portal resolve pela FK, trocar o e-mail do cadastro não altera a conta, migração vincula pelo e-mail atual e lista órfãs
- [#206](https://github.com/KalleoPinheiro/estomasystech/issues/206) - runbook; decisão: **Vercel + Supabase**, deixando preparado também **VPS + docker compose**
- Mapa pai: [#183](https://github.com/KalleoPinheiro/estomasystech/issues/183) · sem design de tela vinculante

## Out of scope

- Renovação deslizante da sessão (#194) - o dono escolheu `session_version` sem deslizante
- Camada 2 (`requireStaffSession`) checar revogação (#194) - segue a limitação documentada: guarda síncrona em ~75 handlers
- Fluxo de **mudança de papel/profissional** de conta (#194) - não existe hoje nenhum caminho que altere `role`/`professionalId`; a ADR registra que qualquer mutador futuro precisa chamar `revokeSessions`
- Botão "Criar acesso ao portal" dentro da ficha do paciente (#196) - o vínculo nasce no formulário de contas de `/configuracoes`, que já é o ponto de criação de contas
- Cifra de `follow_ups.reason`, `appointments.cancel_reason`, `invoices.*`, `commission_payouts.notes` (#195) - texto operacional/financeiro, fora da lista da issue
- Cifra na aplicação das fotos em disco local (#195) - decisão foi SSE no S3; disco local (VPS) fica com cifra do volume no host, documentada no runbook
- RPO/RTO, região do Supabase/bucket, dono do cron e do monitoramento (#206) - não respondidos; o runbook os registra como perguntas abertas (regra 5), sem inventar número
- Restauração de backup **testada e registrada** (#206) - operação humana no ambiente real; o runbook traz o procedimento e a ficha de registro
- Observabilidade (#212) - issue própria

## Landing

Toca `src/lib/auth/{session,staff-revocation,crypto}.ts` + novo `src/lib/data-cipher.ts`, `proxy.ts`, rotas de
auth/contas, domínio `UserAccount`, repositórios Drizzle e in-memory de contas e dos 11 textos clínicos,
container, use cases e rotas do portal, formulário de contas, `instrumentation.ts`, rota de lembretes, S3,
scripts, E2E (sessões forjadas de portal), docs (ADR-005, ADR-006, acesso, portal, onboarding, novo runbook).
Reaproveita o check de 60 s do proxy, `PatientPicker`, `recordAuditNow`, o padrão "coluna fora do upsert" do
estoque (#192) e `drizzle-kit migrate`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Versão de sessão (#194) | migração `0039`: `user_accounts.session_version integer NOT NULL DEFAULT 0`; claim `sv` (inteiro) no token; token sem `sv` = 0; revogado ⇔ conta existe e (`!active` ou `session_version ≠ sv`) | `sessions_valid_after timestamptz` - comparação por relógio sofre com desvio entre réplicas e não distingue dois eventos no mesmo ms |
| Incremento só atômico (#194) | `UserAccountRepository.revokeSessions(id)` = `UPDATE … SET session_version = session_version + 1`; `save` NÃO grava `session_version` no `ON CONFLICT DO UPDATE`; `updatePasswordHash` incrementa na mesma instrução | bump no domínio + `save` - dois bumps concorrentes gravariam o mesmo número e um token emitido entre eles sobreviveria à troca de senha |
| Logout revoga todas as sessões da conta (#194) | `POST /api/auth/logout` chama `revokeSessions` da conta da sessão | revogar só o token atual (jti + deny-list) - exige tabela nova; o dono escolheu versão por conta |
| Cache de revogação (#194) | chave `${clinicId ?? 'system'}|${subject}` guardando `{ isActive, sessionVersion } \| null` por 60 s; bump no mesmo processo apaga a entrada | cachear o booleano - tokens com `sv` diferentes da mesma conta dividiriam a resposta |
| Vínculo da conta de portal (#196) | migração `0040`: `user_accounts.patient_id text REFERENCES patients(id)`, `partner_id text REFERENCES partners(id)`; índices únicos parciais `(clinic_id, patient_id) WHERE patient_id IS NOT NULL` e idem parceiro; backfill `UPDATE` casando `lower(email)` na mesma empresa | e-mail no token como hoje - é a causa do bug; `patient_id` no token - ficaria velho sem novo login e duplicaria a fonte |
| Resolução do titular no portal (#196) | `resolvePortalPatient/resolvePortalPartner(services, session)` em `src/application/portal/portal-identity.ts`: conta da sessão (e-mail + empresa) com papel igual ao da sessão, ativa e vinculada → `findById` do cadastro ativo; senão `NotFoundError`. Use cases recebem `patientId`/`partnerId`, não `email` | decorar `PatientRepository.findByEmail` - esconderia a troca de semântica atrás do mesmo nome |
| Criação de conta de portal (#196) | `POST /api/accounts` exige `patientId` para `patient` e `partnerId` para `partner` (400 sem), valida o cadastro na empresa-alvo (400 "não encontrado"), e 400 se o cadastro já tem conta; e-mail de login livre (UI pré-preenche com o do cadastro) | forçar e-mail da conta = do cadastro - reintroduziria o acoplamento e impediria o cuidador de ter o próprio login |
| Chave de dados (#195) | env `DATA_ENCRYPTION_KEY` (≥ 32 chars) + opcional `DATA_ENCRYPTION_KEY_PREVIOUS` (lista separada por vírgula); chave AES = HKDF-SHA256(material, info `estomasystech/clinical-data/v1`); id = 8 hex de `sha256("estomasystech/key-id:" + material)`; payload `v1.<keyId>.<iv>.<tag>.<ct>` | número de versão digitado pelo operador (`KEY_V2=`) - erro de numeração vira dado ilegível; o id derivado não erra |
| Leitura tolerante (#195) | `decrypt`: `v1.` → keyring por id (id desconhecido lança); formato legado `iv(16).tag(22).ct` → `sha256(AUTH_SECRET)`; qualquer outro valor → devolve como está (texto legado em claro) | lançar em texto em claro (hoje) - a ficha dá 500 entre o deploy e a migração |
| Chave obrigatória em produção (#195) | `NODE_ENV=production` sem `DATA_ENCRYPTION_KEY` → `getRepositories` lança com mensagem; fora de produção cai em chave de desenvolvimento derivada de `AUTH_SECRET` com aviso | cair no `AUTH_SECRET` também em produção - mantém o acoplamento que a issue manda desfazer |
| Recifra (#195) | `npm run data:reencrypt` → `scripts/reencrypt-clinical-data.ts` → `reencryptClinicalData(db, cipher)` em `src/infrastructure/persistence/drizzle/reencrypt-clinical-data.ts`; pula valor já cifrado com a chave atual; substitui `scripts/encrypt-clinical-fields.ts` | endpoint HTTP administrativo - superfície nova de ataque para uma operação rara |
| SSE das fotos (#195) | `PutObject` com `ServerSideEncryption` = `S3_SSE` (`AES256` padrão, `aws:kms`, ou `provider` = sem cabeçalho para provedor que já cifra e rejeita o cabeçalho) | sempre `AES256` fixo - alguns S3-compatíveis rejeitam o cabeçalho |
| Fuso na Vercel (#206) | `instrumentation.ts`: se o fuso do processo ≠ `APP_TIMEZONE`, grava `process.env.TZ = APP_TIMEZONE` e só então verifica (falha se ainda divergir) | exigir `TZ` no ambiente - `TZ` é reservado na Vercel e as funções rodam em UTC: o app nem subiria |
| Cron na Vercel (#206) | `GET /api/reminders/run` com `Authorization: Bearer $CRON_SECRET` (formato do Vercel Cron) além do `POST` + `x-cron-secret`; `vercel.json` com `crons` | só POST - o Vercel Cron só faz GET |
| Foto em disco na Vercel (#206) | com `VERCEL` definido e sem `PHOTO_STORAGE=s3`, `buildPhotoStorage` devolve `UnavailablePhotoStorage`, que lança com mensagem ao gravar/ler/remover | lançar na montagem (forma original desta linha) - os serviços são montados a cada requisição, então login e agenda cairiam junto; deixar o disco local - sistema de arquivos efêmero, foto some |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"` (título do `it`), exceto onde indicado.

### S1 - Revogação de sessão por versão (#194) · 13 arquivos · 76 KB · ~19k

**C1** - Token carrega `sv`; token sem `sv` é lido com versão 0
Proof: `tests/lib/auth.test.ts -t "session version claim"`

**C2** - Sessão cuja versão difere da conta é revogada; igual segue válida
Proof: `tests/lib/staff-revocation.test.ts -t "version mismatch revokes"`

**C3** - Conta `patient` e `partner` inativa é revogada (antes só staff)
Proof: `tests/lib/staff-revocation.test.ts -t "portal account deactivated is revoked"`

**C4** - Cache separa a mesma conta em empresas diferentes
Proof: `tests/lib/staff-revocation.test.ts -t "cache keyed by clinic"`

**C5** - Subject sem conta segue válido (semântica de deny-list mantida)
Proof: `tests/lib/staff-revocation.test.ts -t "unknown subject stays valid"`

**C6** - Logout incrementa `session_version` da conta e o token anterior passa a ser rejeitado pelo proxy (401)
Proof: `tests/api/session-revocation.test.ts -t "logout revokes previous token"`

**C7** - Reset/definição de senha pelo link incrementa `session_version`
Proof: `tests/api/session-revocation.test.ts -t "set-password revokes sessions"`

**C8** - Troca de senha e desativação pelo `PATCH /api/accounts/:id` incrementam `session_version`
Proof: `tests/api/session-revocation.test.ts -t "admin password change revokes sessions"`
Proof: `tests/api/session-revocation.test.ts -t "deactivation revokes sessions"`

**C9** - `save` não sobrescreve `session_version` (incremento concorrente preservado)
Proof: `tests/api/session-revocation.test.ts -t "save keeps session version"`

**C10** - Login grava no token a versão atual da conta
Proof: `tests/api/session-revocation.test.ts -t "login mints current version"`

### S2 - Identidade do portal por FK (#196) · ~40 arquivos · 113 KB · ~28k

**C11** - Cenário 2 da issue: após corrigir o e-mail de A e cadastrar B com o e-mail antigo, a conta de A nunca vê dados de B (`GET /api/portal/patient` não traz B)
Proof: `tests/api/portal-identity.test.ts -t "reused email never exposes another patient"`

**C12** - Correção do e-mail do cadastro mantém o acesso da conta vinculada
Proof: `tests/api/portal-identity.test.ts -t "email correction keeps access"`

**C13** - Parceiro resolvido pela FK (mesmo cenário de reaproveitamento)
Proof: `tests/api/portal-identity.test.ts -t "partner resolved by link"`

**C14** - Conta de portal sem vínculo recebe 404 no portal
Proof: `tests/api/portal-identity.test.ts -t "unlinked account gets 404"`

**C15** - `POST /api/accounts` com papel `patient` sem `patientId` → 400; `partner` sem `partnerId` → 400
Proof: `tests/api/accounts-provisioning.test.ts -t "portal account requires link"`

**C16** - `patientId` de outra empresa ou inexistente → 400; segundo acesso para o mesmo cadastro → 400
Proof: `tests/api/accounts-provisioning.test.ts -t "portal link validated"`

**C17** - Nenhuma rota/use case do portal chama `findByEmail` de paciente/parceiro
Proof: `tests/architecture/portal-identity.test.ts -t "portal never resolves by email"`

**C18** - Migração vincula conta existente pelo e-mail atual (mesma empresa, case-insensitive) e deixa a outra órfã
Proof: `tests/infrastructure/portal-link-migration.test.ts -t "backfill links by email"`

**C19** - Relatório de órfãs lista contas `patient`/`partner` sem vínculo
Proof: `tests/infrastructure/portal-link-migration.test.ts -t "orphan report"`

**C20** - Formulário de contas: papel Paciente exige escolher o paciente e envia `patientId`
Proof: `tests/pages/configuracoes-accounts.test.tsx -t "patient account sends patientId"`

**C21** - Fluxos E2E do portal passam com contas vinculadas
Proof: `npx playwright test e2e/portal-paciente.spec.ts e2e/portal-parceiro.spec.ts` (CI job "E2E (Playwright)")

### S3 - Chave de dados dedicada e cobertura de cifra (#195) · ~20 arquivos · 71 KB · ~18k

**C22** - Payload novo tem formato `v1.<keyId>.<iv>.<tag>.<ct>` e decifra de volta
Proof: `tests/lib/data-cipher.test.ts -t "round trip v1"`

**C23** - Rotação: lê payload da chave anterior e grava com a atual
Proof: `tests/lib/data-cipher.test.ts -t "rotation reads previous writes current"`

**C24** - Payload legado `iv.tag.ct` (chave = sha256 do AUTH_SECRET) é lido
Proof: `tests/lib/data-cipher.test.ts -t "reads legacy auth secret payload"`

**C25** - Trocar o `AUTH_SECRET` não afeta dado gravado com `DATA_ENCRYPTION_KEY`
Proof: `tests/lib/data-cipher.test.ts -t "auth secret rotation does not affect data"`

**C26** - Texto em claro legado é devolvido como está; payload `v1` com id desconhecido lança
Proof: `tests/lib/data-cipher.test.ts -t "plaintext passthrough"`
Proof: `tests/lib/data-cipher.test.ts -t "unknown key id throws"`

**C27** - Produção sem `DATA_ENCRYPTION_KEY` → erro; chave < 32 caracteres → erro
Proof: `tests/lib/data-cipher.test.ts -t "production requires key"`

**C28** - Os campos clínicos da lista de Coverage (21 colunas) ficam cifrados no banco e voltam em claro pelo repositório
Proof: `tests/infrastructure/clinical-field-encryption.test.ts -t "stores ciphertext"` (table-driven)

**C29** - Recifra: texto em claro e payload da chave anterior viram payload da atual; segunda execução não altera nada
Proof: `tests/infrastructure/reencrypt-clinical-data.test.ts -t "reencrypts to current key"`
Proof: `tests/infrastructure/reencrypt-clinical-data.test.ts -t "idempotent"`

**C30** - Refresh token do Google usa a chave de dados (legado ainda lido)
Proof: `tests/api/calendar-gateway-source.test.ts -t "data key"`

**C31** - Upload S3 envia `ServerSideEncryption` conforme `S3_SSE` (padrão `AES256`; `provider` omite)
Proof: `tests/infrastructure/s3-photo-storage.test.ts -t "server side encryption"`

### S4 - Preparação Vercel/Supabase + runbook (#206) · ~12 arquivos · 27 KB · ~7k

**C32** - Processo em UTC com `APP_TIMEZONE=America/Sao_Paulo`: o alinhamento grava `TZ` e a checagem passa
Proof: `tests/lib/app-timezone.test.ts -t "aligns process timezone"`

**C33** - `GET /api/reminders/run` sem Bearer → 401; com `Bearer $CRON_SECRET` executa
Proof: `tests/api/reminders-run.test.ts -t "vercel cron bearer"`

**C34** - Na Vercel sem S3, gravar/ler/remover foto lança (montar os serviços não)
Proof: `tests/infrastructure/photo-storage-selection.test.ts -t "vercel requires s3"`

**C35** - `vercel.json` agenda `/api/reminders/run`
Proof: `tests/infrastructure/deploy-config.test.ts -t "vercel cron"`

**C36** - `docs/engineering/producao.md` existe com as seções Vercel+Supabase, VPS+compose, TLS, backup/restore, segredos/rotação, migrações, cron, primeiro acesso, perguntas abertas; linkado em `docs/README.md` e `AGENTS.md`
Proof: `tests/infrastructure/deploy-config.test.ts -t "runbook sections"`
Proof: `npm run check:docs`

**C37** - Compose e CI definem `DATA_ENCRYPTION_KEY` (produção falharia sem ela)
Proof: `tests/infrastructure/deploy-config.test.ts -t "data key in compose and ci"`

## Swept

- validation: C15, C16, C27
- failure modes: C26 (id desconhecido lança), C27, C34
- idempotency: C29 (recifra), C18 (backfill só casa `patient_id IS NULL`)
- authorization: C6–C8, C11, C14, C16; criação de conta de portal mantém a matriz de provisionamento existente
- concurrency: C9 (incremento atômico)
- data lifecycle: C18, C19, C29; texto em claro legado lido até a recifra (C26)
- dependency failure: revogação segue fail-open com log (AD-004) quando o banco falha — comportamento existente, sem mudança
- state transitions: C2, C3, C6–C8
- observability: não no escopo — erros de chave usam `logError` existente

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| eventos que incrementam versão (5) | logout C6 · reset/definição C7 · troca pelo admin C8 · desativação C8 · mudança de papel: sem caminho no código (Out of scope) | mudança de papel |
| papéis revogáveis (6) | staff (4) C2 · `patient` C3 · `partner` C3 | - |
| campos clínicos cifrados (21 colunas) | C28 table-driven: SOAP ×4, `clinical_conditions.notes`, `condition_assessments.notes`, `condition_assessments.skin_condition`, `condition_assessments.complications`, anamnese ×5, `patients.notes`, `appointments.notes`, `waitlist_entries.notes`, `condition_photos.patient_note`, `care_plan_diagnoses.related_factors`, `care_plan_diagnoses.defining_characteristics`, `outcome_evaluations.notes`, `intervention_records.notes` | - (C28 conta 21 colunas em 11 tabelas) |
| formatos lidos (4) | `v1` atual C22 · `v1` anterior C23 · legado C24 · texto em claro C26 | - |
| resolução de titular no portal (2 papéis) | paciente C11/C12 · parceiro C13 | - |
| montagens com chave de dados (4 assemblies) | `getRepositories` (C27 via `dataCipherFromEnv`) · compose C37 · CI C37 · script de recifra (usa o mesmo `dataCipherFromEnv`) | - |

- Claims com status/rota/resposta: C6, C8, C11, C14, C15, C16, C33 — cada uma com proof que chama o handler
- Nenhuma outra check afirma mais que o caso que sua proof exercita

## Handoff

S1–S4 = ~72k de leitura (piso), abaixo de 150k: **lote único**, sem troca de agente. Superfícies diferentes
(auth, portal, cifra, deploy), mas todas pequenas; a ordem S1 → S2 → S3 → S4 segue a dependência de
`user_accounts` (S1 e S2 migram a mesma tabela). Verificador fresco após o último commit, sobre
`origin/main..HEAD`.

- **Onde o lote fechou:** C1–C37 em `8927783` (S1), `ed60e45` (S2), `445fdfe` (S3) e no commit de S4
  que traz esta linha. Lote único, sem troca de agente.
- **Acertado durante o build (sem conversa nova com o dono):** C28 passou de "16 campos" para 21
  colunas — a lista original somava 19 e deixava de fora `condition_assessments.skin_condition` e
  `.complications`, textos livres da avaliação que a decisão "todos os textos clínicos livres"
  cobre; C34 e sua linha de Landing passaram de "lançar na montagem" para "lançar no uso" (a
  montagem roda a cada requisição); proofs de C35–C37 foram para o arquivo que já existia,
  `tests/infrastructure/deploy-config.test.ts`. Dois testes antigos foram substituídos porque
  afirmavam a regra que o dono mudou: "patient/partner nunca são checados" (revogação, #194) e
  "fuso divergente encerra o processo" (#205 → alinhamento para a Vercel, #206). O E2E de logout
  passou a usar sessão própria: sair revoga todas as sessões da conta e derrubaria o
  `storageState` de admin compartilhado.
- **Abandonado:** lançar em `encrypt('')` (payload sem ciphertext seria lido como texto em claro)
  — vazio segue vazio; resolver o titular do portal por claim no token — ficaria velho sem novo
  login e duplicaria a fonte.
