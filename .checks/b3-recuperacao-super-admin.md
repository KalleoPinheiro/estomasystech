# B3 — Recuperação de emergência do super_admin

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) - bloco B3: Decision "Recuperação total" (literal: `scripts/recover-super-admin.ts` no servidor com `DATABASE_URL`; limpa fator e códigos, troca e-mail opcional, `session_version + 1`, auditoria de plataforma, imprime link de definir senha; rota com segredo de deploy rejeitada); Journey 12; Shape › Adds (script, ADR emendando o ADR-004) e Changes (`producao.md`)
- [`.checks/b2-segundo-fator-super-admin.md`](b2-segundo-fator-super-admin.md) - o que o B2 deixou: `user_mfa`, `mfa_recovery_codes`, login devolve `mfaEnrollmentRequired` sem fator
- [`.tasks/b1-contencao-super-admin.md`](../.tasks/b1-contencao-super-admin.md) - um único super_admin (`ck_user_accounts_system_role_has_no_clinic` + `uq_user_accounts_single_system_account`)
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) - issue mãe (`Refs #214`)
- Conversa com @KalleoPinheiro, 2026-09-27 - auditoria da recuperação pelo **mesmo caminho do login** (`recordAuditNow`, ator `super_admin`, `clinicId: null`): hoje cai na `legacy-clinic` como os eventos do B2; vira evento de plataforma quando o B6 mudar `resolveActor`, sem tocar no script
- Sem tela: nada de interface neste bloco

## Out of scope

- Trilha de plataforma (`audit_events.clinic_id` nullable, `resolveActor` sem `LEGACY_CLINIC_ID`) - B6; decisão do dono acima
- Enviar o link por e-mail - a caixa de e-mail pode ser justamente o que foi perdido; o operador está no terminal
- Recuperar conta que não seja `super_admin` - clínicas têm reset self-service e o `company_admin`
- Criar o super_admin quando não existe - é o bootstrap (`producao.md` § 8)

## Landing

