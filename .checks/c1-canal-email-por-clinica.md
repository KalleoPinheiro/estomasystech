# C1 — Canal de e-mail por clínica

Sources:

- [KalleoPinheiro/vitta-flow#264](https://github.com/KalleoPinheiro/vitta-flow/issues/264) — a issue; aponta para a task
- `.tasks/c1-canal-email-por-clinica.md` — critérios 1–11, Decided, Unresolved 1
- `.design/canal-por-clinica.md` — Decisions: Modelo de envio, Tabela, Segredo, Resolução do gateway, E-mail da plataforma, Boot em produção, ADR

Profile: `light` (AGENTS.md não declara outro).

## Out of scope

- Trocar convite, redefinição e lembretes para o canal da clínica — C2 (#265). Até lá, `reminders/run` continua passando o gateway de `systemScope()` (o da plataforma) para `SendReminders`.
- API e tela do canal — C3 (#266). Status em `/plataforma` — C4 (#267).
- Outros provedores e WhatsApp.

## Landing

Toca `schema.ts` + migração 0047, `src/domain/clinic/clinic-channel.ts` (novo), um repositório Drizzle novo no molde do `DrizzleGoogleAccountRepository` (com a cifra injetada, como os repositórios clínicos), a porta `email-gateway.ts`, `resend-email-gateway.ts` e `container.ts`. Reaproveita `currentDataCipher()` (ADR-006), `ResendEmailGateway` e o molde preguiçoso de `LazyCalendarGateway`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Tabela `clinic_channels` | colunas da task (Decided, Tabela); `uq_clinic_channels_clinic_channel` unique `(clinic_id, channel)`; `clinic_channels_channel_check` `channel IN ('email')`; `clinic_channels_last_status_check` `last_status IS NULL OR last_status IN ('ok','failed')`; `clinic_channels_provider_check` `provider IN ('resend')` | colunas em `clinics` — não comporta o 2º canal sem outra migração |
| Porta `EmailGateway`: `readonly enabled: boolean` → `isEnabled(): Promise<boolean>` | `interface EmailGateway { isEnabled(): Promise<boolean>; send(message): Promise<void> }`; `LazyEmailGateway` resolve o concreto no 1º uso | manter `enabled` síncrono e ler o canal em todo `getRepositories` — uma consulta por request, o custo que o `LazyCalendarGateway` existe para evitar; ou um getter `enabled` que lança antes de resolver — falha só em runtime |
| Repositório de canal recusa escopo de sistema | `DrizzleClinicChannelRepository` com `clinicId === null` lança `Error('Canal de comunicação exige escopo de clínica')` em `find`/`save` | `withTenant` com `null` devolve a linha de qualquer clínica — vazaria a chave de uma clínica para o escopo da plataforma |
| Fábrica de gateway por provedor | `EMAIL_PROVIDER_GATEWAYS: Record<EmailProvider, (cfg: { apiKey: string; from: string }) => EmailGateway>` em `resend-email-gateway.ts` | `if provider === 'resend'` no container — o próximo provedor mexeria no container |

- Nada mais nesta mudança é difícil de reverter.

## Checks

### S1 — Canal guardado com segredo cifrado · 4 files · 62 KB · ~16k

**C1** — `save` de um canal `email`/`resend` com `apiKey = 're_abc123XYZ9'` grava `encrypted_secret` diferente da chave e `secret_last4 = 'XYZ9'`; `find('email')` devolve a chave decifrada igual à original
Proof: `npx vitest run tests/infrastructure/drizzle-clinic-channel-repository.test.ts -t "cifra a chave"`

**C2** — o banco recusa a 2ª linha `(clinic_id, channel)` (`23505`, `uq_clinic_channels_clinic_channel`), `channel` fora de `('email')`, `provider` fora de `('resend')` e `last_status` fora de `('ok','failed')` (`23514`)
Proof: `npx vitest run tests/infrastructure/clinic-channels-migration.test.ts`

**C3** — no escopo da clínica A, com o canal de B gravado, `find('email')` devolve `null`; no escopo de sistema, `find` lança
Proof: `npx vitest run tests/infrastructure/drizzle-clinic-channel-repository.test.ts -t "isolamento"`

### S2 — Gateway resolvido pelo escopo · 6 files · 41 KB · ~11k

**C4** — com canal salvo na clínica A, `getRepositories(clinicScope(A)).email.send` faz POST ao Resend com `Bearer <chave de A>` e `from = <sender de A>`, e `isEnabled()` resolve `true`
Proof: `npx vitest run tests/infrastructure/email-gateway-scope.test.ts -t "canal da clínica"`

**C5** — clínica B sem canal, com `RESEND_API_KEY`/`EMAIL_FROM` definidas: `isEnabled()` resolve `false` e `send` não chama `fetch`
Proof: `npx vitest run tests/infrastructure/email-gateway-scope.test.ts -t "sem canal"`

**C6** — `systemScope()` com as variáveis da plataforma envia pela chave da plataforma; sem elas, `isEnabled()` resolve `false`
Proof: `npx vitest run tests/infrastructure/email-gateway-scope.test.ts -t "plataforma"`

**C7** — duas clínicas com canais diferentes enviam cada uma com a própria chave, em ordem intercalada, na mesma instância do processo
Proof: `npx vitest run tests/infrastructure/email-gateway-scope.test.ts -t "intercaladas"`

**C8** — segredo que não decifra deixa o gateway da clínica `isEnabled() === false` e um `logError` com o id da clínica, sem a chave e sem o texto cifrado
Proof: `npx vitest run tests/infrastructure/email-gateway-scope.test.ts -t "não decifra"`

### S3 — E-mail da plataforma opcional · 5 files · 40 KB · ~10k

**C9** — `NODE_ENV=production` sem `RESEND_API_KEY`: `platformEmailGateway()` não lança e devolve gateway com `isEnabled() === false`
Proof: `npx vitest run tests/infrastructure/resend-email-gateway.test.ts -t "produção sem credenciais"`

**C10** — em produção, o log do gateway nulo não contém o link de senha (comportamento existente, mantido)
Proof: `npx vitest run tests/infrastructure/email-gateway.test.ts -t "Dado produção, Quando send"`

**C11** — `docs/adr/011-canal-de-comunicacao-por-clinica.md` existe com status `aceito`, e o ADR-004 aponta para ele
Proof: `grep -q '\*\*Status:\*\* aceito' docs/adr/011-canal-de-comunicacao-por-clinica.md && grep -q '011-canal-de-comunicacao-por-clinica' docs/adr/004-remocao-google-oauth-autenticacao.md`
Proof: `npm run check:docs`

## Handoff

S1–S3 ≈ 37k tokens de leitura, bem abaixo de 150k: uma só batch, sem handoff.

## Swept

- validation: C2 (constraints); a validação de `sender` é da C3
- failure modes: C8
- idempotency: `save` é upsert por `(clinic_id, channel)` — C1 regrava sobre a mesma linha
- authorization: C3
- concurrency: C7
- data lifecycle: n/a — tabela nova e vazia; a remoção é da C3
- dependency failure: existente — `ResendEmailGateway.send` lança em não-2xx, com timeout de 10 s
- state transitions: n/a
- observability: C8

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| escopo do gateway (3) | clínica com canal C4 · clínica sem canal C5 · sistema C6 | - |
| constraints de `clinic_channels` (4) | unique C2 · channel C2 · provider C2 · last_status C2 | - |
| montagens do container (1) | `getRepositories` é a única montagem, usada pela suíte e pela aplicação | - |

- Nenhum check afirma status HTTP, rota ou formato de resposta.
