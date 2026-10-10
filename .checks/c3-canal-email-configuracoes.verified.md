# C3 — Seção "Canal de e-mail" em `/configuracoes` Verification

**Verdict**: PASS (23 / 23 provadas)
**Profile**: light
**Diff range**: 4ba8685..377e236 (`origin/main`..HEAD de `feature/c3-canal-email-configuracoes-266`, 6 commits; o commit de correção é 377e236 e só mexe em testes)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

A rodada 2 cobre três coisas: o diff `33b38bb..377e236` (4 arquivos de teste, +29/−20, nenhuma
mudança em `src/`), o único veredito que não era PASS na rodada 1 (C20) e os achados G1–G6. O
resto vem da rodada 1 e está marcado `carried from 33b38bb`. Todas as provas rodaram de novo em
377e236. Como o perfil é `light`, não rodaram o passo 1, o recálculo do join `Coverage`, os
vereditos de `Test policy` nem a injeção de falhas.

## Binding sources (carried from 33b38bb)

O passo 1 não roda sob `light`, e o checklist não marca fonte vinculante para a interface. Na
rodada 1, li `.tasks/c3-tela-canal-configuracoes.md` e `.design/canal-por-clinica.md`. O fix não
tocou a interface nem o checklist, então o passo 1 não reabre.

## Proof runs (verified at 377e236)

- Rodei uma única invocação do Vitest sobre os 5 arquivos de prova, com `--reporter=verbose` e a
  alternância
  `-t "sem canal|salva o canal|salva e mostra|mantém a chave|substitui a chave|remetente inválido|remetente|primeiro salvamento sem chave|nunca expõe a chave|GET|teste ok|provedor recusa|teste falho|limite|remove o canal|remover|auditoria|403|email-channel|não aparece|carregando|outra clínica"`.
  Resultado: **5 arquivos passaram (5)**, com **66 passed, 80 skipped e 0 failed**. A rodada 1
  teve 61 passed com 1 arquivo pulado. A diferença de +5 vem do teste de C20, agora selecionado,
  e de mais 4 papéis em C21.
- Todo teste nomeado por uma prova aparece como `✓`. Nenhum filtro casa zero testes.
- **C20 sozinha**, exatamente como o checklist escreve:
  `npx vitest run tests/lib/route-family.test.ts -t "email-channel"` → `✓ … email-channel: canal de e-mail da clínica é administrativo, inclusive o teste (C3, #266)`,
  `Test Files 1 passed (1)`, `Tests 1 passed | 77 skipped`, exit 0.
- O nível não mudou: o fix só reforça asserções nos mesmos testes. As provas de rota continuam
  chamando os handlers.

## Checks