Toca `scripts/recover-super-admin.ts` (fino, como `reencrypt-clinical-data.ts`), lógica em
`src/infrastructure/persistence/drizzle/recover-super-admin.ts` (coberta pela suíte), `package.json`
(`admin:recover`), docs (`producao.md`, acesso README, ADR-009). Reaproveita `AuthToken.issue`
(`reset`), `DrizzleAuthTokenRepository`, `DrizzleAuditEventRepository`, `recordAuditNow`,
`UNSET_PASSWORD_HASH`, `UserAccount` (validação de e-mail), `isSafeOrigin` de `send-invite.ts`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Invocação | `npm run admin:recover -- [--novo-email=<e-mail>] [--confirmar]` com `DATABASE_URL`, `APP_URL` (e `DATA_ENCRYPTION_KEY`/`AUTH_SECRET` não são necessários); flags por `node:util parseArgs` estrito | argumento posicional, como `import-taxonomy.ts` - duas opções independentes, uma delas booleana, ficam ambíguas por posição |
| Confirmação | sem `--confirmar` é simulação: lê, valida, imprime o plano (`Simulação: nada foi alterado. Rode de novo com --confirmar para aplicar.`) e sai 0 sem escrever | prompt interativo "digite o e-mail" - nada no repositório é interativo e quebra fora de TTY (`vercel env pull` + checkout, container) |
| Códigos de saída | `0` aplicado ou simulado · `2` uso ou pré-condição (flag desconhecida, `APP_URL` ausente/inválida, e-mail inválido, sem super_admin, e-mail em uso) · `1` falha inesperada | `1` para tudo - o operador não distingue "corrija o comando" de "o banco falhou" |
| Atomicidade | tudo numa transação com `SELECT … FOR UPDATE` na conta: apaga `mfa_recovery_codes` e `user_mfa`, troca e-mail, `password_hash = UNSET_PASSWORD_HASH`, `active = true`, `session_version + 1`, invalida tokens de convite/reset não usados, grava o token `reset` novo e o evento de auditoria; falha em qualquer passo → `ROLLBACK`, stderr `Falha: nada foi alterado (transação desfeita).` + erro, saída 1 | passos independentes com relatório do que já foi feito - deixaria a conta sem fator e com a senha antiga válida se parasse no meio |
| Senha antiga | invalidada (`UNSET_PASSWORD_HASH`, nenhuma senha satisfaz) | manter a senha - quem tem a senha vazada e encontra a conta sem fator cadastra o próprio autenticador antes do dono (janela do ADR-008) |
| Link | token `reset`, 1 h, `APP_URL/definir-senha?token=…`, **só no stdout**; tokens `invite`/`reset` anteriores não usados ficam usados | `invite` de 24 h - o operador usa o link na hora, no mesmo terminal; 24 h só aumentam o tempo em que um link impresso em histórico/log vale. Propósito novo (`recovery`) - mesmo efeito do `reset` com migração a mais |
| `APP_URL` | obrigatória e `https://` (ou `http://` loopback), checada antes de abrir o banco; ausente/inválida → saída 2 | `appUrlFromEnv()` - fora de `NODE_ENV=production` cai em `localhost:3000` e imprimiria um link inútil para produção |
| Sem super_admin | saída 2 `Nenhum super_admin nesta instalação. Use o bootstrap (docs/engineering/producao.md § 8).` | criar a conta aqui - duplicaria o bootstrap, único caminho de nascer um super_admin (Leaves do design) |
| E-mail novo | normalizado (trim + minúsculas) e validado por `UserAccount`; igual ao atual → sem troca; usado por **qualquer** outra conta (de qualquer clínica) → saída 2 `O e-mail <x> já é usado por outra conta. Nada foi alterado.` | aceitar como o MT-06 aceita entre clínicas - o login desempata pela senha e o reset por e-mail atingiria as duas contas; a identidade da plataforma fica separada |
| Conta desativada | reativada (`active = true`) e dito no stdout | recusar - deixaria "intervenção direta no banco" como único caminho, que é o que o B3 elimina |
| Auditoria | `recordAuditNow` dentro da transação: `action: 'update'`, `resourceType: 'account-recovery'`, `resourceId: <accountId>`, `detail: 'super_admin_recovered'` ou `'super_admin_recovered;email_changed'`, `actorOverride: { role: 'super_admin', id: 'script:recover-super-admin', clinicId: null }` → hoje `legacy-clinic`, depois do B6 plataforma. Sem e-mail no evento | gravar `clinic_id` nulo agora - é o B6; dono escolheu o caminho do login |
| Registro da decisão | ADR-009 novo, "emenda o ADR-004" (recuperação por script em vez de "intervenção direta no banco"); ADR-004 intocado | nota no ADR-004 - `docs/governance.md`: ADR aceito nunca é editado |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`.

### S1 - Recuperação no banco · 6 arquivos · 45 KB · ~11k

**C1** - Recuperar apaga a linha de `user_mfa` e todos os `mfa_recovery_codes` do super_admin
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "remove o segundo fator e os códigos"`

**C2** - Recuperar incrementa `session_version` em exatamente 1
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "derruba as sessões"`

**C3** - Depois de recuperar, a senha antiga não autentica (`password_hash = UNSET_PASSWORD_HASH`)
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "invalida a senha antiga"`

**C4** - Com `novoEmail`, o e-mail da conta vira o novo normalizado; sem ele, fica o mesmo
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "troca o e-mail"`

**C5** - Devolve link `<APP_URL>/definir-senha?token=<segredo>` de um token `reset` que expira em 1 h; os tokens `invite`/`reset` anteriores não usados ficam usados
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "emite o link de 1 hora"`

**C6** - Grava um evento `update`/`account-recovery` com ator `super_admin`/`script:recover-super-admin`, `detail` do Landing, na `legacy-clinic` (caminho do login), sem o e-mail
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "audita pelo caminho do login"`

**C7** - Sem super_admin → erro `Nenhum super_admin nesta instalação…`; nada gravado
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "sem super_admin"`

**C8** - E-mail novo usado por outra conta → erro `O e-mail … já é usado por outra conta. Nada foi alterado.`; fator, e-mail e `session_version` intactos
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "e-mail em uso"`

**C9** - E-mail novo inválido → erro `Email inválido`; nada gravado
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "e-mail inválido"`

