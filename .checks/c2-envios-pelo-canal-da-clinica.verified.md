# C2 — Envios pelo canal da clínica e link manual Verification

**Verdict**: PASS (22 / 22 provadas)
**Profile**: light
**Diff range**: 019d34d..37bea38 (`origin/main`..HEAD de `feature/fervent-fermat-e31skh`, 8 commits; o commit de correção é 37bea38, que só mexe em testes)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

O escopo da rodada 2 é o diff de `78f9706..37bea38` (4 arquivos de teste, +76 linhas, nenhuma
mudança em `src/`) mais todo veredito que não era PASS (C9) e os achados F1–F5. O resto é
herdado e está marcado `carried from 78f9706`. Fora do `light`, não houve injeção de falhas nem
recálculo do join `Coverage`.

## Binding sources (carried from 78f9706)

O passo 1 não roda sob `light`. O checklist não marca nenhuma fonte como vinculante para a
interface, então telas e design não foram comparados. `.tasks/c2-envios-pelo-canal-da-clinica.md`
foi lido e cada check foi comparado com os critérios 1–16. O fix não tocou a interface, então o
passo 1 não reabre.

## Proof runs (verified at 37bea38)

- Uma única invocação do Vitest sobre os 12 arquivos de prova, com a alternância
  `-t "link manual|link de convite|sem canal|com canal|canal falha|link do reenvio|emite reset|404|403|reset-link|409|429|auditoria|reset-link auditado|revoga sessões|redefinição|canal da conta|super admin|administrador da sua clínica|canal de cada clínica|falha de envio não tenta outro canal"`
  e `--reporter=verbose`. Resultado: 12 arquivos, **37 passed, 140 skipped, 0 failed**. São os
  35 da rodada 1 mais os 2 testes novos. Cada teste nomeado por uma prova aparece como `✓`, e
  nenhum filtro casou zero testes.
- Os testes novos rodaram sob o filtro da própria prova:
  - `account-reset-link.test.ts > emite reset pelo canal da clínica: canal que entrega sai pela chave dela sem link; não-2xx devolve o link` ✓. Casa com `-t "emite reset"`, o filtro de C9.
  - `platform-clinic-admin-actions.test.ts > … > reset-link com canal: sai pela chave da clínica-alvo sem link, invalida o link anterior e, com não-2xx, devolve o link` ✓. Casa com `-t "reset-link"`, o filtro de C14.
- O nível não mudou: os testes novos chamam o handler da rota pelos mesmos auxiliares, `resetLink`
  (`account-reset-link.test.ts`) e `act` → `route.PATCH` (`platform-clinic-admin-actions.test.ts:70`).
- `stubProviderFetch(status)` (`tests/support/email-channel.ts:35-45`) devolve `ok: status >= 200 && status < 300`.
  Assim o `500` dos testes novos é de fato uma resposta não-2xx do provedor, e não um `fetch` ausente.

## Checks