| Check | Claim | Proof run | Evidence (file:line + assertion) | Result | Status |
|---|---|---|---|---|---|
| C1 | sem canal: aviso literal + formulário vazio | `-t "sem canal"`: ✓ | `tests/pages/configuracoes-email-channel.test.tsx:93-97` `findByText('Nenhum canal configurado — e-mails automáticos, convites e redefinições não são enviados por esta clínica.')`; `:102` `toBe('resend')`; `:104-105` `toHaveValue('')` (as linhas não mudaram) | PASS | verified at 377e236 (arquivo tocado; citações conferidas) |
| C2 | `PUT` → `200` `{ channel: {…, nulls} }` | `-t "salva o canal"`: ✓ | `tests/api/email-channel-settings.test.ts:99-108` `expected`; `:109` `toBe(200)`; **`:110` `toEqual(expected)`** | PASS | verified at 377e236 (linhas inalteradas) |
| C3 | chave como `••••` + `secretLast4` | `-t "salva e mostra"`: ✓ | `configuracoes-email-channel.test.tsx:129-131` `findByText('Chave atual: ••••1234')` | PASS | verified at 377e236 (linhas inalteradas) |
| C4 | `apiKey` vazia mantém a chave | `-t "mantém a chave"`: ✓ | `email-channel-settings.test.ts:131` `sender` `toBe('novo@clinicax.com.br')`; **`:133` `keyOfNextSend` `toBe('Bearer re_chave_antiga_AAAA')`** | PASS | verified at 377e236 (linhas inalteradas) |
| C5 | chave nova substitui e zera `lastStatus` | `-t "substitui a chave"`: ✓ | `:160-165` `toMatchObject({ secretLast4: 'BBBB', lastStatus: null, lastStatusAt: null, lastError: null })`; `:166` `toBe('Bearer re_chave_nova_BBBB')` | PASS | verified at 377e236 (linhas inalteradas) |
| C6 | remetente inválido → `400` com a mensagem do campo, nada gravado | `-t "remetente inválido"` + `-t "remetente"`: 5 + 9 ✓ | `email-channel-settings.test.ts:185` `toBe(400)`; **`:186-188` `expect(json.error).toBe('Remetente inválido — use "Nome <contato@dominio.com>" ou "contato@dominio.com"')`**, igual à fonte `src/domain/clinic/clinic-channel.ts:25`; `:189` GET `toEqual({ channel: null })`; `:207` `400` no canal existente. Domain: `tests/domain/clinic-channel.test.ts:20`, `:32-33` (sem mudança) | PASS | verified at 377e236 (G3 fechado) |
| C7 | 1º salvamento sem chave → `400` "Chave de API obrigatória" | `-t "primeiro salvamento sem chave"`: 2 ✓ | `email-channel-settings.test.ts:225` `toBe(400)`; **`:226` `toBe('Chave de API obrigatória')`**; `:227` `toEqual({ channel: null })` | PASS | verified at 377e236 (citações atualizadas, +2) |
| C8 | a chave não aparece em resposta, log nem trilha | `-t "nunca expõe a chave"`: ✓ | `:344` `toHaveLength(4)`; `:346` `body` `.not.toContain(apiKey)`; `:348` log `.not.toContain(apiKey)`; `:349` trilha `.not.toContain(apiKey)`; `:350` `toContain('test-failed')` | PASS | verified at 377e236 (citações atualizadas, +2) |
| C9 | `GET` = formato de C2 ou `{ channel: null }` | `-t "GET"`: ✓ | `:86` `toEqual({ channel: null })`; `:112` `read.json.data` `toEqual(expected)` | PASS | verified at 377e236 (linhas inalteradas) |
| C10 | POST `/test` ok: chave da clínica, e-mail da sessão, assunto, `200` `{ lastStatus: 'ok', lastStatusAt: <agora>, lastError: null }`; GET seguinte `ok` | `-t "teste ok"`: ✓ | `tests/api/email-channel-test.test.ts:93` `toBe(200)`; **`:94-98` `expect(json.data).toEqual({ lastStatus: 'ok', lastStatusAt: expect.any(String), lastError: null })`**; `:100-101` `lastStatusAt` entre `before` e `Date.now()`; `:109-111` `Authorization` `toBe('Bearer re_chave_da_clinica')`; `:112` `to` `toEqual([adminEmail(clinicId)])`; `:113` `subject` `toBe(SUBJECT)`; `:115-119` GET `toMatchObject({ lastStatus: 'ok', … })` | PASS | verified at 377e236 (G6 fechado) |
| C11 | "Teste enviado para <e-mail> em <data e hora>" | `-t "teste ok"`: ✓ | `configuracoes-email-channel.test.tsx:168-172` `findByText(\`Teste enviado para ${ADMIN_EMAIL} em ${formatDateTime(at)}\`)` | PASS | verified at 377e236 (linhas inalteradas) |
| C12 | recusa → `200` `failed`, `lastError` ≤ 300, sem destinatário | `-t "provedor recusa"`: ✓ | `email-channel-test.test.ts:133` `toBe(200)`; `:134` `toBe('failed')`; `:135` `toContain('domain is not verified')`; `:136` `toBeLessThanOrEqual(300)`; **`:137` `.not.toContain(adminEmail(clinicId))`** | PASS | verified at 377e236 (citações atualizadas, +3) |
| C13 | `lastError` num `Alert` de erro | `-t "teste falho"`: ✓ | `configuracoes-email-channel.test.tsx:189` `findByRole('alert')`; `:190` `toHaveTextContent('Resend API 403: domain is not verified')`; **`:191` `expect(alert).toHaveClass('sv-alert--danger')`** | PASS | verified at 377e236 (G5 fechado) |
| C14 | sem canal → `409` "Configure o canal antes de testar" | `-t "sem canal"`: ✓ | `email-channel-test.test.ts:150` `toBe(409)`; **`:151` `toBe('Configure o canal antes de testar')`**; `:152` nenhum `fetch` | PASS | verified at 377e236 (citações atualizadas, +3) |
| C15 | 6ª chamada em 60 s → `429` | `-t "limite"`: ✓ | `email-channel-test.test.ts:170` `toEqual([200, 200, 200, 200, 200, 429])`; fonte em `src/app/api/settings/email-channel/test/route.ts:9-13` | PASS | verified at 377e236 (citação atualizada, +3) |
| C16 | `DELETE` → `200` `{ removed: true }`, a linha some, `email` desativado | `-t "remove o canal"`: ✓ | `email-channel-settings.test.ts:258` `toBe(200)`; **`:259` `toEqual({ removed: true })`**; `:260-262` `find('email')` `toBeNull()`; `:263` `keyOfNextSend` `toBeNull()`; `:266-267` idempotente | PASS | verified at 377e236 (citações atualizadas, +2) |
| C17 | `ConfirmAction` com o texto literal → `DELETE` | `-t "remover"`: ✓ | `configuracoes-email-channel.test.tsx:242` `findByRole('alertdialog')`; `:243-245` `toHaveTextContent('Remover o canal de e-mail? A clínica deixa de enviar e-mails automáticos, convites e redefinições.')`; `:246` nenhum DELETE antes de confirmar; `:251-255` DELETE em `ENDPOINT` | PASS | verified at 377e236 (citações atualizadas, +1) |
| C18 | trilha `create`/`update`/`delete` + `test-ok`/`test-failed`, `clinic_channel`, id do canal, `clinicId` | `-t "auditoria"`: 2 ✓ | `email-channel-settings.test.ts:288-307` `toEqual(['create','delete','update'].map(action => ({ action, resourceId: channelId, clinicId, actorRole: 'company_admin', detail: null })))` (`:298` `).toEqual(`); `email-channel-test.test.ts:184-200` `toEqual([{ action: 'update', resourceId: channelId, detail: 'test-failed', clinicId }, { action: 'update', resourceId: channelId, detail: 'test-ok', clinicId }])` | PASS | verified at 377e236 (citações atualizadas) |
| C19 | 5 papéis × 4 rotas → `403` | `-t "403"`: 20 ✓ | `email-channel-settings.test.ts:387` `it.each` com o produto cartesiano; **`:413` `expect(response.status).toBe(403)`** | PASS | verified at 377e236 (citações atualizadas, +2) |
| C20 | `/api/settings/email-channel` e `/test` são `administrative` | `-t "email-channel"`: **1 ✓** (sozinha: 1 passed, exit 0) | `tests/lib/route-family.test.ts:82` `it('email-channel: canal de e-mail da clínica é administrativo, …')`; **`:83` `expect(classifyRoute('/api/settings/email-channel')).toBe('administrative')`**; **`:84-86` `classifyRoute('/api/settings/email-channel/test')` `toBe('administrative')`** | PASS | verified at 377e236 (G1 fechado) |
| C21 | a seção não aparece para papel sem acesso | `-t "não aparece"`: 5 ✓ (atendente, profissional, patient, partner, super_admin) | `configuracoes-email-channel.test.tsx:261` `it.each(['atendente', 'profissional', 'patient', 'partner', 'super_admin'])`; `:276` `queryByText('Canal de e-mail')` `toBeNull()`; `:277` nenhuma chamada a `ENDPOINT` | PASS | verified at 377e236 (G2 fechado) |
| C22 | carregando → `LoadingIndicator`; falha → `ErrorAlert` | `-t "carregando"`: ✓ | `configuracoes-email-channel.test.tsx:291` `findByText('Carregando…')`; `:294-295` `findByRole('alert')` `toHaveTextContent('Erro interno do servidor')`; `:296` o carregamento some | PASS | verified at 377e236 (citações atualizadas, +4) |
| C23 | B não vê nem apaga o canal de A | `-t "outra clínica"`: ✓ | `email-channel-settings.test.ts:366` `toEqual({ channel: null })`; `:367-369` canal de A com `sender` `toBe(SENDER)` | PASS | verified at 377e236 (citações atualizadas, +2) |

