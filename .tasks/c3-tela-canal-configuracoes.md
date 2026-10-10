# C3 — Tela do canal de e-mail em `/configuracoes`

> Build this with **tlc-implement**.
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Depois da C1, a única forma de dar um canal a uma clínica é gravar a linha direto no banco. O admin
da clínica, que é quem paga a conta do provedor (decisão do dono, 2026-10-10), não tem onde
informar o remetente nem a chave. Também não tem como saber se a chave funciona antes de um
lembrete real falhar.

Com esta task, `/configuracoes` ganha a seção "Canal de e-mail", visível só para `company_admin`.
Ela permite escolher o provedor (Resend), informar o remetente e a chave (só de escrita), enviar um
e-mail de teste para si e remover o canal.

12 critérios em 3 fatias · 1 porta sem volta · 2 em aberto, 0 bloqueiam

## Criteria

### Configurar o canal

1. Dada clínica sem canal, quando o `company_admin` abre `/configuracoes`, então a seção "Canal de e-mail" mostra "Nenhum canal configurado — e-mails automáticos, convites e redefinições não são enviados por esta clínica." e o formulário vazio (Provedor = Resend, Remetente, Chave de API).
2. Quando ele salva `provider: 'resend'`, `sender: 'Clínica X <contato@clinicax.com.br>'` e `apiKey`, então `PUT /api/settings/email-channel` responde `200` com `{ provider, sender, secretLast4, lastStatus: null, lastStatusAt: null, lastError: null }`, e a seção passa a mostrar a chave como `••••` + `secretLast4`.
3. Dado canal salvo, quando ele salva de novo com `apiKey` vazia, então remetente e provedor mudam e a chave anterior é mantida; com `apiKey` preenchida, a chave é substituída e `last_status` volta a `null`.
4. Se `sender` não é um endereço válido (com ou sem nome, `Nome <a@b.c>` ou `a@b.c`) ou se é o primeiro salvamento e `apiKey` está vazia, então `400` com a mensagem do campo e nada é gravado.
5. Sempre, nenhuma resposta, log ou evento de auditoria contém a chave; `GET /api/settings/email-channel` devolve o mesmo formato de 2, ou `{ channel: null }` sem canal.

### Testar

6. Quando ele clica em "Enviar e-mail de teste", então `POST /api/settings/email-channel/test` envia, pelo canal da clínica, um e-mail para o e-mail da conta logada (assunto `"VittaFlow — teste do canal de e-mail"`, sem dado de paciente), grava `last_status = 'ok'` e `last_status_at = agora`, e a tela mostra "Teste enviado para <e-mail> em <data e hora>".
7. Se o provedor recusa (ex.: domínio não verificado), então `last_status = 'failed'`, `last_error` recebe a mensagem do provedor truncada a 300 caracteres, a resposta é `200` com `{ lastStatus: 'failed', lastError }`, e a tela mostra o erro num `Alert` de erro.
8. Dada clínica sem canal, quando o teste é chamado, então `409` com `"Configure o canal antes de testar"`.

### Remover e proteger

9. Quando ele confirma "Remover canal" (`ConfirmAction`: "Remover o canal de e-mail? A clínica deixa de enviar e-mails automáticos, convites e redefinições."), então `DELETE /api/settings/email-channel` responde `200`, a linha é apagada e o próximo envio da clínica não sai.
10. Sempre, salvar, testar e remover gravam na trilha da clínica `resourceType: 'clinic_channel'`, `resourceId: <id do canal>`, `action: 'create' | 'update' | 'delete'`, com `detail: 'test-ok' | 'test-failed'` no teste.
11. Dada sessão `atendente`, `profissional`, `patient`, `partner` ou `super_admin`, quando ela chama qualquer rota de `/api/settings/email-channel/**`, então `403`, e a seção não aparece em `/configuracoes` para esses papéis.
12. Enquanto `GET /api/settings/email-channel` carrega, a seção mostra `LoadingIndicator`; se falha, `ErrorAlert` com a mensagem da API.

## Out of scope

- Super admin configurar o canal de uma clínica — o dono decidiu que só o `company_admin` configura (2026-10-10).
- Outros provedores no seletor — só Resend nesta entrega.
- Validar a chave ao salvar — o teste é explícito (design doc, Decisions: Teste do canal).

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/configuracoes` seção canal | empty state | 1 |
| screen `/configuracoes` seção canal | loading and error | 12 |
| screen `/configuracoes` seção canal | unauthorised | 11 |
| screen `/configuracoes` seção canal | destructive action confirms | 9 |
| screen `/configuracoes` seção canal | componentes | existing - `@still-void/ui` (`Card`, `Input`, `NativeSelect`, `Button`, `Alert`), como as outras seções |
| API `/api/settings/email-channel` | response and error shape | 2, 4, 5, 8 — envelope `handleRequest` existente |
| API `/api/settings/email-channel` | who may call | 11 |
| API `/api/settings/email-channel/test` | rate limit | Unresolved 1 |
| API | versioning | n/a - API interna do app, sem consumidor externo |

## Swept

- validation: 4
- failure modes: 7, 8
- idempotency and retry: 3 (o `PUT` é upsert por `(clinic_id, channel)`)
- authorization: 11
- concurrency and ordering: Unresolved 2
- data lifecycle: 9
- external-dependency failure: 7
- state transitions: 3, 6, 7 (`last_status`: `null` → `ok`/`failed`; uma chave nova volta a `null`)
- observability: 10

## Impact

| Front | What changes |
|---|---|
| domain | existing term: família `administrative` ganha `/api/settings/email-channel` (`src/lib/auth/route-family.ts`) |
| domain | new term: `resourceType: 'clinic_channel'` na trilha — filtros da tela de auditoria listam tipos conhecidos |
| ui | `src/app/(staff)/configuracoes/page.tsx` ganha uma seção em arquivo próprio (`email-channel-section.tsx`), seguindo `closures-section.tsx` |
| stored data | nada a migrar |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Contrato | `GET` → `{ channel: { provider, sender, secretLast4, lastStatus, lastStatusAt, lastError } \| null }`; `PUT` in `{ provider: 'resend', sender, apiKey? }`; `POST /test` → `{ lastStatus, lastStatusAt, lastError }`; `DELETE` → `{ removed: true }` | Devolver a chave mascarada inteira — vaza comprimento e prefixo |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/settings/email-channel` | — | `channel` | `200`, `403` | 1, 5, 11 |
| `PUT /api/settings/email-channel` | `provider`, `sender`, `apiKey?` | `channel` | `200`, `400`, `403` | 2, 3, 4 |
| `POST /api/settings/email-channel/test` | — | `lastStatus`, `lastStatusAt`, `lastError` | `200`, `403`, `409` | 6, 7, 8 |
| `DELETE /api/settings/email-channel` | — | `removed` | `200`, `403` | 9 |

## Sources

- `.design/canal-por-clinica.md` — Decisions: Quem configura o canal, Teste do canal, Segredo, `last_error`, Auditoria.
- Conversa de discovery, 2026-10-10: "Admin da clínica (Recomendado)" para quem cadastra e troca a chave.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | Limite de taxa do teste | `SharedRateLimiter('email-channel-test', 5, 60_000)` por clínica — confirmado por @KalleoPinheiro em 2026-10-10 |
| 2 | open | Dois admins salvam ao mesmo tempo | Vence a última escrita (upsert); sem controle de versão — confirmado por @KalleoPinheiro em 2026-10-10 |
