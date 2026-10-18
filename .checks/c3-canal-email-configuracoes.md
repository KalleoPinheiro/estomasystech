# C3 — Seção "Canal de e-mail" em `/configuracoes`

Sources:

- [KalleoPinheiro/estomasystech#266](https://github.com/KalleoPinheiro/estomasystech/issues/266) — a issue; aponta para a task
- `.tasks/c3-tela-canal-configuracoes.md` — critérios 1–12, Decided (contrato), Unresolved 1–2 (defaults adotados)
- `.design/canal-por-clinica.md` — Decisions: Quem configura o canal, Teste do canal, Segredo, `last_error`, Auditoria; Open 1 (destinatário do teste) e 3 (rate limit)

Profile: `light` (AGENTS.md não declara outro).

## Out of scope

- Super admin configurar o canal de uma clínica — decisão do dono (2026-10-10).
- Outros provedores no seletor — só Resend.
- Validar a chave ao salvar — o teste é explícito.
- Status do canal em `/plataforma` — C4 (#267).

## Landing

Toca o domínio `ClinicChannel` (ganha `reconfigure`, `recordTest`, validação do remetente), o
repositório (ganha `remove`), um use case novo `src/application/clinic/manage-email-channel.ts`,
duas rotas novas (`/api/settings/email-channel` e `/test`), `route-family.ts`, `audit-labels.ts`
e a tela `/configuracoes` (arquivo próprio `email-channel-section.tsx`). Reaproveita
`services.email` (gateway por escopo da C1) para o teste, `SharedRateLimiter`, `recordAuditNow`,
`ConfirmAction`, `useApiQuery`, `ErrorAlert`/`LoadingIndicator`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Contrato (Decided na task) | `GET` → `{ channel: { provider, sender, secretLast4, lastStatus, lastStatusAt, lastError } \| null }`; `PUT` in `{ provider: 'resend', sender, apiKey? }` → `{ channel }`; `POST /test` → `{ lastStatus, lastStatusAt, lastError }`; `DELETE` → `{ removed: true }` | chave mascarada inteira — vaza comprimento e prefixo |
| `resourceType: 'clinic_channel'` na trilha | `resourceId` = id da linha `clinic_channels`; `action` `create` (1º salvamento) / `update` (salvar de novo, teste) / `delete`; `detail` `test-ok` / `test-failed` só no teste | `clinic-channel` com hífen, como `clinic-info` — a task fixa o literal com `_` |
| `DELETE` não decifra a chave | `ClinicChannelRepository.remove(channel): Promise<string \| null>` = `DELETE … RETURNING id` | `find` + delete — com a chave de dados trocada (`ChannelSecretUnreadableError`), o admin não conseguiria nem remover o canal para cadastrá-lo de novo |

- Nada mais nesta mudança é difícil de reverter.

Decisões menores tomadas aqui (reversíveis): o teste sai por `services.email` (o mesmo gateway
que os envios reais usam) em vez de montar o gateway no use case; `last_error` também troca o
e-mail do destinatário e a chave por `<destinatário>` / `<chave>` antes de truncar a 300; em modo
aberto (sem sessão, só dev) o teste responde `409` "Entre com uma conta para testar o canal".

## Checks

### S1 — Configurar o canal · 8 files · ~40 KB · ~10k

**C1** — sem canal, a seção "Canal de e-mail" mostra "Nenhum canal configurado — e-mails automáticos, convites e redefinições não são enviados por esta clínica." e o formulário vazio com Provedor = Resend, Remetente e Chave de API
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "sem canal"`

**C2** — `PUT /api/settings/email-channel` com `provider: 'resend'`, `sender: 'Clínica X <contato@clinicax.com.br>'` e `apiKey` responde `200` com `{ channel: { provider, sender, secretLast4, lastStatus: null, lastStatusAt: null, lastError: null } }`
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "salva o canal"`

**C3** — após salvar, a seção mostra a chave como `••••` + `secretLast4`
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "salva e mostra"`

**C4** — salvar de novo com `apiKey` vazia muda remetente e mantém a chave anterior (o envio seguinte sai com `Bearer <chave antiga>`)
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "mantém a chave"`

**C5** — salvar com `apiKey` preenchida substitui a chave e `lastStatus` volta a `null`
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "substitui a chave"`

**C6** — `sender` inválido (`contato`, `Nome <sem-arroba>`, `a@b`) → `400` com a mensagem do campo; nada é gravado. `Nome <a@b.c>` e `a@b.c` são aceitos
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "remetente inválido"`
Proof: `npx vitest run tests/domain/clinic-channel.test.ts -t "remetente"`

**C7** — primeiro salvamento com `apiKey` vazia → `400` "Chave de API obrigatória"; nada é gravado
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "primeiro salvamento sem chave"`

**C8** — nenhuma resposta (GET/PUT/test/DELETE), log (`console.*`) ou evento de auditoria contém a chave
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "nunca expõe a chave"`

**C9** — `GET` devolve o mesmo formato de C2, ou `{ channel: null }` sem canal
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "GET"`

### S2 — Testar · 5 files · ~25 KB · ~6k

**C10** — `POST /api/settings/email-channel/test` envia pelo canal da clínica (`Bearer <chave da clínica>`) para o e-mail da sessão, assunto `VittaFlow — teste do canal de e-mail`, e responde `200` `{ lastStatus: 'ok', lastStatusAt: <agora>, lastError: null }`; o `GET` seguinte traz `lastStatus: 'ok'`
Proof: `npx vitest run tests/api/email-channel-test.test.ts -t "teste ok"`

**C11** — a tela mostra "Teste enviado para <e-mail> em <data e hora>" após o teste ok
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "teste ok"`

**C12** — provedor recusa: `200` `{ lastStatus: 'failed', lastError }`, `lastError` ≤ 300 caracteres com a mensagem do provedor e sem o e-mail do destinatário
Proof: `npx vitest run tests/api/email-channel-test.test.ts -t "provedor recusa"`

**C13** — a tela mostra `lastError` num `Alert` de erro após o teste falho
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "teste falho"`

**C14** — sem canal: `409` "Configure o canal antes de testar"
Proof: `npx vitest run tests/api/email-channel-test.test.ts -t "sem canal"`

**C15** — 6ª chamada ao teste em 60 s na mesma clínica → `429` (Unresolved 1, default)
Proof: `npx vitest run tests/api/email-channel-test.test.ts -t "limite"`

### S3 — Remover e proteger · 7 files · ~30 KB · ~8k

**C16** — `DELETE` responde `200` `{ removed: true }`, a linha some e o `email` da clínica fica desativado (`isEnabled() === false`)
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "remove o canal"`

**C17** — "Remover canal" abre `ConfirmAction` com "Remover o canal de e-mail? A clínica deixa de enviar e-mails automáticos, convites e redefinições." e, confirmado, chama `DELETE`
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "remover"`

**C18** — trilha da clínica: 1º salvar → `create`, salvar de novo → `update`, teste → `update` + `test-ok`/`test-failed`, remover → `delete`; todos `resourceType: 'clinic_channel'`, `resourceId` = id do canal, `clinicId` da sessão
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "auditoria"`
Proof: `npx vitest run tests/api/email-channel-test.test.ts -t "auditoria"`

**C19** — `atendente`, `profissional`, `patient`, `partner`, `super_admin` em GET/PUT/DELETE e POST `/test` → `403` (table-driven, 5 × 4)
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "403"`

**C20** — `/api/settings/email-channel` e `/test` são família `administrative`
Proof: `npx vitest run tests/lib/route-family.test.ts -t "email-channel"`

**C21** — a seção não aparece para papel sem acesso (identidade `atendente`)
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "não aparece"`

**C22** — `GET` carregando → `LoadingIndicator`; falha → `ErrorAlert` com a mensagem da API
Proof: `npx vitest run tests/pages/configuracoes-email-channel.test.tsx -t "carregando"`

**C23** — o canal de uma clínica não é lido nem apagado pela sessão de outra (admin B não vê o canal de A; DELETE de B não remove o de A)
Proof: `npx vitest run tests/api/email-channel-settings.test.ts -t "outra clínica"`

## Swept

- validation: C6, C7
- failure modes: C12, C14
- idempotency and retry: C4/C5 — `PUT` é upsert por `(clinic_id, channel)`; DELETE sem canal responde `{ removed: true }` igual (idempotente)
- authorization: C19, C20, C21, C23
- concurrency and ordering: Unresolved 2 — última escrita vence (upsert), sem controle de versão
- data lifecycle: C16
- external-dependency failure: C12
- state transitions: C5, C10, C12
- observability: C18; C8 (nada de chave em log)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| papéis barrados (5) | atendente · profissional · patient · partner · super_admin — C19 table-driven | - |
| rotas (4) | GET C9 · PUT C2 · POST /test C10 · DELETE C16; 403 em todas C19 | - |
| ações de auditoria (5) | create · update · test-ok · test-failed · delete — C18 | - |
| `lastStatus` (3) | null C2/C5 · ok C10 · failed C12 | - |
| formas de remetente (2 válidas + 3 inválidas) | C6 | - |

- Claims naming a status code, route or response shape: C2, C4, C5, C6, C7, C8, C9, C10, C12, C14, C15, C16, C19 — cada uma tem prova que chama o handler da rota
- Nenhuma outra check afirma mais que o caso que sua prova exercita

## Handoff

S1–S3 ≈ 24k, bem abaixo de 150k: um agente só, sem handoff.