**C10** - Falha no meio (auditoria falha) → nada muda: fator, códigos, senha, e-mail e `session_version` iguais
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "falha no meio desfaz tudo"`

**C11** - Conta desativada volta ativa
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "reativa a conta"`

**C12** - Simulação não escreve nada e devolve o plano (conta, e-mail novo)
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "simulação não altera"`

### S2 - Linha de comando · 3 arquivos · 20 KB · ~5k

**C13** - Com `--confirmar`, imprime o link e a validade de 1 hora e sai 0
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "cli aplica com --confirmar"`

**C14** - Sem `--confirmar`, imprime `Simulação: nada foi alterado…` e sai 0
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "cli simula sem --confirmar"`

**C15** - Flag desconhecida → uso no stderr, saída 2, banco intocado
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "cli recusa flag desconhecida"`

**C16** - `APP_URL` ausente ou `http://` não-loopback → saída 2 antes de abrir o banco
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "cli exige APP_URL segura"`

**C17** - Pré-condição (sem super_admin, e-mail em uso, e-mail inválido) → mensagem no stderr, saída 2
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "cli pré-condição sai 2"`

**C18** - Falha inesperada → stderr `Falha: nada foi alterado (transação desfeita).`, saída 1
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "cli falha inesperada sai 1"`

**C19** - `package.json` tem `admin:recover` → `tsx scripts/recover-super-admin.ts`
Proof: `tests/infrastructure/deploy-config.test.ts -t "admin:recover"`

### S3 - Jornada 12 de ponta a ponta · 2 arquivos · 30 KB · ~8k

**C20** - Super_admin com fator cadastrado → recuperação → `POST /api/auth/set-password` com o link → `POST /api/auth/login` com a senha nova responde 200 `{ mfaEnrollmentRequired: true, pendingToken }` sem `Set-Cookie`
Proof: `tests/api/recover-super-admin.test.ts -t "perdeu tudo"`

**C21** - O cookie de sessão emitido antes da recuperação deixa de valer (`sv` antigo)
Proof: `tests/api/recover-super-admin.test.ts -t "sessão anterior cai"`

### S4 - Docs · 5 arquivos · 40 KB · ~10k

**C22** - `producao.md` tem a seção de recuperação do super_admin com o comando, as flags, os códigos de saída e o link de 1 h; ADR-009 aceito emenda o ADR-004; acesso README cita o procedimento
Proof: `tests/docs/super-admin-docs.test.ts -t "recuperação de emergência"`
Proof: `npm run check:docs`

## Swept

- validation: C9, C15, C16
- failure modes: C7, C8, C10, C17, C18
- idempotency: rodar de novo emite outro link e invalida o anterior (C5); fator já ausente não é erro (C1 roda sobre conta sem fator no teste de repetição de C5)
- authorization: quem tem `DATABASE_URL` já tem o banco (Decision); sem rota nova - nada a proteger no proxy
- concurrency: `SELECT … FOR UPDATE` + `session_version + 1` invalidam token pendente de cadastro em andamento (CAS do B2); C21
- data lifecycle: fator e códigos apagados (C1); tokens anteriores usados (C5)
- dependency failure: banco fora → falha inesperada, saída 1 (C18); e-mail não é usado
- state transitions: com fator → sem fator + sem senha (C1, C3) → senha pelo link → login exige cadastro (C20); inativa → ativa (C11)
- observability: evento de auditoria (C6); stdout com o plano/resultado (C13, C14)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| códigos de saída (3) | `0` C13, C14 · `2` C15, C16, C17 · `1` C18 | - |
| pré-condições que recusam (4) | sem super_admin C7/C17 · e-mail em uso C8/C17 · e-mail inválido C9/C17 · `APP_URL` C16 | - |
| efeitos da recuperação (7) | fator/códigos C1 · `session_version` C2 · senha C3 · e-mail C4 · link/tokens C5 · auditoria C6 · `active` C11 | - |
| `APP_URL` (3) | ausente, `http://` externo → recusa; `https://` → aceita - C16 e C13 | - |

- Claims naming a status code, route or response shape: C20, C21 - proof chama os handlers de `set-password` e `login`
- Nenhuma outra check afirma mais do que o caso que a proof exercita

## Handoff

Lote único: S1–S4 somam ~34k de leitura, abaixo de 150k; nada a passar adiante.
