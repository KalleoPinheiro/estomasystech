# Revisão pré-produção P0+P1 — Verification

**Verdict**: PASS
**Profile**: light (AGENTS.md não declara perfil `tlc-implement`)
**Diff range**: 308c2e0..6e2aa89 (fix do round 2: f35948a..6e2aa89)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Escopo do round 2: o diff do fix (`f35948a..6e2aa89`: `src/instrumentation.ts`, `src/lib/app-timezone.ts`,
5 arquivos de teste, checklist) mais todo veredito não-PASS do round 1 (C3, C18, C19, C20, C21, caminho do
C41, alcance dos guards C16/C34, redação de C27/C38). Todos os proofs vitest rodaram de novo em 6e2aa89.
No perfil light não rodam: passo 1 (sem fonte vinculante), junção de `Coverage`, `Test policy`, injeção de
falhas. As mutações abaixo foram pedidas pelo coordenador para confirmar o C21.

## Binding sources — carried from f35948a

Nenhuma fonte vinculante (perfil light; "Sem design de tela vinculante"). Passo 1 não se aplica.

## Findings remanescentes (ranked, nenhum bloqueante)

1. **O guard C34 ainda tem pontos cegos.** Testei a regex `LISTING` (`tests/pages/patient-selectors-sweep.test.ts:17`) com node:
   ela pega `useApiQuery('/api/patients')` e `fetch('/api/patients?limit=500')`, mas **deixa passar**
   `useApiQuery<Paged<PatientDto>>('/api/patients')` (genérico aninhado: `<[^>]*>` para no primeiro `>`),
   `` useApiQuery(`/api/patients${q}`) `` (template literal, a mesma forma usada em `(staff)/pacientes/page.tsx:155`)
   e URL passada por variável. O código de hoje está limpo; é um guard de regressão parcial.
2. **`tests/application/invoice-actions-lock.test.ts:24-25` cria o spy `plain` (findById) e nunca o verifica.** O teste
   afirma `locked).toHaveBeenCalledWith(id)` (:61), mas não `plain).not.toHaveBeenCalled()`. Uma ação que
   lesse pelos dois caminhos passaria. A mutação que troca um pelo outro é pega (ver Faults).
3. **O C21 prova que o SQL do lock é emitido, não a contenção real.** `drizzle-invoice-lock.test.ts:52` afirma que o `SELECT`
   de `invoices` termina em `for update`. Junto com a prova das 4 ações e o teste de rota, isso cobre a cadeia.
   Um teste com duas conexões num Postgres real continua ausente; é aceitável para a suíte em PGlite.
4. **Carregado do round 1, fora do diff:** `NullEmailGateway`/`NullMessagingGateway`
   (`src/application/ports/email-gateway.ts:21`, `messaging-gateway.ts:13`) fazem `console.info` do destinatário e do corpo. Vale issue própria.

Resolvidos neste round: C3 (SQLSTATE e constraint afirmados), C18/C19 independentes, C20 com proof de rota,
C21 com mutante morto, caminho do C41, guard C16 ampliado, redação de C27/C38, aviso de Edge Runtime no build.

## Checks

Rodada única do vitest em 6e2aa89: 28 arquivos, `-t` com alternação de todos os títulos (incluindo os novos),
`--reporter=verbose` → **51 passed | 104 skipped**, exit 0. Cada título abaixo apareceu com ✓.
Rodadas isoladas (`-t` com um título só): C18 ✓, C19 ✓, C20 (rota) ✓, "Admin sem profissional…" ✓, C3 ✓.