**23 / 23 provadas.**

## Critérios da task × checks (carried from 33b38bb, com atualização)

A tabela da rodada 1 continua valendo. Os 12 critérios têm check, e nenhum check contradiz a task
em cópia, status, formato ou literal de auditoria. Duas linhas mudam nesta rodada:

- Critério 11: agora está coberto nas duas pontas. A API cobre 5 × 4 (C19) e a tela cobre os 5
  papéis (C21).
- Critério 6: a cláusula "sem dado de paciente" continua sem asserção (G4, ver abaixo).

## Swept rows resolving to "existing" (carried from 33b38bb)

Os trechos citados ficam todos em `src/`, que o fix não tocou:

- upsert `drizzle-clinic-channel-repository.ts:81-83`;
- `remove` com `DELETE … RETURNING id` em `:87-98`;
- `DELETE` idempotente em `src/app/api/settings/email-channel/route.ts:53-61`;
- última escrita vence em `manage-email-channel.ts:64`.

## Coverage / Test policy

Não rodam sob `light`. A nota de amostragem da rodada 1, sobre a tela no critério 11, está fechada
por C21.

## Faults injected

O passo 4 não roda sob `light`.

## Gate (verified at 377e236)

- `npx biome check` nos 4 arquivos do fix: `Checked 4 files … No fixes applied`, exit 0.
- `npm run typecheck` (`tsc --noEmit`): exit 2. **O único erro está em
  `.next-open-mode/dev/types/validator.ts(894,1): TS1128`, fora da árvore rastreada.** Esse
  arquivo é gerado pelo `next dev` do e2e em segundo plano e ignorado pelo git (`.gitignore:18`).
  Para confirmar que é só ele, rodei `tsc --noEmit` com um tsconfig de rascunho no scratchpad.
  Esse tsconfig estende o do repositório e só remove os dois globs `.next-open-mode/**` do
  `include`. Resultado: **exit 0**, sem nenhum erro na árvore rastreada.
