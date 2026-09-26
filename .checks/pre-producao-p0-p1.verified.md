# Revisão pré-produção P0+P1 — Verification

**Verdict**: FAIL
**Profile**: light (AGENTS.md não declara perfil `tlc-implement`)
**Diff range**: 308c2e0..f35948a (HEAD, branch feature/trusting-johnson-yvvp0j)
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Passos que rodaram: 2 (rodar todos os proofs), 3 (assertion + Swept). Não rodaram por perfil: 1 (sem
fonte de design vinculante; #197/#198/#199 ajustam telas existentes), junção de `Coverage`, `Test
policy` (artefato não tem a seção), injeção de falhas. Um único experimento de mutação foi feito fora
do protocolo para confirmar uma suspeita sobre C21 (ver Findings, item 1).

## Binding sources

Nenhuma fonte vinculante (perfil light; o checklist declara "Sem design de tela vinculante"). Passo 1 não se aplica.

## Findings (ranked)

1. **C21 não prova o `SELECT … FOR UPDATE` (mutante sobrevive).** Em worktree descartável, removi
   `.for('update')` de `src/infrastructure/persistence/drizzle/drizzle-invoice-repository.ts:163` e
   `tests/api/invoice-concurrent-payment.test.ts` continuou verde (1 passed). A suíte roda em PGlite
   (uma conexão só; o `transaction` serializa os corpos por mutex), então o teste prova só que a ação roda
   dentro de `transactions.run`. O guard que importa em Postgres real (READ COMMITTED, duas conexões do pool)
   é exatamente o lock, e nenhum proof o exercita. Worktree removido; porcelain do tree real inalterado.
2. **C18 e C19 falham como proof literal.** O comando do checklist
   (`npx vitest run tests/api/care-plan-authorship.test.ts -t "C18 execução…"`) sai com 1 failed:
   `interventionId`/`outcomeId` são preenchidos dentro do `it('C17 …')`
   (`care-plan-authorship.test.ts:108-139`), então C18/C19 (e o teste de admin) só passam se C17 rodar
   antes no mesmo processo. Passam no lote completo, falham isolados. Testes acoplados por ordem.
3. **C41: caminho do proof errado no checklist.** `tests/pages/role-page-guard.test.tsx` não existe
   (`ls` → No such file). O teste está em `tests/pages/staff-nav-role.test.tsx:92` e passa. O comando
   literal do checklist acharia zero arquivos.
4. **C3: assertion fraca.** `await expect(insert('overlap-raw-a2', …)).rejects.toThrow()`
   (`appointment-overlap-per-clinic.test.ts:125-127`) aceita qualquer erro; não fixa SQLSTATE `23P01` nem o
   nome `appointments_no_overlap`. A metade que importa para #187 (outra empresa aceita,
   `resolves.toBeDefined()`, :122-124) está correta.
5. **C20: o proof não afirma o claim.** Claim: "a evolução SOAP usa a mesma função extraída". O teste só
   verifica `resolveSessionProfessionalId` → `null` para conta sem vínculo (`session-professional.test.ts:47`).
   O uso fica provado por código (`src/app/api/patients/[id]/evolutions/route.ts:10,76`) e pelo teste de rota
   já existente `tests/api/professional-patient-link-on-appointment-evolution.test.ts:117`, não pelo proof citado.
6. **C16 / C34: guards de arquitetura estreitos.** C16 casa só `/console\.error\s*\(/`
   (`log-error-architecture.test.ts:30`): `const log = console.error`, `console['error']` ou
   `console.warn(err)` passam batido. C34 casa só `useApiQuery<…>('/api/patients…` com genérico
   (`patient-selectors-sweep.test.ts:29`): `useApiQuery('/api/patients')` sem `<T>`, `fetch(…)` ou
   `apiFetch(…)` não são pegos. Hoje o código está limpo (conferi com `rg` mais amplo: única listagem sem
   `search` é `(staff)/pacientes/page.tsx:155`), mas os guards não seguram regressão.
7. **Precisão (checklist).** C27 depende do processo estar em UTC (`app-timezone.test.ts:16`
   `expect(processTimeZone()).toBe('UTC')`), garantido por `vitest.config.mts:20`; ok na suíte, mas o teste
   quebra se rodado fora do config. C38 afirma "quando `/api/summary` responde 403", mas a implementação
   simplesmente não chama `/api/summary` e o teste afirma isso (`dashboard-role.test.tsx:93`) — mais forte que
   o claim, sem o cenário 403. C43–C45 são checagens textuais do workflow; a prova real é a execução no CI.
8. **Fora do escopo, observado (#202 correlato).** `NullEmailGateway`/`NullMessagingGateway`
   (`src/application/ports/email-gateway.ts:21`, `messaging-gateway.ts:13`) fazem `console.info` do
   destinatário e do corpo da mensagem. Uma instância sem canal configurado grava e-mail/telefone e texto do
   lembrete no log. Preexistente, fora do diff; vale issue própria.
9. **Aviso de build.** Ao subir o dev server o Next avisa que `process.exit` em `src/instrumentation.ts:20`
   não é suportado no Edge Runtime ("Ecmascript file had an error"). O código guarda por
   `NEXT_RUNTIME !== 'nodejs'` e o servidor sobe; confirmar que `npm run build` não trata isso como erro (o
   job `build-e2e-prod` do CI vai dizer).

## Checks

Rodada única do vitest: 26 arquivos, `-t` com alternação dos 45 títulos, `--reporter=verbose` → **45 passed | 103 skipped**, exit 0. Cada título abaixo apareceu com ✓.

| Check | Claim | Proof run | Evidence | Result |
|---|---|---|---|---|
| C1 | 2 empresas, mesmo horário sem profissional → ambas 200 | lote vitest ✓ | `tests/api/appointment-overlap-per-clinic.test.ts:88-89` - `expect(first.status).toBe(200); expect(second.status).toBe(200)` | PASS |
| C2 | mesma empresa → 2º 409 | lote ✓; isolado ✓ | `appointment-overlap-per-clinic.test.ts:106-107` - `expect(second.status).toBe(409)` | PASS |
| C3 | constraint inclui `clinic_id` (INSERT direto) | lote ✓; isolado ✓ | `:122-127` - outra empresa `resolves.toBeDefined()`; mesma empresa `rejects.toThrow()`; migração `drizzle/0038_overlap-per-clinic.sql` bate com o Landing | PASS (fraco, item 4) |
| C4 | Postgres só em 127.0.0.1 | lote ✓ | `tests/infrastructure/deploy-config.test.ts:30-33` - `toHaveLength(1)` + `toMatch(/- "127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432"$/)` | PASS |
| C5 | senha obrigatória e no DATABASE_URL | lote ✓ | `deploy-config.test.ts:40-44` - `toMatch(/POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?/)`, `DATABASE_URL: postgres:\/\/vitta:\$\{POSTGRES_PASSWORD:\?…\}@db` | PASS |
| C6 | volume nomeado em /app/uploads | lote ✓ | `deploy-config.test.ts:50-51` - `toMatch(/^ {6}- uploads:\/app\/uploads$/m)` + volume raiz `uploads:` | PASS |
| C7 | mkdir+chown antes do USER | lote ✓ | `deploy-config.test.ts:61-62` - `expect(user).toBeGreaterThan(mkdir)` com `'RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads'` | PASS |
| C8 | ENV TZ e APP_TIMEZONE | lote ✓ | `deploy-config.test.ts:68-69` - `toMatch(/^ENV TZ=America\/Sao_Paulo$/m)`, `/^ENV APP_TIMEZONE=America\/Sao_Paulo$/m` | PASS |
| C9 | 8 variáveis repassadas | lote ✓ | `deploy-config.test.ts:74-89` - lista literal das 8 + `toMatch(^ {6}NAME: \$\{NAME:-)` | PASS |
| C10 | healthcheck /api/auth/providers | lote ✓ | `deploy-config.test.ts:96-99` - `toContain("fetch('http://127.0.0.1:3000/api/auth/providers')")` | PASS |
| C11 | falha não fica em cache; próxima resolve | lote ✓ | `tests/infrastructure/db-retry.test.ts:40-47` - `rejects.toThrow()`, `vittaDbPromise` `toBeUndefined()`, depois `db` `toBeDefined()` | PASS |
| C12 | concorrentes compartilham Promise | lote ✓; isolado ✓ | `db-retry.test.ts:60` - `expect(second).toBe(first)` | PASS |
| C13 | pool.on('error') loga via logError | lote ✓; isolado ✓ | `db-retry.test.ts:70-74` - `listenerCount('error')` `toBe(1)` + `console.error` com mensagem; ligação real em `src/infrastructure/persistence/drizzle/db.ts:85` `attachPoolErrorLogger(pool)` | PASS |
| C14 | DrizzleQueryError sem params/query, com code | lote ✓ | `tests/lib/log-error.test.ts:38-45` - `not.toContain('fulano@x.com')`, `not.toContain('insert into')`, `toMatchObject({ code: '23505', … })` | PASS |
| C15 | unicidade em POST /api/patients não loga e-mail/nome | lote ✓ | `tests/api/patient-error-log-redaction.test.ts:37-43` - statuses `[200, 500]`; `not.toContain('maria.sigilosa@exemplo.com')`, `not.toContain('Sigilosa')`, `toContain('23505')` | PASS |
| C16 | console.error só no helper | lote ✓ | `tests/lib/log-error-architecture.test.ts:33` - `expect(offenders).toEqual([])` | PASS (regex estreita, item 6) |
| C17 | care-plans usa profissional da sessão | lote ✓ | `tests/api/care-plan-authorship.test.ts:107-108` - `status 200`, `body.data.professionalId).toBe(drA)` (corpo com `drB`) | PASS |
| C18 | records usa profissional da sessão | lote ✓; **proof literal isolado ✗ (1 failed)** | `care-plan-authorship.test.ts:161-162` - `toBe(drA)` | FAIL (acoplado a C17, item 2) |
| C19 | evaluations usa profissional da sessão | lote ✓; **proof literal isolado ✗ (1 failed)** | `care-plan-authorship.test.ts:183-184` - `toBe(drA)` | FAIL (acoplado a C17, item 2) |
| C20 | SOAP usa `resolveSessionProfessionalId` | lote ✓ | proof: `tests/lib/session-professional.test.ts:47` - `expect(id).toBeNull()` (não afirma o claim); código: `src/app/api/patients/[id]/evolutions/route.ts:76` | PASS (fraco, item 5) |
| C21 | 2 pay_partial concorrentes: um 200, outro 4xx, 1 pagamento, 10000 | lote ✓ | `tests/api/invoice-concurrent-payment.test.ts:67-79` - `statuses[0]).toBe(200)`, `statuses[1]` ≥400 <500, `payments).toHaveLength(1)`, `paidCents).toBe(10000)` | FAIL (mutante sem `FOR UPDATE` sobrevive, item 1) |
| C22 | save de insumo preserva stock_qty | lote ✓ | `tests/infrastructure/drizzle-supply-stock.test.ts:42-43` - `name` novo e `stockQty).toBe(7)` após snapshot de 10 e baixa de 3; código `drizzle-inventory-repositories.ts:65` `set: editable` | PASS |
| C23 | botões desabilitados em voo | lote ✓ | `tests/pages/invoice-payment-in-flight.test.tsx:38-41` - `onPay` `toHaveBeenCalledTimes(1)` após 2 cliques; todo botão `toBeDisabled()` | PASS |
| C24 | contas diferentes, mesmo IP, baldes separados | lote ✓ | `tests/proxy.test.ts:130-137` - recepção 2ª req `toBe(429)`; consultório no mesmo IP `isNext(...)).toBe(true)`; chave em `src/proxy.ts:57` `acct:${clinicId ?? 'system'}:${subject}` | PASS |
| C25 | anônimos mesmo IP, mesmo balde | lote ✓ | `proxy.test.ts:153` - `expect(blocked.status).toBe(429)` | PASS |
| C26 | prod sem XFF avisa uma vez | lote ✓ | `tests/lib/client-ip.test.ts:67-68` - `warn).toHaveBeenCalledTimes(1)`, `toMatch(/x-forwarded-for/)` | PASS |
| C27 | prod lança; fora só loga | lote ✓ (2 testes) | `tests/lib/app-timezone.test.ts:17-19` - `toThrow(/Fuso do processo \(UTC\) difere de APP_TIMEZONE \(America\/Sao_Paulo\)/)`; `:27-30` - `not.toThrow()` + `warn` `stringContaining('TZ=America/Sao_Paulo')`. `process.exit(1)` coberto em `:57-60` | PASS |
| C28 | 12:00Z aceito, 21:30Z rejeitado (UTC, APP_TZ=SP) | lote ✓ | `tests/domain/business-hours-timezone.test.ts:28-39` - `12:00Z–13:00Z` `not.toThrow()`; `21:30Z–22:30Z` `toThrow(ValidationError)` | PASS |
| C29 | 12:00Z → "09:00" | lote ✓ | `tests/domain/reminder-content.test.ts:66` - `toContain('17/07/2026 às 09:00')` | PASS |
| C30 | now=02:00Z pega consultas de D+1 BRT | lote ✓ | `tests/application/send-reminders.test.ts:170-173` - `summary.sent).toBe(1)`, texto `17/07/2026` e `09:00` (a do dia 18 fica de fora) | PASS |
| C31 | data de emissão no fuso da aplicação | lote ✓ | `tests/components/document-frame.test.tsx:212-214` - `toContain('03 de setembro de 2026')`, `'23:30'`, `not.toContain('04 de setembro')` | PASS |
| C32 | PatientPicker busca `?search=&limit=20` e seleciona | lote ✓ | `tests/components/patient-picker.test.tsx:51-58` - `toHaveBeenCalledWith('/api/patients?search=Zuleica&limit=20', …)`, `value` `toHaveTextContent('p-150')` | PASS |
| C33 | paciente 150 encontrado e agendável | lote ✓ | `tests/api/patient-search-beyond-first-page.test.ts:48-69` - 1ª página `toHaveLength(100)` e `not.toContain('Paciente Volume 150')`; busca `target` definido; agendamento `status).toBe(200)` | PASS |
| C34 | telas não chamam /api/patients sem search | lote ✓ | `tests/pages/patient-selectors-sweep.test.ts:34` - `expect(offenders).toEqual([])` | PASS (regex estreita, item 6) |
| C35 | nenhum gatilho de aba com scrollWidth > clientWidth em 360/390/768 | `npx playwright test -c playwright.sandbox.config.ts e2e/layout-mobile-first.spec.ts -g "prontuário: nenhum gatilho de aba corta o rótulo"` → **3 passed (32.2s)**, exit 0 | `e2e/layout-mobile-first.spec.ts:602` loop `[360, 390, 768]`; `:623` - `expect(t.scroll).toBeLessThanOrEqual(t.client)`; `:627` sem sobreposição `left >= prev.right - 1` | PASS |
| C36 | menu do Atendente sem os 9 itens | lote ✓ | `tests/pages/staff-nav-role.test.tsx:70-73` - `toEqual(['Dashboard','Agenda','Pacientes','Parceiros'])` + `not.toContain` para os 7 admin + Repasses + Triagem | PASS |
| C37 | Profissional vê Triagem, sem administrativos | lote ✓ | `staff-nav-role.test.tsx:80-84` - `toContain('Triagem')`; `not.toContain` para os 7 de `ADMIN_ONLY` | PASS |
| C38 | dashboard do Atendente sem alerta; consultas e retornos | lote ✓ | `tests/pages/dashboard-role.test.tsx:81-93` - `Maria Souza`/`João Lima` presentes, `queryByRole('alert')).not.toBeInTheDocument()`, nenhuma chamada `/api/summary` | PASS |
| C39 | ficha do Atendente sem abas clínicas nem rotas clínicas | lote ✓ | `tests/pages/patient-record-role.test.tsx:74-77` - `queryByRole('tab')).not.toBeInTheDocument()`, `urls.filter(CLINICAL)).toEqual([])` | PASS |
| C40 | proxy responde `ROLE_FAMILY_DENIED_MESSAGE` | lote ✓ | `tests/proxy.test.ts:282-285` - `status).toBe(403)`, `error).toBe('Seu papel não tem acesso a este recurso')` | PASS |
| C41 | página proibida mostra "sem permissão" sem alerta | lote ✓ (arquivo real) | `tests/pages/staff-nav-role.test.tsx:109-116` - `findByText('Seu papel não tem acesso a esta tela.')`, `queryByRole('alert')).not…`, `pageFetch).not.toHaveBeenCalled()`; `RoleGate` montado em `src/app/(staff)/staff-layout-client.tsx:88` | PASS (caminho do checklist errado, item 3) |
| C42 | e-mail da sidebar sem truncate | lote ✓ | `tests/pages/staff-layout-client.test.tsx:131-132` - `not.toHaveClass('truncate')`, `toHaveClass('break-all')` | PASS |
| C43 | CI roda `npm run build` bloqueante | lote ✓ | `tests/infrastructure/ci-workflow.test.ts:30-32` - `toMatch(/^ {8}run: npm run build$/m)`, `not.toMatch(/continue-on-error:\s*true/)` | PASS (textual) |
| C44 | docker build + smoke providers + escrita em uploads | lote ✓ | `ci-workflow.test.ts:42-47` - `run: docker compose build`, `run: bash scripts/docker-smoke.sh`; smoke `toContain('/api/auth/providers')`, `'/app/uploads/.smoke'` | PASS (textual) |
| C45 | E2E contra next build/start com CSP | lote ✓ | `ci-workflow.test.ts:57-71` - `npx playwright test -c playwright.prod.config.ts` após `npm run build`; config `command: "npm run start"` + 5 specs incl. `csp-producao.spec.ts` (`e2e/csp-producao.spec.ts:47,62,78` `violations()).toEqual([])`) | PASS (textual) |

**Proven: 42/45** (C18, C19 falham como proof literal; C21 prova um mecanismo diferente do que o Landing
declara e não pega a remoção do lock). Fracos, mas contados como provados: C3, C16, C20, C34; C41 com caminho corrigido.

## Diff exercise

Todos os arquivos de proof estão no diff `308c2e0..HEAD` (novos ou alterados), exceto
`e2e/layout-mobile-first.spec.ts`, que também está (+59). Cada proof importa código alterado no diff
(rotas SAE, `db.ts`, `log-error.ts`, `proxy.ts`/`client-ip.ts`, `time-zone.ts`, `patient-picker.tsx`,
`role-gate.tsx`, `staff-nav.tsx`, `staff-layout-client.tsx`, migração 0038, Dockerfile/compose/ci.yml).

## Swept (re-leitura contra o código)

| Row | Constraint citada | No código |
|---|---|---|
| state transitions: C21 "fatura paga não aceita 2º pagamento — regra de domínio existente" | pagamento > saldo rejeitado | sim - `src/domain/billing/invoice.ts:122-124` `if (input.amount.cents > this.balance.cents)` → "Pagamento maior que o saldo" |
| validation: C17-C19 campo do corpo ignorado | `professionalId` vem da sessão | sim - `records/route.ts:39`, `evaluations/route.ts:41`, `care-plans/route.ts:74` usam `resolveSessionProfessionalId` |
| validation: C5 senha obrigatória | `${POSTGRES_PASSWORD:?` | sim (C4/C5 leem `docker-compose.yml`) |
| dependency failure: C13 | listener no pool real | sim - `db.ts:85` |
| failure modes: C27 | encerra em produção | sim - `src/instrumentation.ts:15-21` (`process.exit(1)`) |
| demais rows | apontam para checks deste lote, não para comportamento existente | n/a |

## Faults injected

Não roda no perfil light. Experimento único fora do protocolo, para confirmar a suspeita do item 1:

| Mutation | Location | Killed |
|---|---|---|
| removido `.for('update')` de `findByIdForUpdate` | `src/infrastructure/persistence/drizzle/drizzle-invoice-repository.ts:163` | **não** - C21 segue verde (PGlite serializa transações) |

## Gate

- vitest (proofs, lote único): 45 passed, 0 failed (103 skipped por `-t`)
- vitest isolado: C18 ✗, C19 ✗, "Admin sem profissional…" ✗ (acoplamento de ordem); C2, C3, C12, C13 ✓
- Playwright C35: 3 passed, 0 failed
- `npm run typecheck` - exit 0
- `npm run lint` - exit 0 (1 info preexistente em `tests/docs/structure.test.ts:72`, fora do diff)
- `npm run check:sv` - exit 0 (adoção completa)
- `npm run check:docs` - exit 0 (0 avisos)
- `npm run test:coverage` - exit 0; 239 files, 3540 passed, 0 failed; lines 96.32% (stmts), branches 91.53%, funcs 95.82% (≥ 90%)
- Tree limpo após o Playwright (`git checkout AGENTS.md`); nenhum commit.