| Check | Claim | Proof run | Evidence (file:line + assertion) | Result | Status |
|---|---|---|---|---|---|
| C1 | `POST /api/platform/clinics` não envia nada; `admin.delivered=false`, `admin.inviteUrl=https://app.vitta.test/definir-senha?token=…`; token `invite` de 24 h | `-t "link manual"`: 1 ✓ | `tests/api/platform-clinics.test.ts:161` (teste da prova); `:173` `expect(emails.bodies).toHaveLength(0)`; `:174` `expect(fetchMock).not.toHaveBeenCalled()`; `:175` `expect(json.data.admin.delivered).toBe(false)`; **`:176-178` `expect(json.data.admin.inviteUrl).toMatch(/^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/)`**; `:187-188` `claimBySecretHash(hash, Date.now() + INVITE_TTL_MS + 1)` `.toBeNull()`; `:193` `purpose` `toBe('invite')` | PASS | verified at 37bea38 |
| C2 | `/plataforma/clinicas/nova`: link somente leitura, "Copiar link", texto de 24 h | `-t "link de convite"`: 1 ✓ | `tests/pages/plataforma-nova-clinica.test.tsx:66-74` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C3 | sem canal: as duas rotas → `delivered:false` + `inviteUrl` | `-t "sem canal"`: 1 ✓ | `tests/api/account-invite-link.test.ts:89-94` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C4 | `/configuracoes` com `delivered:false` (criação e reenvio) mostra link, "Copiar link" e o aviso | `-t "link manual"`: 2 ✓ | Criação: `tests/pages/configuracoes-accounts.test.tsx:209` `findByText(NOTICE)` (NOTICE em `:167`); `:210` `toHaveValue(LINK_URL)`; `:211-212` clique em "Copiar link" e `writeText` `toHaveBeenCalledWith(LINK_URL)`. Reenvio: `:221` `stubClipboard()`; `:228` `findByText(NOTICE)`; `:229-231` `toHaveValue(LINK_URL)`; `:232` `posted` `toEqual(['/api/accounts/acc-8/resend-invite'])`; **`:233` `fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))`; `:234` `expect(writeText).toHaveBeenCalledWith(LINK_URL)`** | PASS | verified at 37bea38 |
| C5 | com canal: POST com `Bearer <chave da clínica>`, `delivered:true`, `inviteUrl:null` | `-t "com canal"`: 1 ✓ | `account-invite-link.test.ts:107-113` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C6 | canal não-2xx → `delivered:false` + `inviteUrl`, a conta existe | `-t "canal falha"`: 1 ✓ | `account-invite-link.test.ts:120-134` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C7 | PATCH `resend-invite`: sem canal, com canal (chave da clínica-alvo) e canal que falha | `-t "link do reenvio"`: 1 ✓ | `tests/api/platform-clinic-admin-actions.test.ts:311` (teste); `:320-321` `{ delivered: false }` e `inviteUrl` `toMatch(LINK)`; `:325-328` `{ delivered: true, inviteUrl: null }`; `:331` `auth: 'Bearer re_chave_alvo'`; `:336` `stubProviderFetch(422)`; `:341-342` `delivered` `toBe(false)`, `inviteUrl` `toMatch(LINK)`. Os números de linha não mudaram, porque o teste novo entrou depois | PASS | verified at 37bea38 (arquivo tocado; citações conferidas) |
| C8 | `/plataforma/clinicas/[id]` mostra link + "Copiar link" | `-t "link manual"`: 1 ✓ | `tests/pages/plataforma-clinica.test.tsx:306-315` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C9 | `reset-link` → `200` com `delivered`/`inviteUrl` (regra de C3/C5; critério 7: regra 3–5), token `reset` de 1 h, link anterior invalidado | `-t "emite reset"`: 2 ✓ | Sem canal (`tests/api/account-reset-link.test.ts:86`): `:95-97` `status` `toBe(200)`, `delivered` `toBe(false)`, `inviteUrl` `toMatch(LINK)` (`LINK` em `:32`); `:104-107` `claimBySecretHash(hashAuthTokenSecret(tokenOf(first…)))` `.toBeNull()`; `:109-111` `+ RESET_TTL_MS + 1` `.toBeNull()`; `:116` `purpose` `toBe('reset')`. **Com canal (`:120`)**: `:124` `saveEmailChannel(CLINIC_A_ID, 're_chave_da_A')`; `:126` `stubProviderFetch(200)`; `:128` `toBe(200)`; **`:129` `expect(sent.json.data).toEqual({ delivered: true, inviteUrl: null })`**; `:130-136` `providerCalls(fetchMock)` `toEqual([objectContaining({ auth: 'Bearer re_chave_da_A', to: target.email, text: stringMatching(/definir-senha\?token=/) })])` (um POST só); **`:138` `stubProviderFetch(500)`; `:140` `toBe(200)`; `:141` `delivered` `toBe(false)`; `:142` `inviteUrl` `toMatch(LINK)`**; `:144-145` limpa os globais e os canais no `finally` | PASS | verified at 37bea38 |
| C10 | outra clínica → `404`; inexistente → `404` | `-t "404"`: 1 ✓ | `account-reset-link.test.ts:156` `foreign…status` `toBe(404)`; `:157` `missing…status` `toBe(404)` | PASS | verified at 37bea38 (arquivo tocado; citações atualizadas) |
| C11 | `atendente` → `403`; rota `administrative` | `-t "403"` e `-t "reset-link"` (route-family): 2 ✓ | `account-reset-link.test.ts:170` `expect(response.status).toBe(403)`; `tests/lib/route-family.test.ts:70-79` (sem mudança) | PASS | verified at 37bea38 (citação do handler atualizada; route-family carried from 78f9706) |
| C12 | alvo desativado → `409` `"Conta desativada"` | `-t "409"`: 1 ✓ | `account-reset-link.test.ts:178` `toBe(409)`; `:179` `expect(json.error).toBe('Conta desativada')` | PASS | verified at 37bea38 (arquivo tocado; citações atualizadas) |
| C13 | 6ª chamada em 60 s → `429` | `-t "429"`: 1 ✓ | `account-reset-link.test.ts:192` `expect(statuses).toEqual([200, 200, 200, 200, 200, 429])`. Fonte: `SharedRateLimiter('reset-link', 5, 60_000)` em `src/app/api/accounts/[id]/reset-link/route.ts:17` | PASS | verified at 37bea38 (arquivo tocado; citações atualizadas) |
| C14 | PATCH `reset-link` em `company_admin` ativo: `reset` de 1 h; `delivered:false` + `inviteUrl` sem canal (critério 9: vale o critério 7 para esse alvo) | `-t "reset-link"`: 2 ✓ (mais o auditado, que é de C15) | Sem canal (`platform-clinic-admin-actions.test.ts:345`): `:359` `delivered: false`; `:361` `inviteUrl` `toMatch(LINK)`; `:366-369` `+ RESET_TTL_MS + 1` `.toBeNull()`; `:374` `purpose` `toBe('reset')`; `:380-381` `409` + `'Conta desativada'`. **Com canal (`:384`)**: `:389` primeiro `reset-link` sem canal (`first`); `:391` `saveEmailChannel(clinicId, 're_chave_alvo')`; `:392` `stubProviderFetch(200)`; `:394-397` `toMatchObject({ delivered: true, inviteUrl: null })`; `:398-403` `providerCalls` `toEqual([objectContaining({ auth: 'Bearer re_chave_alvo', to: admin.email })])`; **`:406-410` `claimBySecretHash(hashAuthTokenSecret(tokenOf(first.json.data.inviteUrl)))` `.toBeNull()`** (o link anterior deixou de valer); `:412` `stubProviderFetch(500)`; `:414-416` `status 200`, `delivered` `toBe(false)`, `inviteUrl` `toMatch(LINK)`. `afterEach` em `:302-305` faz `unstubAllGlobals` e `clearEmailChannels` | PASS | verified at 37bea38 |
| C15 | as duas rotas auditam `update`/`account`/`<alvo>`/`reset-link`; em produção, nada do segredo nem do link na trilha ou em `console.*` | `-t "auditoria"` e `-t "reset-link auditado"`: 2 ✓ | `account-reset-link.test.ts:197` `stubEnv('NODE_ENV', 'production')`; `:200-204` captura `console.info/warn/error/log`; `:214-222` `events` `toEqual([objectContaining({ action: 'update', resourceType: 'account', resourceId: target.id, detail: 'reset-link', clinicId: CLINIC_A_ID })])`; `:224-227` trilha e log `.not.toContain(secret)` / `.not.toContain('definir-senha')`. `platform-clinic-admin-actions.test.ts:419` (teste); `:422` `NODE_ENV=production`; `:425-429` captura de `console.*`; `:440-449` `arrayContaining([objectContaining({ … detail: 'reset-link', clinicId })])`; `:452-455` as mesmas negações | PASS | verified at 37bea38 (os dois arquivos foram tocados; citações atualizadas) |
| C16 | definir a senha pelo link incrementa `session_version` | `-t "revoga sessões"`: 1 ✓ | `account-reset-link.test.ts:245` `set-password` `toBe(200)`; `:249` `expect(stored?.sessionVersion).toBe(target.sessionVersion + 1)` | PASS | verified at 37bea38 (arquivo tocado; citações atualizadas) |
| C17 | as duas telas: "Gerar link de redefinição" atrás de `ConfirmAction`; confirmar chama a rota e mostra o link | `-t "redefinição"`: 2 ✓ | `configuracoes-accounts.test.tsx:262-266` `within(dialog).getByText('Gerar um link de redefinição de senha para ativa@x.com? Links anteriores deixam de valer.')`; `:267` `posted` `toHaveLength(0)`; `:271-273` `toEqual(['/api/accounts/acc-9/reset-link'])`; `:274-276` link exibido. `plataforma-clinica.test.tsx:343-362` (sem mudança) | PASS | verified at 37bea38 (configuracoes tocado; citações atualizadas); plataforma-clinica carried from 78f9706 |
| C18 | mesmo e-mail em A (com canal) e B (sem canal): um POST com a chave de A; `200` + `NEUTRAL_RESPONSE` | `-t "canal da conta"`: 1 ✓ | `tests/api/forgot-password-route.test.ts:257-267` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C19 | super admin: com env sai pela chave da plataforma; sem env, nenhum `fetch`; resposta igual | `-t "super admin"`: 1 ✓ | `forgot-password-route.test.ts:295-309` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C20 | `/esqueci-senha` mostra o texto de ajuda abaixo do formulário | `-t "administrador da sua clínica"`: 1 ✓ | `tests/pages/esqueci-senha.test.tsx:106-114` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C21 | lembretes por clínica com `channel` no resumo, sem `channelEnabled` | `-t "canal de cada clínica"`: 1 ✓ | `tests/api/reminders-run-channel.test.ts:121-140` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |
| C22 | falha de um lembrete de A conta `failed`, o lote segue, nenhum outro gateway | `-t "falha de envio não tenta outro canal"`: 1 ✓ | `tests/application/send-reminders.test.ts:421-427` (sem mudança) | PASS | carried from 78f9706 (prova re-executada em 37bea38) |