| Check | Proof run | Evidence | Result | Marca |
|---|---|---|---|---|
| C1 | lote ✓ | `tests/api/appointment-overlap-per-clinic.test.ts:88-89` - `first.status).toBe(200)`, `second.status).toBe(200)` | PASS | verified at 6e2aa89 |
| C2 | lote ✓ | `appointment-overlap-per-clinic.test.ts:106-107` - `second.status).toBe(409)` | PASS | verified at 6e2aa89 |
| C3 | lote ✓; isolado ✓ | `appointment-overlap-per-clinic.test.ts:122-130` - outra empresa `resolves.toBeDefined()`; mesma empresa `rejects.toMatchObject({ cause: { code: '23P01', constraint: 'appointments_no_overlap' } })` | PASS | verified at 6e2aa89 (corrigido) |
| C4 | lote ✓ | `tests/infrastructure/deploy-config.test.ts:30-33` - 1 porta, `"127.0.0.1:${POSTGRES_PORT:-5432}:5432"` | PASS | verified at 6e2aa89 |
| C5 | lote ✓ | `deploy-config.test.ts:40-44` - `${POSTGRES_PASSWORD:?` no db e no `DATABASE_URL` | PASS | verified at 6e2aa89 |
| C6 | lote ✓ | `deploy-config.test.ts:50-51` - `- uploads:/app/uploads` + volume raiz | PASS | verified at 6e2aa89 |
| C7 | lote ✓ | `deploy-config.test.ts:61-62` - `user).toBeGreaterThan(mkdir)` | PASS | verified at 6e2aa89 |
| C8 | lote ✓ | `deploy-config.test.ts:68-69` - `^ENV TZ=America/Sao_Paulo$`, `^ENV APP_TIMEZONE=America/Sao_Paulo$` | PASS | verified at 6e2aa89 |
| C9 | lote ✓ | `deploy-config.test.ts:74-89` - lista literal das 8 variáveis | PASS | verified at 6e2aa89 |
| C10 | lote ✓ | `deploy-config.test.ts:96-99` - `fetch('http://127.0.0.1:3000/api/auth/providers')` | PASS | verified at 6e2aa89 |
| C11 | lote ✓ | `tests/infrastructure/db-retry.test.ts:40-47` - `rejects.toThrow()`, cache `toBeUndefined()`, depois `toBeDefined()` | PASS | verified at 6e2aa89 |
| C12 | lote ✓ | `db-retry.test.ts:60` - `second).toBe(first)` | PASS | verified at 6e2aa89 |
| C13 | lote ✓ | `db-retry.test.ts:70-74` - `listenerCount('error')).toBe(1)`; ligação em `db.ts:85` | PASS | verified at 6e2aa89 |
| C14 | lote ✓ | `tests/lib/log-error.test.ts:38-45` - sem e-mail, nome ou `insert into`; `code: '23505'` | PASS | verified at 6e2aa89 |
| C15 | lote ✓ | `tests/api/patient-error-log-redaction.test.ts:37-43` - `[200, 500]`, sem e-mail/nome/telefone, `toContain('23505')` | PASS | verified at 6e2aa89 |
| C16 | lote ✓ | `tests/lib/log-error-architecture.test.ts:13-15` `FORBIDDEN` (`console.error`, `console['error']`, `{ error } = console`); `:35` `offenders).toEqual([])` | PASS | verified at 6e2aa89 (guard ampliado) |
| C17 | lote ✓ | `tests/api/care-plan-authorship.test.ts:146-147` - `status 200`, `professionalId).toBe(drA)` com `drB` no corpo | PASS | verified at 6e2aa89 |
| C18 | lote ✓; **isolado ✓** | `care-plan-authorship.test.ts:187` - `professionalId).toBe(drA)`; fixture movida para `beforeAll` | PASS | verified at 6e2aa89 (corrigido) |
| C19 | lote ✓; **isolado ✓** | `care-plan-authorship.test.ts:208` - `professionalId).toBe(drA)` | PASS | verified at 6e2aa89 (corrigido) |
| C20 | lote ✓ (2 proofs); isolado ✓ | `care-plan-authorship.test.ts:165-166` - `POST /api/patients/:id/evolutions` com `drB` → `status 200`, `professionalId).toBe(drA)`; `tests/lib/session-professional.test.ts:47` `toBeNull()` | PASS | verified at 6e2aa89 (corrigido) |
| C21 | lote ✓ (rota + lock + 4 ações) | `tests/api/invoice-concurrent-payment.test.ts:67-79` - um 200, outro 4xx, `payments).toHaveLength(1)`, `paidCents).toBe(10000)`; `tests/infrastructure/drizzle-invoice-lock.test.ts:52` - `invoiceSelect).toMatch(/for update$/i)`; `tests/application/invoice-actions-lock.test.ts:61` - `locked).toHaveBeenCalledWith(id)` (pagar, parcial, desconto, cancelar) | PASS (mutante morto) | verified at 6e2aa89 (corrigido) |
| C22 | lote ✓ | `tests/infrastructure/drizzle-supply-stock.test.ts:42-43` - `stockQty).toBe(7)` | PASS | verified at 6e2aa89 |
| C23 | lote ✓ | `tests/pages/invoice-payment-in-flight.test.tsx:38-41` - `onPay` 1x, todos `toBeDisabled()` | PASS | verified at 6e2aa89 |
| C24 | lote ✓ | `tests/proxy.test.ts:130-137` - recepção 429, consultório no mesmo IP passa; chave `src/proxy.ts:57` | PASS | verified at 6e2aa89 |
| C25 | lote ✓ | `proxy.test.ts:153` - `blocked.status).toBe(429)` | PASS | verified at 6e2aa89 |
| C26 | lote ✓ | `tests/lib/client-ip.test.ts:67-68` - `toHaveBeenCalledTimes(1)`, `/x-forwarded-for/` | PASS | verified at 6e2aa89 |
| C27 | lote ✓ (2); arquivo inteiro 6/6 ✓ | `tests/lib/app-timezone.test.ts:17-19` - `toThrow(/Fuso do processo \(UTC\) difere de APP_TIMEZONE \(America\/Sao_Paulo\)/)`; `:27-30` - `not.toThrow()` + aviso; `process.exit(1)` via `register()` → `enforceProcessTimeZone` (`src/lib/app-timezone.ts:37-43`) coberto em `:57-60` | PASS | verified at 6e2aa89 (redação corrigida; src tocado) |
| C28 | lote ✓ | `tests/domain/business-hours-timezone.test.ts:28-39` - 12:00Z `not.toThrow()`, 21:30Z `toThrow(ValidationError)` | PASS | verified at 6e2aa89 |
| C29 | lote ✓ | `tests/domain/reminder-content.test.ts:66` - `toContain('17/07/2026 às 09:00')` | PASS | verified at 6e2aa89 |
| C30 | lote ✓ | `tests/application/send-reminders.test.ts:170-173` - `sent).toBe(1)`, `17/07/2026`, `09:00` | PASS | verified at 6e2aa89 |
| C31 | lote ✓ | `tests/components/document-frame.test.tsx:212-214` - `'03 de setembro de 2026'`, `'23:30'`, sem `'04 de setembro'` | PASS | verified at 6e2aa89 |
| C32 | lote ✓ | `tests/components/patient-picker.test.tsx:51-58` - `'/api/patients?search=Zuleica&limit=20'`, valor `p-150` | PASS | verified at 6e2aa89 |
| C33 | lote ✓ | `tests/api/patient-search-beyond-first-page.test.ts:48-69` - 1ª página 100 sem o 150; busca acha; agendamento 200 | PASS | verified at 6e2aa89 |
| C34 | lote ✓ | `tests/pages/patient-selectors-sweep.test.ts:17-18` `LISTING`; `:38` `offenders).toEqual([])` | PASS (guard parcial, finding 1) | verified at 6e2aa89 |
| C35 | Playwright (sandbox config) → 3 passed (360/390/768) | `e2e/layout-mobile-first.spec.ts:623` - `t.scroll).toBeLessThanOrEqual(t.client)`; `:627` sem sobreposição | PASS | carried from f35948a (o fix não toca `e2e/` nem as telas) |
| C36 | lote ✓ | `tests/pages/staff-nav-role.test.tsx:70-73` - `toEqual(['Dashboard','Agenda','Pacientes','Parceiros'])` + 9 ausentes | PASS | verified at 6e2aa89 |
| C37 | lote ✓ | `staff-nav-role.test.tsx:80-84` - `Triagem` presente, 7 administrativos ausentes | PASS | verified at 6e2aa89 |
| C38 | lote ✓ | `tests/pages/dashboard-role.test.tsx:81-95` - consultas e retornos visíveis, sem `alert`, nenhuma chamada a `/api/summary`, `/api/supplies`, `/api/photos/triage` (bate com a nova redação) | PASS | verified at 6e2aa89 (redação corrigida) |
| C39 | lote ✓ | `tests/pages/patient-record-role.test.tsx:74-77` - sem `tab`, rotas clínicas `toEqual([])` | PASS | verified at 6e2aa89 |
| C40 | lote ✓ | `tests/proxy.test.ts:282-285` - `403`, `'Seu papel não tem acesso a este recurso'` | PASS | verified at 6e2aa89 |
| C41 | lote ✓ (caminho do checklist agora correto) | `tests/pages/staff-nav-role.test.tsx:109-116` - `'Seu papel não tem acesso a esta tela.'`, sem `alert`, `pageFetch).not.toHaveBeenCalled()` | PASS | verified at 6e2aa89 (corrigido) |
| C42 | lote ✓ | `tests/pages/staff-layout-client.test.tsx:131-132` - `not.toHaveClass('truncate')`, `toHaveClass('break-all')` | PASS | verified at 6e2aa89 |
| C43 | lote ✓ | `tests/infrastructure/ci-workflow.test.ts:30-32` - `run: npm run build`, sem `continue-on-error` | PASS (textual) | verified at 6e2aa89 |
| C44 | lote ✓ | `ci-workflow.test.ts:42-47` - `docker compose build`, `docker-smoke.sh` com providers e `/app/uploads/.smoke` | PASS (textual) | verified at 6e2aa89 |
| C45 | lote ✓ | `ci-workflow.test.ts:57-71` - `playwright.prod.config.ts` após o build, `npm run start`, 5 specs incl. CSP | PASS (textual) | verified at 6e2aa89 |

