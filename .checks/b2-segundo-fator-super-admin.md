# B2 — Segundo fator do super_admin

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) - bloco B2: Decisions "Segundo fator", "Login com segundo fator", "Códigos de recuperação"; Shape › Adds (`user_mfa`, `mfa_recovery_codes`, `src/domain/auth/totp.ts`, rotas `/api/auth/mfa/{enroll,verify}`, token pendente) e Changes (`POST /api/auth/login`); Journey 1, 2, 11; Open 3 (chave em texto + `otpauth://`, sem QR)
- [`.tasks/b1-contencao-super-admin.md`](../.tasks/b1-contencao-super-admin.md) - o que o B1 já entregou (família `platform`, `/plataforma`, E2E com `company_admin`)
- [#214](https://github.com/KalleoPinheiro/estomasystech/issues/214) - issue mãe (`Refs #214`)
- Conversa com @KalleoPinheiro, 2026-09-27 - código de recuperação leva a **recadastro obrigatório** antes da sessão (recomendação aceita)
- Sem design de tela vinculante: textos e arranjo das etapas decididos aqui (Landing)

## Out of scope

- Recuperação de emergência (`scripts/recover-super-admin.ts`, runbook) - B3
- QR code no cadastro - Open 3 do design (chave em texto + link `otpauth://`)
- Segundo fator para outros papéis - Boundary Out do design
- Trocar o autenticador de dentro da sessão (sem ter perdido o celular) - nenhuma rota no Shape; o caminho é o código de recuperação
- Trilha de auditoria de plataforma (`clinic_id` nulo) - B6; os eventos de MFA gravam como o login grava hoje

## Landing

Toca `src/app/api/auth/login/route.ts`, novas rotas `src/app/api/auth/mfa/{enroll,verify}/route.ts`, novo caso de uso
`src/application/auth/mfa-login.ts`, domínio `src/domain/auth/{totp,mfa}.ts`, `src/lib/auth/{mfa-pending-token,mfa-recovery-codes}.ts`,
repositório `drizzle-mfa-repository.ts`, migração `0042`, tela `/login` (etapas novas), E2E (`global-setup`, `auth.spec`),
docs (acesso README, CONTEXT, ADR-008). Reaproveita `hashPassword`/`verifyPassword` (scrypt dos códigos),
`currentDataCipher` (segredo cifrado, ADR-006), `createSessionToken`, `SharedRateLimiter`, `recordAuditNow`, `AuthCard`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Tabela `user_mfa` | `account_id text PK → user_accounts.id`, `totp_secret text not null` (payload `DataCipher`), `enrolled_at timestamptz not null`, `last_used_step integer not null`. Linha existe ⇔ fator confirmado | `enrolled_at` nulo para cadastro em andamento - recadastro depois do código de recuperação apagaria o fator antigo antes de o novo ser confirmado |
| Tabela `mfa_recovery_codes` | `id text PK`, `account_id text not null → user_accounts.id`, `code_hash text not null` (`scrypt$…` de `hashPassword`), `used_at timestamptz`, `created_at timestamptz not null`; índice `idx_mfa_recovery_codes_account` | sha256 sem sal - o design pede scrypt |
| Segredo em cadastro não confirmado | viaja cifrado (`DataCipher`) dentro do token pendente de etapa `confirm`; só vai ao banco na confirmação | coluna `pending_totp_secret` - estado a mais no banco para um passo de 5 min |
| Token pendente | `mfa.<payload b64url>.<hmac hex>`; HMAC-SHA256 com chave `HMAC(AUTH_SECRET, "vitta-flow/mfa-pending/v1")`; payload `{ p: "mfa", sub: <accountId>, sv, exp, st: "verify" \| "enroll" \| "confirm", sec? }`; validade 5 min contada a cada emissão; aceito só se a conta existe, está ativa, é `super_admin` e `session_version = sv` | assinar com o mesmo HMAC do cookie - separação de domínio impede um token virar o outro |
| Uso único do token de cadastro | confirmar o cadastro incrementa `session_version` por compare-and-set (`… WHERE session_version = sv`), na mesma transação que grava fator e códigos; todo token pendente e sessão anterior da conta morre; a sessão nova nasce com `sv + 1` | tabela de tokens pendentes - contradiz o token HMAC sem estado da Decision |
| Contrato do login do super_admin | `200 { success, data: { mfaRequired: true, pendingToken } }` (fator cadastrado) ou `{ mfaEnrollmentRequired: true, pendingToken }` (sem fator); **sem** `Set-Cookie` | sessão parcial com flag - descartada no design |
| `POST /api/auth/mfa/enroll` | in `{ pendingToken }` (etapa `enroll`) · out `{ secret, otpauthUri, pendingToken }` (etapa `confirm`); `otpauthUri` = `otpauth://totp/VittaFlow:<email>?secret=<base32>&issuer=VittaFlow&algorithm=SHA1&digits=6&period=30` | — |
| `POST /api/auth/mfa/verify` | in `{ pendingToken, code }` (6 dígitos) ou `{ pendingToken, recoveryCode }`; etapa `verify`+`code` → 200 `{ ok: true }` + cookie; etapa `confirm`+`code` → 200 `{ recoveryCodes: string[10] }` + cookie; etapa `verify`+`recoveryCode` → 200 `{ mfaEnrollmentRequired: true, pendingToken }` sem cookie | sessão direta com código de recuperação - dono escolheu recadastro obrigatório |
| Erros das rotas de MFA | envelope `fail` existente. Token ausente/inválido/expirado/etapa errada → 401 `Verificação expirada. Entre novamente com e-mail e senha.`; código errado → 401 `Código inválido`; código de recuperação errado → 401 `Código de recuperação inválido`; body sem exatamente um de `code`/`recoveryCode` ou `code` fora de `^\d{6}$` → 400 `Informe o código de 6 dígitos ou um código de recuperação` | um 401 genérico para tudo - o usuário não saberia se redigita o código ou refaz o login |
| Limite de tentativas no passo do código | `SharedRateLimiter('mfa-verify', 5, 60_000)` por **conta** (não por IP), antes de validar o código: 6ª chamada no minuto → 429 `Muitas tentativas, aguarde um minuto` | queimar o token após N erros - exige estado no servidor (tabela) e o atacante com a senha pede outro token; o limite por conta vale entre tokens |
| Formato do código de recuperação | 10 caracteres do alfabeto `abcdefghjkmnpqrstuvwxyz23456789` em `xxxxx-xxxxx`; entrada normalizada (minúsculas, sem espaço/hífen) | 8 dígitos - menos entropia (~27 bits contra ~49) |
| Recadastro | código de recuperação válido é consumido (`UPDATE … WHERE used_at IS NULL RETURNING`) e devolve token de etapa `enroll`; o fator antigo vale até o novo ser confirmado; confirmar apaga os códigos anteriores e grava 10 novos | — |
| Tela do segundo fator | etapas dentro de `/login` (estado do componente; o token pendente nunca vai para URL nem storage): senha → código (link "Usar um código de recuperação") ou cadastro (chave em texto + link `otpauth://` + campo do código) → códigos de recuperação com botão `Continuar` para `/plataforma` | página em `src/app/plataforma/` como diz o Shape - a família `platform` exige sessão, e o cadastro acontece antes dela |
| Auditoria | `read`/`session` com `detail`: `mfa_required` (senha ok), `mfa_verified`, `mfa_enrolled`, `mfa_recovery_code_used`, `mfa_invalid_code`, `mfa_invalid_recovery_code`; ator `super_admin` | só o evento final - perde tentativas erradas |
| Registro da decisão | ADR-008 novo, "complementa o ADR-007"; ADR-007 intocado | emendar o ADR-007 - `docs/governance.md`: ADR aceito nunca é editado |
| Login do super_admin no E2E | `global-setup` faz login → enroll → calcula o TOTP da chave devolvida (réplica RFC 6238 em `e2e/support/totp.ts`) → verify; grava a chave e o último passo usado em `e2e/.auth/super-admin-totp.json` para o `auth.spec` | cookie assinado de super_admin - não exercitaria o login em duas etapas |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`; E2E: `npx playwright test <spec> -g "<nome>"`.

### S1 - TOTP e códigos de recuperação · 4 arquivos · 20 KB · ~5k

**C1** - `totpCode` reproduz os vetores SHA-1 do RFC 6238 (T = 59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000), truncados a 6 dígitos
Proof: `tests/domain/totp.test.ts -t "vetores do RFC 6238"`

**C2** - `verifyTotp` aceita o passo atual, o anterior e o seguinte; recusa ±2
Proof: `tests/domain/totp.test.ts -t "janela de ±1 passo"`

**C3** - `verifyTotp` recusa passo ≤ `last_used_step` (mesmo código duas vezes)
Proof: `tests/domain/totp.test.ts -t "não aceita passo já usado"`

**C4** - `otpauthUri` tem a forma literal do Landing, com e-mail codificado
Proof: `tests/domain/totp.test.ts -t "otpauth"`

**C5** - São gerados 10 códigos distintos no formato `xxxxx-xxxxx`; hash é `scrypt$…`; a verificação normaliza maiúsculas, espaços e hífen
Proof: `tests/lib/mfa-recovery-codes.test.ts -t "gera 10 códigos"`
Proof: `tests/lib/mfa-recovery-codes.test.ts -t "normaliza"`

### S2 - Token pendente · 2 arquivos · 10 KB · ~3k

**C6** - Token válido por 5 min; expirado, adulterado, de outro segredo ou sem prefixo `mfa.` → nulo
Proof: `tests/lib/mfa-pending-token.test.ts -t "validade de 5 minutos"`
Proof: `tests/lib/mfa-pending-token.test.ts -t "recusa adulterado"`

**C7** - Um cookie de sessão não passa por token pendente, e um token pendente não passa por cookie de sessão
Proof: `tests/lib/mfa-pending-token.test.ts -t "separação de domínio"`

### S3 - Login em duas etapas · 8 arquivos · 70 KB · ~18k

**C8** - Super_admin com fator e senha correta → 200 `{ mfaRequired: true, pendingToken }`, sem `Set-Cookie`
Proof: `tests/api/mfa-login.test.ts -t "com fator, o login pede o código"`

**C9** - Super_admin sem fator → 200 `{ mfaEnrollmentRequired: true, pendingToken }`, sem `Set-Cookie`
Proof: `tests/api/mfa-login.test.ts -t "sem fator, o login exige o cadastro"`

**C10** - Demais papéis continuam recebendo a sessão direto no login
Proof: `tests/api/mfa-login.test.ts -t "recebe a sessão direto, sem segundo fator"`

**C11** - `verify` com código TOTP correto → 200 + cookie de sessão `super_admin` com a `session_version` da conta
Proof: `tests/api/mfa-login.test.ts -t "código correto emite a sessão"`

**C12** - O mesmo código (mesmo passo) usado duas vezes → a segunda recebe 401 `Código inválido`
Proof: `tests/api/mfa-login.test.ts -t "código reusado"`

**C13** - Código errado → 401 `Código inválido`, sem cookie; auditoria `mfa_invalid_code`
Proof: `tests/api/mfa-login.test.ts -t "código errado"`

**C14** - 6ª tentativa de `verify` da mesma conta no minuto → 429 `Muitas tentativas, aguarde um minuto`, mesmo com código certo
Proof: `tests/api/mfa-login.test.ts -t "limite por conta"`

**C15** - Token ausente, adulterado, expirado, de etapa errada, de conta inativa ou com `sv` antigo → 401 `Verificação expirada. Entre novamente com e-mail e senha.`
Proof: `tests/api/mfa-login.test.ts -t "token pendente inválido"`

**C16** - Body sem `code` nem `recoveryCode`, com os dois, ou `code` que não tem 6 dígitos → 400 com a mensagem do Landing
Proof: `tests/api/mfa-login.test.ts -t "valida o corpo"`

**C17** - `/api/auth/mfa/enroll` e `/api/auth/mfa/verify` são públicas no proxy: passam sem sessão e com sessão de qualquer papel (a autorização é o token pendente)
Proof: `tests/proxy.test.ts -t "rotas de segundo fator são públicas"`

### S4 - Cadastro obrigatório · 3 arquivos · 30 KB · ~8k

**C18** - `enroll` com token de etapa `enroll` → 200 `{ secret (base32, 32 chars), otpauthUri, pendingToken }`; nada gravado em `user_mfa`
Proof: `tests/api/mfa-login.test.ts -t "cadastro devolve a chave"`

**C19** - `enroll` com token de etapa `verify` ou `confirm` → 401
Proof: `tests/api/mfa-login.test.ts -t "cadastro só com token de cadastro"`

**C20** - Confirmar com código da chave nova → 200 com 10 códigos de recuperação + cookie; `user_mfa` gravado com segredo cifrado (≠ texto da chave) e `last_used_step`; 10 hashes em `mfa_recovery_codes`
Proof: `tests/api/mfa-login.test.ts -t "confirmar o cadastro"`

**C21** - Os códigos só aparecem na confirmação: o banco guarda só hash, e reusar o token de confirmação → 401
Proof: `tests/api/mfa-login.test.ts -t "códigos exibidos uma única vez"`

**C22** - Confirmar com código errado → 401 `Código inválido`, nada gravado
Proof: `tests/api/mfa-login.test.ts -t "confirmação com código errado"`

**C23** - Confirmar revoga sessões e tokens pendentes anteriores da conta (`session_version + 1`)
Proof: `tests/api/mfa-login.test.ts -t "confirmar revoga o que havia antes"`
Proof: `tests/api/mfa-login.test.ts -t "emitido antes do recadastro"` (cookie anterior → `401` no proxy, #246)

### S5 - Código de recuperação · 2 arquivos · 25 KB · ~6k

**C24** - `verify` com código de recuperação válido → 200 `{ mfaEnrollmentRequired: true, pendingToken }`, sem cookie; o código fica usado
Proof: `tests/api/mfa-login.test.ts -t "código de recuperação leva ao recadastro"`

**C25** - Código de recuperação já usado ou inexistente → 401 `Código de recuperação inválido`
Proof: `tests/api/mfa-login.test.ts -t "código de recuperação usado"`

**C26** - Depois do código de recuperação, o fator antigo continua valendo até o novo ser confirmado; confirmado o novo, o antigo não vale e os códigos anteriores somem
Proof: `tests/api/mfa-login.test.ts -t "recadastro troca fator e códigos"`

**C27** - Duas requisições simultâneas com o mesmo código de recuperação → uma 200, outra 401
Proof: `tests/api/mfa-login.test.ts -t "concorrência no código de recuperação"`

### S6 - Tela · 2 arquivos · 25 KB · ~6k

**C28** - `/login`: resposta `mfaRequired` mostra o campo `Código do autenticador`; enviar chama `verify` e leva a `/plataforma`
Proof: `tests/pages/login.test.tsx -t "etapa do código"`

**C29** - `/login`: resposta `mfaEnrollmentRequired` mostra a chave em texto e o link `otpauth://`, sem QR; confirmar mostra os 10 códigos uma vez e `Continuar` leva a `/plataforma`
Proof: `tests/pages/login.test.tsx -t "cadastro do segundo fator"`

**C30** - `/login`: "Usar um código de recuperação" troca o campo; código válido abre o cadastro
Proof: `tests/pages/login.test.tsx -t "código de recuperação"`

**C31** - Só `@still-void/ui` na tela nova
Proof: `npm run check:sv`

### S7 - Migração, docs e E2E · 12 arquivos · 90 KB · ~22k

**C32** - Migração 0042 cria `user_mfa` e `mfa_recovery_codes` com as colunas do Landing; FK para `user_accounts`
Proof: `tests/infrastructure/mfa-migration.test.ts -t "cria as tabelas do segundo fator"`

**C33** - Acesso README, CONTEXT e o ADR-008 (novo) registram o segundo fator obrigatório do super_admin, os códigos de recuperação e o recadastro; `check:docs` passa
Proof: `tests/docs/super-admin-docs.test.ts -t "segundo fator"`
Proof: `npm run check:docs`

**C34** - Super_admin entra por `/login` com senha + código TOTP e termina em `/plataforma`
Proof: `e2e/auth.spec.ts -g "Super Admin entra e termina em /plataforma"`

**C35** - A suíte E2E roda nas duas configs com o super_admin passando pelo segundo fator no `global-setup`
Proof: `npx playwright test`
Proof: `npm run build && npx playwright test -c playwright.prod.config.ts`

## Swept

- validation: C16, C19
- failure modes: C13, C15, C22, C25
- idempotency: C12 (mesmo código), C21 (token de confirmação), C25 (código de recuperação)
- authorization: C8, C9, C15, C17, C19
- concurrency: C12 (compare-and-set em `last_used_step`), C23 (compare-and-set em `session_version`), C27
- data lifecycle: C20, C26 (códigos antigos apagados no recadastro); fator removido só pelo B3
- dependency failure: n/a - sem serviço externo; limite cai no contador da réplica se o banco falhar (existente)
- state transitions: sem fator → cadastro (C9, C20); com fator → código (C8, C11) ou recuperação → recadastro (C24, C26)
- observability: auditoria dos detalhes do Landing - C13 (erro); sucesso nos testes de C11/C20/C24

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| etapas do token (3) | `verify` C11 · `enroll` C18 · `confirm` C20 | - |
| etapa × rota errada (4) | verify-token no enroll C19 · confirm-token no enroll C19 · enroll-token no verify C15 · recoveryCode com confirm-token C15 | - |
| motivos de token inválido (6) | ausente, adulterado, expirado, etapa errada, conta inativa, `sv` antigo - table-driven em C15 | - |
| janela TOTP (5 passos) | −2, −1, 0, +1, +2 em C2 | - |
| respostas do login do super_admin (2) | `mfaRequired` C8 · `mfaEnrollmentRequired` C9 | - |
| assemblies do login do super_admin (2) | API C8–C11 · E2E C34 | - |

- Claims naming a status code, route or response shape: C8, C9, C11–C16, C18–C27 - cada uma com proof que chama o handler
- Nenhuma outra check afirma mais do que o caso que a proof exercita

## Handoff

Lote único: S1–S7 somam ~68k de leitura, abaixo de 150k; nada a passar adiante.