**22 / 22 provadas.**

## Swept rows resolving to "existing" (carried from 78f9706)

- concurrency (`replaceUnused` atômico, #50): confirmado em
  `src/infrastructure/persistence/drizzle/drizzle-auth-token-repository.ts:93-130`. A invalidação
  e o `insert` ficam na mesma transação, com retry contra o índice parcial
  `uq_auth_tokens_account_purpose_unused`. O fix não tocou `src/`.
- data lifecycle (`reset` 1 h, `invite` 24 h): `src/domain/auth/auth-token.ts:8`, `:10`, `:14-17`.
  C1 e C9 afirmam os dois valores.

## Coverage / Test policy (carried from 78f9706, com nota)

O join `Coverage` e o `Test policy` não rodam sob `light`. Mesmo assim, a nota da rodada 1 sobre a
linha "rotas com `{ delivered, inviteUrl }`" (membro `reset-link C9` só com o ramo sem canal) foi
reavaliada: os três estados do canal (sem canal, entrega, falha) agora estão provados em
`reset-link` (C9) e no PATCH `reset-link` (C14). Essa linha da tabela "estado do canal no envio"
passa a ter os membros completos para as duas rotas de redefinição.

## Faults injected

O passo 4 não roda sob `light`.

## Gate (verified at 37bea38)

- `npm run -s typecheck`: exit 0.
- `npx biome check` nos 4 arquivos tocados pelo fix: `Checked 4 files … No fixes applied`, exit 0.
  O lint do repositório inteiro e o `check:docs` são carried from 78f9706 (2 warnings e 1 info
  antigos, fora do diff; docs OK). O fix não tocou `.md` nem `src/`.
- Suíte completa com cobertura: não rodou, por instrução.
- Árvore de trabalho após a verificação: limpa, exceto por este relatório (não rastreado).

## Findings (re-judged at 37bea38)

1. **F1: fechado.** O teste novo `emite reset pelo canal da clínica: …`
   (`tests/api/account-reset-link.test.ts:120`) é selecionado pelo filtro da prova de C9
   (`-t "emite reset"`), e o verbose mostra que rodou. Ele afirma o ramo de entrega:
   `:129` `expect(sent.json.data).toEqual({ delivered: true, inviteUrl: null })` e
   `:130-136` um único POST com `auth: 'Bearer re_chave_da_A'`, que é a chave da clínica do alvo.
   Também afirma o ramo não-2xx: `:138` `stubProviderFetch(500)`, `:141`
   `expect(failed.json.data.delivered).toBe(false)` e `:142`
   `expect(failed.json.data.inviteUrl).toMatch(LINK)`.
2. **F2: fechado.** O teste novo `reset-link com canal: …`
   (`platform-clinic-admin-actions.test.ts:384`) roda sob `-t "reset-link"`. Ele prova a
   invalidação do link anterior pelo PATCH (`:406-410`, o hash do `first` `.toBeNull()`), o ramo
   de entrega com a chave da clínica-alvo (`:394-403`) e o ramo não-2xx (`:412-416`).
3. **F3: fechado.** A regex exata da URL agora está no teste da prova
   (`platform-clinics.test.ts:176-178`, dentro de `link manual` em `:161`).
4. **F5: fechado.** O reenvio agora clica em "Copiar link" e afirma a escrita na área de
   transferência (`configuracoes-accounts.test.tsx:233-234`).
5. **F4: aberto como decisão do dono, não como lacuna de teste. Não bloqueia.** O critério 10 diz
   "Sempre … nem o link nem o segredo aparecem … no log". O checklist registra a leitura de forma
   explícita na seção Landing (`.checks/c2-envios-pelo-canal-da-clinica.md:29`): a regra vale para o
   log de produção, e fora dela o `NullEmailGateway` loga o link de propósito (C1 C10,
   `e2e/support/invite-log.ts`). As provas de C15 rodam com `NODE_ENV=production`. Meu julgamento:
   a leitura é coerente com uma decisão já entregue (C1) e está declarada, não escondida. Por isso
   ela não reprova esta rodada. Pela regra 5 do AGENTS.md, porém, quem confirma que "Sempre"
   significa "em produção" é o dono (@KalleoPinheiro), e isso deve constar como pergunta aberta
   no PR.
6. **Informativo (carried from 78f9706), sem efeito no veredito.**
   `POST /api/platform/clinics/[id]/admins` (convite de admin substituto) ainda devolve só
   `delivered` (`src/app/api/platform/clinics/[id]/admins/route.ts:51,65`). Está fora de escopo
   no checklist e é pergunta aberta para o dono. Existe contorno via `resend-invite` (C7).

### Observação menor (não bloqueia)

- No teste novo de C9, `vi.unstubAllGlobals()` e `clearEmailChannels()` ficam no `finally` do
  próprio teste, e o `afterEach` do arquivo (`:81-83`) só faz `vi.unstubAllEnvs()`. Hoje funciona.
  Se outro teste com canal for adicionado a esse arquivo, convém subir a limpeza para o
  `afterEach`, como em `platform-clinic-admin-actions.test.ts:302-305`.
