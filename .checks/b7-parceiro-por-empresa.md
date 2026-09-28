# B7 — Parceiro por empresa

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [#211](https://github.com/KalleoPinheiro/vitta-flow/issues/211) (corpo de 2026-09-27) - problema e os três critérios de aceite: migração troca a constraint global por índice único `(clinic_id, email)`; criação/edição tratam a violação com "Já existe parceiro com este e-mail" (nunca 500, nunca citando outra empresa); teste com duas empresas (ambas 200) e duplicado na mesma (409). `Closes #211`
- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) § Decisions, linha "Parceiro por empresa" - índice `(clinic_id, email)` + mensagem literal; reversible
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) - issue mãe (`Refs #214`); item B7 da checklist marcado depois do merge
- Sem tela nova: a UI de `/parceiros` já exibe o `error` da API (`ErrorAlert`)

## Out of scope

- Unicidade de e-mail de **paciente** (`uq_patients_clinic_email` já por empresa; a mensagem de paciente continua `Já existe paciente com o email …`, 400) - fora da #211
- Rótulo `Email (usado no login com Google)` do formulário de parceiro (resquício do ADR-004) - não pedido; vira sugestão de tarefa
- Vínculo de conta de portal a parceiro de outra clínica - `uq_user_accounts_clinic_partner` já é por empresa

## Landing

