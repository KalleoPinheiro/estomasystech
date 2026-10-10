# C4 — `/plataforma` organizado: navegação, status do canal e taxonomia

Sources:

- [KalleoPinheiro/vitta-flow#267](https://github.com/KalleoPinheiro/vitta-flow/issues/267) — a issue; aponta para a task
- `.tasks/c4-plataforma-organizada.md` — critérios 1–9, Decided (contrato `emailChannel`), Impact (botões "Auditoria" da lista saem), Unresolved 1 (default: botão desabilitado)
- `.design/canal-por-clinica.md` — Decisions: Status na plataforma, Taxonomia; Success (sinal precoce)

Profile: `light` (AGENTS.md não declara outro).

## Out of scope

- Upload do catálogo licenciado pela tela — design doc, Decisions: Taxonomia.
- Configurar o canal de uma clínica pela plataforma — só o `company_admin` (C3).
- Mostrar `last_error` (ou `sender`) ao super admin — design doc, Decisions: Status na plataforma.

## Landing

Toca `src/app/plataforma/` (layout ganha `platform-nav.tsx`; lista e detalhe ganham o status; página
nova `taxonomia/page.tsx`), `src/lib/dto/clinic.ts` (`emailChannel` nos dois DTOs da plataforma), as
rotas `GET /api/platform/clinics[/id]` e o repositório de canal (`findStatus`). Reaproveita
`StatusBadge`, `ConfirmAction`, `ErrorAlert`/`LoadingIndicator`, `apiFetch`, `formatDateTime`,
`headerClasses` (mesmo molde de `StaffNav`) e a rota de importação existente, sem mudá-la.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Contrato (Decided na task) | `emailChannel: { configured: boolean; provider: 'resend' \| null; lastStatus: 'ok' \| 'failed' \| null; lastStatusAt: string \| null }` em `PlatformClinicSummaryDto` e `PlatformClinicDto` | incluir `sender`/`lastError` — dado operacional da clínica (ADR-007) |
| Status lido sem decifrar a chave | `ClinicChannelRepository.findStatus(channel): Promise<ClinicChannelStatus \| null>`, `ClinicChannelStatus = { provider, lastStatus, lastStatusAt }`, `SELECT` só das colunas de metadado | `find()` — decifra a chave: com a chave de dados trocada (`ChannelSecretUnreadableError`) a lista inteira da plataforma responderia 500, e a chave em claro passaria pela memória da rota da plataforma sem necessidade |

- Nada mais nesta mudança é difícil de reverter.

Decisões menores (reversíveis): cor do selo — configurado `completed`, falhando `out_of_stock`
(perigo), não testado `pending`, sem canal `cancelled`; "Clínicas" fica marcado também em
`/plataforma/clinicas/*` (o detalhe e o cadastro são da seção Clínicas); o detalhe sem canal mostra
"Provedor: —" e "Nunca testado"; o link "Trilha da plataforma" da lista sai (Impact da task), o
voltar "Clínicas" do cabeçalho das subpáginas fica.

## Checks

### S1 — Navegação · 4 files · ~12 KB · ~3k

**C1** — o topo de `/plataforma` tem uma `navigation` com exatamente os links "Clínicas" → `/plataforma`, "Auditoria" → `/plataforma/auditoria`, "Taxonomia" → `/plataforma/taxonomia`, nessa ordem
Proof: `npx vitest run tests/pages/plataforma-nav.test.tsx -t "três links"`

**C2** — o link da seção atual tem `aria-current="page"` e os outros não, para os caminhos `/plataforma`, `/plataforma/clinicas/c1`, `/plataforma/clinicas/nova`, `/plataforma/auditoria`, `/plataforma/taxonomia` (table-driven)
Proof: `npx vitest run tests/pages/plataforma-nav.test.tsx -t "aria-current"`

**C3** — a lista `/plataforma` não tem mais o link "Trilha da plataforma"
Proof: `npx vitest run tests/pages/plataforma.test.tsx -t "sem o link da trilha"`

**C4** — no app real, o super admin vê a navegação e chega à Taxonomia por ela
Proof: `npx playwright test e2e/plataforma.spec.ts -g "navegação da plataforma"`

### S2 — Status do canal por clínica · 9 files · ~45 KB · ~11k

**C5** — `GET /api/platform/clinics` traz, por clínica, `emailChannel` igual a: sem canal `{ configured: false, provider: null, lastStatus: null, lastStatusAt: null }`; canal não testado `{ configured: true, provider: 'resend', lastStatus: null, lastStatusAt: null }`; teste ok `{ …, lastStatus: 'ok', lastStatusAt: <ISO gravado> }`; teste falho `{ …, lastStatus: 'failed', lastStatusAt: <ISO> }`
Proof: `npx vitest run tests/api/platform-clinic-email-status.test.ts -t "lista"`

**C6** — `GET /api/platform/clinics/[id]` traz o mesmo `emailChannel` (sem canal e teste falho)
Proof: `npx vitest run tests/api/platform-clinic-email-status.test.ts -t "detalhe"`

**C7** — o corpo das duas respostas não contém as chaves `sender`, `secretLast4`, `lastError`, nem o remetente, os 4 últimos da chave, a chave ou a mensagem de erro gravada
Proof: `npx vitest run tests/api/platform-clinic-email-status.test.ts -t "nunca expõe"`

**C8** — com a chave gravada indecifrável (payload adulterado), a lista e o detalhe respondem `200` com `configured: true` — o status não decifra a chave
Proof: `npx vitest run tests/api/platform-clinic-email-status.test.ts -t "indecifrável"`

**C9** — `findStatus` lê só a clínica do escopo e recusa o escopo de sistema
Proof: `npx vitest run tests/infrastructure/drizzle-clinic-channel-repository.test.ts -t "findStatus"`

**C10** — a lista mostra, por linha, "E-mail: configurado" (ok), "E-mail: falhando" (failed), "E-mail: não testado" (configurado sem teste), "E-mail: sem canal" (table-driven, 4 linhas)
Proof: `npx vitest run tests/pages/plataforma.test.tsx -t "status do canal"`

**C11** — o detalhe mostra o mesmo selo, "Provedor: Resend" e "Último teste: <formatDateTime(lastStatusAt)>"
Proof: `npx vitest run tests/pages/plataforma-clinica.test.tsx -t "canal testado"`

**C12** — o detalhe de canal não testado mostra "Nunca testado"; sem canal mostra "E-mail: sem canal", "Provedor: —" e "Nunca testado"
Proof: `npx vitest run tests/pages/plataforma-clinica.test.tsx -t "nunca testado"`

**C13** — no app real, uma clínica recém-criada aparece na lista com "E-mail: sem canal"
Proof: `npx playwright test e2e/plataforma.spec.ts -g "cria clínica pela tela"`

### S3 — Taxonomia · 4 files · ~15 KB · ~4k

**C14** — `/plataforma/taxonomia` mostra o texto do critério 5 literal e o botão "Importar catálogo de estomaterapia"
Proof: `npx vitest run tests/pages/plataforma-taxonomia.test.tsx -t "estado inicial"`

**C15** — clicar abre `ConfirmAction` com "Importar o catálogo de estomaterapia para todas as clínicas?"; cancelar não chama a API
Proof: `npx vitest run tests/pages/plataforma-taxonomia.test.tsx -t "confirmação"`

**C16** — confirmado, chama `POST /api/platform/taxonomy/import` uma vez e mostra "Diagnósticos: 7", "Resultados: 5", "Intervenções: 6", "Ligações: 9" a partir da resposta `{ diagnoses: 7, outcomes: 5, interventions: 6, linkages: 9 }`
Proof: `npx vitest run tests/pages/plataforma-taxonomia.test.tsx -t "contagens"`

**C17** — falha da API → `ErrorAlert` com a mensagem devolvida e o botão habilitado de novo
Proof: `npx vitest run tests/pages/plataforma-taxonomia.test.tsx -t "falha"`

**C18** — com a chamada pendente, o botão está desabilitado e há `LoadingIndicator` (`role="status"`)
Proof: `npx vitest run tests/pages/plataforma-taxonomia.test.tsx -t "enquanto"`

**C19** — `company_admin`, `atendente`, `profissional` → `307` para `/`; `patient`, `partner` → `307` para `/portal`; sem sessão → `/login` ao abrir `/plataforma/taxonomia` (table-driven)
Proof: `npx vitest run tests/proxy.test.ts -t "plataforma/taxonomia"`

**C20** — no app real, o super admin importa pela tela e vê as contagens
Proof: `npx playwright test e2e/plataforma.spec.ts -g "importa o catálogo"`

## Swept

- validation: n/a — nenhuma entrada nova; a importação não recebe corpo
- failure modes: C17; C8 (chave indecifrável não derruba a lista)
- idempotency and retry: existing — `importTaxonomyCatalog` ignora o que já existe (`src/application/taxonomy/import-taxonomy-catalog.ts`, comentário)
- authorization: C19; rotas `GET /api/platform/clinics[/id]` já são família `platform` (existing)
- concurrency and ordering: Unresolved 1 da task — default: botão desabilitado durante a chamada (C18)
- data lifecycle: n/a — nada novo é guardado
- external-dependency failure: n/a — sem serviço externo
- state transitions: n/a — o status é escrito pela C3; aqui só é lido
- observability: C5, C10, C11

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| estados do canal (4) | sem canal C5/C10/C12 · não testado C5/C10/C12 · ok C5/C10/C11 · failed C5/C6/C10 | - |
| links da navegação (3) | Clínicas · Auditoria · Taxonomia — C1, C2 | - |
| caminhos para `aria-current` (5) | `/plataforma` · `/clinicas/c1` · `/clinicas/nova` · `/auditoria` · `/taxonomia` — C2 table-driven | - |
| contagens (4) | diagnoses · outcomes · interventions · linkages — C16 | - |
| papéis barrados (5 + anônimo) | company_admin · atendente · profissional · patient · partner · sem sessão — C19 | - |
| rotas com `emailChannel` (2) | lista C5 · detalhe C6 | - |

- Claims naming a status code, route or response shape: C5, C6, C7, C8, C19 — cada uma tem prova que chama o handler da rota ou o proxy
- Nenhuma outra check afirma mais que o caso que sua prova exercita

## Handoff

S1–S3 ≈ 18k, bem abaixo de 150k: um agente só, sem handoff.