- `check:sv` e o lint do restante: carried from 33b38bb. O fix não tocou JSX de produção nem `.md`.
- Suíte completa com cobertura e e2e: não rodaram, por instrução.
- Árvore de trabalho após a verificação: só este relatório não rastreado.

## Findings (re-judged at 377e236)

1. **G1: fechado.** O teste agora se chama `email-channel: canal de e-mail da clínica é …`
   (`tests/lib/route-family.test.ts:82`). A prova do checklist (`-t "email-channel"`) o seleciona
   e ele passa: 1 passed, exit 0.
2. **G2: fechado.** C21 agora é `it.each` sobre os 5 papéis do critério 11
   (`configuracoes-email-channel.test.tsx:261-279`), com 5 ✓.
3. **G3: fechado.** A mensagem é afirmada por igualdade exata (`email-channel-settings.test.ts:186-188`)
   e bate com a fonte (`src/domain/clinic/clinic-channel.ts:25`).
4. **G5: fechado.** `toHaveClass('sv-alert--danger')` está em `configuracoes-email-channel.test.tsx:191`.
   O texto afirmado em `:190` é o `lastError`, que só o `Alert` do resultado do teste mostra
   (`email-channel-section.tsx:281`). Assim, a classe é afirmada no elemento certo.
5. **G6: fechado.** O corpo de `/test` ok é afirmado com `toEqual` exato (`email-channel-test.test.ts:94-98`).
   Um campo a mais agora falharia.
6. **G4: aberto e aceito, não bloqueia.** A cláusula "sem dado de paciente" do critério 6 segue
   sem asserção. O coordenador a deixou de fora de propósito. Confirmei que o corpo do e-mail de
   teste é uma constante sem interpolação (`src/application/clinic/manage-email-channel.ts:12-17`)
   e que `send` recebe só `to`, `subject` e `text` (`:89-93`). Sem dado variável, não há caminho
   para dado de paciente hoje. Se alguém passar a interpolar algo nesse texto, a regra fica sem
   rede.