Toca `schema.ts` + migração `0046`, `src/application/partners/{create,update}-partner.ts` e um módulo novo
`src/application/partners/partner-email.ts`, testes (`tests/application/partners.test.ts`,
`tests/api/partner-tenant-isolation.test.ts`, teste de migração novo), `e2e/equipe.spec.ts`, docs do domínio.
Reaproveita `isUniqueViolation(error, constraint)` (`src/lib/db-errors.ts`) e o padrão de
`src/application/platform/clinic-cnpj.ts` (checagem prévia + violação do índice vira a mesma mensagem).

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Índice de unicidade | migração `0046_partners-email-per-clinic.sql`: `ALTER TABLE "partners" DROP CONSTRAINT "partners_email_unique"`; `CREATE UNIQUE INDEX "uq_partners_clinic_email" ON "partners" USING btree ("clinic_id","email")`; no schema, `uniqueIndex('uq_partners_clinic_email').on(table.clinicId, table.email)` | manter a constraint global - é o defeito da #211 |
| Normalização do e-mail | como `patients`/`user_accounts`: o domínio grava `trim().toLowerCase()` (`validatePersonContact`), o índice é sobre a coluna crua | índice sobre `lower(email)` - `patients` e `user_accounts` não usam; com a normalização na escrita seria redundante, e divergir entre tabelas cria dois jeitos de garantir a mesma regra |
| Dados existentes | a migração não checa nem saneia: `(clinic_id, email)` é estritamente mais fraca que `email` global, então nenhuma linha que já passou pela constraint antiga viola o índice novo | pré-checagem/saneamento - não há estado possível que a faça falhar |
| Status e mensagem do duplicado | `ConflictError('Já existe parceiro com este e-mail')` → **409**, na criação e na edição; a mensagem não repete o e-mail nem cita empresa. Constante `DUPLICATE_PARTNER_EMAIL_MESSAGE` em `partner-email.ts` | manter `ValidationError` (400) com o e-mail na mensagem - o critério 3 fixa 409 e a mensagem literal |
| Corrida (duas criações/edições simultâneas na mesma empresa) | as duas passam pela checagem prévia (`findByEmail`, já escopada pela empresa); `uq_partners_clinic_email` deixa só uma gravar; a outra: `isUniqueViolation(error, 'uq_partners_clinic_email')` → o mesmo `ConflictError` 409; qualquer outro erro é relançado | tratar só a checagem prévia - a corrida viraria 500; mapear qualquer 23505 - esconderia violação de outro índice (ex.: PK) |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`; E2E: `npx playwright test <spec> -g "<nome>"`.

### S1 - Parceiro único por empresa · ~9k

**C1** - Migração 0046: o mesmo e-mail de parceiro grava em duas clínicas distintas no banco
Proof: `npx vitest run tests/infrastructure/partners-email-migration.test.ts -t "duas clínicas"`

**C2** - Migração 0046: o mesmo e-mail duas vezes na mesma clínica é recusado com SQLSTATE `23505` e constraint `uq_partners_clinic_email`
Proof: `npx vitest run tests/infrastructure/partners-email-migration.test.ts -t "mesma clínica"`

**C3** - `POST /api/partners` com o mesmo e-mail na clínica A e na clínica B: as duas respostas 200
Proof: `npx vitest run tests/api/partner-tenant-isolation.test.ts -t "duas empresas"`

**C4** - `POST /api/partners` duplicado na mesma clínica (inclusive com maiúsculas) responde 409 com `error` exatamente `Já existe parceiro com este e-mail`
Proof: `npx vitest run tests/api/partner-tenant-isolation.test.ts -t "duplicado na mesma empresa"`

**C5** - `PUT /api/partners/:id` trocando o e-mail para o de outro parceiro da mesma clínica responde 409 com `Já existe parceiro com este e-mail`
Proof: `npx vitest run tests/api/partner-tenant-isolation.test.ts -t "edição para e-mail de outro parceiro"`

**C6** - `PUT /api/partners/:id` trocando o e-mail para um que só existe em outra clínica responde 200
Proof: `npx vitest run tests/api/partner-tenant-isolation.test.ts -t "e-mail que só existe em outra empresa"`

**C7** - Corrida na criação: a checagem prévia não acha nada e a gravação viola `uq_partners_clinic_email` → `ConflictError` com a mensagem literal
Proof: `npx vitest run tests/application/partners.test.ts -t "corrida na criação"`

**C8** - Corrida na edição: idem para `UpdatePartner`
Proof: `npx vitest run tests/application/partners.test.ts -t "corrida na edição"`

**C9** - Erro de gravação que não é violação de `uq_partners_clinic_email` (outro 23505, erro genérico) é relançado sem virar `ConflictError`
Proof: `npx vitest run tests/application/partners.test.ts -t "outra violação"`

**C10** - UI: cadastrar parceiro com e-mail já usado na mesma empresa mostra `Já existe parceiro com este e-mail` e mantém o formulário aberto
Proof: `npx playwright test e2e/equipe.spec.ts -g "bloqueia cadastro de parceiro com email já usado"`

**C11** - Doc do domínio registra a regra (e-mail do parceiro único por empresa, 409)
Proof: `npm run check:docs` + `grep -n "EQP-RN-05" docs/domains/equipe-parceiros/README.md`

## Swept

- validation: e-mail inválido segue `validatePersonContact` (400), inalterado; C4 cobre maiúsculas. Espaços nas bordas: o `z.string().email()` da rota já responde 400 `Email inválido` antes do caso de uso (comportamento existente) — o C4 escrito antes do build dizia "maiúsculas/espaços"; corrigido durante o build, porque espaços não chegam à checagem de duplicado pela API
- failure modes: C7, C8, C9
- idempotency: n/a - `POST` repetido é justamente o duplicado de C4
- authorization: `requireStaffSession` + `writeScope`/`sessionScope` já nas rotas; nada muda
- concurrency: C7, C8 (índice é a garantia final)
- data lifecycle: migração sem saneamento (Landing, "Dados existentes"); parceiro inativo continua ocupando o e-mail na empresa, como hoje
- dependency failure: C9 (erro do banco não mapeado vira 500 pelo `handleRequest`, como hoje)
- state transitions: n/a
- observability: n/a - nenhum log novo; 409 é resposta esperada

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| operação × (mesma empresa, outra empresa) (4) | criar/mesma C4 · criar/outra C3 · editar/mesma C5 · editar/outra C6 | - |
| caminho do duplicado (2 por operação) | checagem prévia C4, C5 · violação do índice C7, C8 | - |
| erro de gravação (3) | `uq_partners_clinic_email` C7 · outro 23505 C9 · genérico C9 | - |

- Claims naming a status code, route or response shape: C3, C4, C5, C6 - each proven at the route handler
- C1, C2 são provados no banco (pglite com todas as migrações), não pelo schema TS

## Handoff

S1 ≈ 9k (partners ~2k, rotas ~2k, testes ~4k, migração/schema recortes ~1k) — um lote só, sem handoff.