**Proven: 45/45.**

## Swept — verified at 6e2aa89

| Row | Constraint citada | No código |
|---|---|---|
| state transitions: C21 (regra de domínio existente) | pagamento > saldo rejeitado | sim - `src/domain/billing/invoice.ts:122-124` |
| validation: C17-C20 | autoria pela sessão | sim - `records/route.ts:39`, `evaluations/route.ts:41`, `care-plans/route.ts:74`, `evolutions/route.ts:76` |
| dependency failure: C13 | listener no pool real | sim - `db.ts:85` |
| failure modes: C27 | encerra em produção | sim - `src/instrumentation.ts:8-11` → `src/lib/app-timezone.ts:37-43` (`process.exit(1)`) |

## Faults injected — verified at 6e2aa89

Worktrees descartáveis (`git worktree add --detach`, sem `git stash`); porcelain do tree real idêntico antes e depois (`PORCELAIN_UNCHANGED`).

| Mutation | Location | Covering proof | Killed |
|---|---|---|---|
| removido `.for('update')` de `findByIdForUpdate` | `src/infrastructure/persistence/drizzle/drizzle-invoice-repository.ts:163` | `drizzle-invoice-lock.test.ts` "C21 findByIdForUpdate trava…" | **sim** - `expected 'select "id", … ' to match /for update$/i` (o teste de rota continua verde, como no round 1) |
| `PayInvoice` lê com `findById` em vez de `findByIdForUpdate` | `src/application/billing/pay-invoice.ts:15` | `invoice-actions-lock.test.ts` "pagar lê a fatura com findByIdForUpdate" | **sim** - × pagar; as outras 3 ações ✓ |

## Gate — verified at 6e2aa89

- vitest (proofs, lote único): 51 passed, 0 failed (104 skipped por `-t`)
- vitest isolado: C3, C18, C19, C20 (rota), "Admin sem profissional…" - 1 passed cada
- `npm run build` - exit 0; o log (142 linhas) não traz aviso de Edge Runtime nem menção a `instrumentation` (o aviso do round 1 sumiu com a extração para `enforceProcessTimeZone`)
- `npm run typecheck` - exit 0
- `npm run lint` - exit 0 (1 info preexistente em `tests/docs/structure.test.ts:72`, fora do diff)
- `npm run check:sv`, `npm run check:docs` - carried from f35948a (o fix não toca JSX nem `docs/`)
- `npm run test:coverage` - exit 0; 241 files, 3547 passed, 0 failed; statements 96.33%, branches 91.53%, funcs 95.82% (≥ 90%)
- Playwright C35 - carried from f35948a
- Nenhum commit; tree limpo, a não ser por este relatório.
