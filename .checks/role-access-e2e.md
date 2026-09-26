# Acesso por papel às listas auxiliares, taxonomia e E2E por papel

Profile: `standard` (tlc-implement) · handoff: `on`.

Sources:

- [#188](https://github.com/KalleoPinheiro/vitta-flow/issues/188) - Atendente sem profissional e sem catálogo (403 em `/api/professionals` e `/api/procedures`)
- [#189](https://github.com/KalleoPinheiro/vitta-flow/issues/189) - Profissional sem SAE (403 em `/api/taxonomy/**`), sem nomes de profissionais, aba Pacotes 403
- [#204](https://github.com/KalleoPinheiro/vitta-flow/issues/204) - E2E da equipe roda só como Super Admin
- Regras: `AGENTS.md` (escopo de empresa, auth fail-closed, `@still-void/ui`, nunca inventar regra), [ADR-001](../docs/adr/001-multi-tenancy.md), [ADR-002](../docs/adr/002-autorizacao-em-duas-camadas.md)

## Out of scope

- Menu e dashboard filtrados por papel - #199 (o smoke por papel marca as telas fora do papel como pendência da #199, não as corrige)
- Hierarquia de `/api/accounts` - #184 (sessão paralela)
- Exportação LGPD e allowlist de subrotas clínicas de `/api/patients/:id/*` - #185 (sessão paralela)
- Vínculo R4 nas rotas clínicas por id e filtro de follow-ups/waitlist por vínculo - #186 (sessão paralela)
- Mensagem 404 sem UUID em todas as rotas (`NotFoundError`) - #219; aqui só a ficha do paciente deixa de exibir o UUID
- Documento impresso do Plano de Cuidados como Profissional (`/documentos/plano-cuidados/:id` lê `/api/professionals/:id` para a assinatura com registro profissional) - não é critério das issues; registrado como pendência no PR
- Pacotes visíveis para o Profissional - pergunta aberta da #189; padrão seguro aplicado (aba some)
- Autoria forjável da SAE - #200

## Landing

Toca `src/lib/auth/route-family.ts` (taxonomia vira `clinical`), duas rotas novas de leitura
`src/app/api/options/{professionals,procedures}/route.ts` + DTOs reduzidos em `src/lib/dto/options.ts`,
as telas `agenda/{page,appointment-form,waitlist-panel}.tsx`, `pacientes/[id]/{page,evolutions-section}.tsx`,
e a infraestrutura E2E (`playwright.config.ts`, `e2e/global-setup.ts`, `e2e/support/{constants,roles,slots,seed-data}.ts`,
specs novos `e2e/papeis-*.spec.ts`). Reaproveita `requireStaffSession`, `sessionScope`, `useApiQuery`, `ErrorAlert`,
`NullEmailGateway` (link do convite no log), `POST /api/accounts`, `/api/auth/set-password`, `/api/auth/login`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Leitura reduzida para a equipe | `GET /api/options/professionals` → `ProfessionalOptionDto { id, fullName, active }[]`; `GET /api/options/procedures` → `ProcedureOptionDto { id, name, priceCents, durationMinutes, active }[]`; família `operational` (todos os papéis de equipe), só GET | liberar `GET /api/professionals` por método para Atendente/Profissional - a família de rota é por caminho (proxy e handler), e o mesmo GET devolveria comissão; DTO por papel no mesmo endpoint deixaria o dado financeiro a um `if` de distância |
| Inativos na lista de opções | devolve ativos **e** inativos com `active`; os formulários filtram `active` | só ativos - a agenda e a lista de espera mostram o nome do profissional de consultas antigas (profissional desativado viraria "Profissional") |
| Taxonomia | `/api/taxonomy` sai de `ADMINISTRATIVE_PREFIXES` e entra em `CLINICAL_PREFIXES`; `/api/admin/taxonomy/import` continua `administrative` | família `operational` - o Atendente não usa SAE e `clinical` já é a família do prontuário (R3) |
| Aba Pacotes do Profissional | aba some quando `/api/auth/identity` diz `role === 'profissional'`; `?aba=pacotes` cai em `anamnese` | liberar `/api/packages?patientId=` filtrado por vínculo - pergunta aberta da #189 (dado financeiro) |
| Contas por papel no E2E | `global-setup` cria as contas por `POST /api/accounts` (Super Admin, `clinicId: legacy-clinic`), lê o link do convite do log do `NullEmailGateway` (servidor principal grava `e2e/.auth/main-server.log` via `tee`), define a senha em `/api/auth/set-password` e loga em `/api/auth/login`; um `storageState` por papel | assinar cookie à mão (como o portal) - pularia o login e não provaria que a sessão real carrega `clinicId`/`professionalId` |
| Vínculo R4 do Profissional no E2E | paciente semeado + consulta atribuída ao profissional semeado (seed de slot `papeis-vinculo-profissional`) | paciente criado pelo próprio Profissional - não prova o caminho da recepção, que é o efeito em cadeia da #188 |

- Nada mais aqui é difícil de reverter

## Unwritten requirements (varredura)

| Requisito | Onde caiu |
| --- | --- |
| Validação | rotas novas não recebem corpo; só GET - n/a |
| Falhas | lista auxiliar que falha vira `ErrorAlert` visível (C4); rota nova falha com o envelope padrão (`handleRequest`) - existente |
| Idempotência | só leitura - n/a; `global-setup` roda em instalação limpa (bootstrap já exige isso) - existente |
| Autorização | C1–C3, C6–C8 (proxy + handler, mesma política); escrita continua `administrative` (C3) |
| Escopo de empresa | `sessionScope(guard.session)` nas rotas novas (C5); taxonomia continua `systemScope()` (catálogo global, allowlist existente) |
| Concorrência | só leitura - n/a |
| Ciclo de vida | profissional/procedimento inativo aparece com `active: false` e não entra nos seletores (C2, C4) |
| Dependência externa | e-mail: `NullEmailGateway` no E2E (link no log) - existente |
| Transições | n/a |
| Observabilidade/auditoria | leitura de catálogo não é auditada hoje (`GET /api/professionals` não audita) - existente |

## Checks

Proofs Vitest: `npx vitest run <arquivo> -t "<nome>"`. Proofs E2E: `npx playwright test <arquivo> -g "<nome>"`.

### S1 - #188 Atendente agenda com profissional e catálogo

**C1** - Atendente e Profissional passam pelo proxy em `GET /api/options/professionals` e `GET /api/options/procedures` (não 403); Atendente leva 403 em `POST /api/professionals`, `PATCH /api/professionals/:id`, `POST /api/procedures`, `PATCH /api/procedures/:id` e em `GET /api/professionals`/`GET /api/procedures` (lista completa com comissão/kit)
Proof: `tests/proxy.test.ts` › "Dado atendente, Quando GET /api/options/professionals, Então passa pelo proxy"
Proof: `tests/proxy.test.ts` › "Dado atendente, Quando escreve no cadastro de profissionais e procedimentos, Então responde 403"

**C2** - `GET /api/options/professionals` como Atendente → 200 com itens exatamente `{ id, fullName, active }` (sem `commissionType`, `commissionPct`, `commissionFixedCents`, `registry`), ativos e inativos
Proof: `tests/api/options-routes.test.ts` › "C2 atendente lista profissionais sem dado financeiro"

**C3** - `GET /api/options/procedures` como Atendente → 200 com itens exatamente `{ id, name, priceCents, durationMinutes, active }` (sem `kitItemCount`); handlers de escrita como Atendente → 403 `Seu papel não tem acesso a este recurso`
Proof: `tests/api/options-routes.test.ts` › "C3 atendente lista procedimentos com preço e duração"
Proof: `tests/api/options-routes.test.ts` › "C3 escrita em profissionais e procedimentos continua só do admin"

**C4** - Formulário de agendamento e da lista de espera: lista auxiliar que falha mostra `ErrorAlert` com o motivo ("Não foi possível carregar os profissionais: …" / "… o catálogo de procedimentos: …") em vez de esconder o campo
Proof: `tests/pages/staff-agenda.test.tsx` › "Dado o catálogo indisponível, Então o formulário mostra o erro em vez de esconder o campo"
Proof: `tests/pages/staff-agenda.test.tsx` › "Dada a lista de profissionais indisponível, Então o formulário mostra o erro"
Proof: `tests/pages/agenda-waitlist-flow.test.tsx` › "Dado o catálogo indisponível, Então a lista de espera mostra o erro"

**C5** - Rotas novas leem só a empresa da sessão (profissional de outra empresa não aparece)
Proof: `tests/api/options-routes.test.ts` › "C5 lista só a empresa da sessão"

**C6** - E2E: Atendente abre a agenda, escolhe profissional e procedimento do catálogo, agenda; a consulta nasce com `professionalId` do profissional semeado e preço/duração do catálogo
Proof: `e2e/papeis-atendente.spec.ts` › "atendente agenda consulta atribuída a um profissional usando o catálogo"

### S2 - #189 Profissional usa o prontuário (SAE)

**C7** - `GET /api/taxonomy/diagnoses`, `/outcomes`, `/interventions`, `/diagnoses/:code/linked-terms` → família `clinical` (Profissional passa; Atendente 403); `/api/admin/taxonomy/import` → `administrative` (Profissional 403)
Proof: `tests/lib/route-family.test.ts` › "taxonomia é clínica e a importação continua administrativa"
Proof: `tests/proxy.test.ts` › "Dado profissional, Quando busca na taxonomia, Então passa pelo proxy"
Proof: `tests/proxy.test.ts` › "Dado profissional, Quando importa a taxonomia, Então responde 403"

**C8** - Profissional lista nomes de profissionais pelo DTO reduzido (proxy passa; handler 200 sem comissão); `GET /api/professionals` e `/api/packages` continuam 403 para ele
Proof: `tests/proxy.test.ts` › "Dado profissional, Quando GET /api/options/professionals, Então passa pelo proxy"
Proof: `tests/api/options-routes.test.ts` › "C8 profissional lista nomes de profissionais sem comissão"

**C9** - Ficha do paciente como Profissional não mostra a aba "Pacotes" (nem com `?aba=pacotes`) e não chama `/api/packages`; Admin continua vendo
Proof: `tests/pages/staff-paciente-detail.test.tsx` › "Dado profissional, Então a aba Pacotes não aparece"
Proof: `tests/pages/staff-paciente-detail.test.tsx` › "Dado profissional com ?aba=pacotes, Então abre a anamnese sem chamar /api/packages"

**C10** - Evoluções mostram o nome do autor pela lista reduzida (`/api/options/professionals`)
Proof: `tests/pages/staff-paciente-detail.test.tsx` › "Evolução mostra o autor pela lista reduzida de profissionais"

**C11** - Ficha de paciente inexistente/sem vínculo mostra "Paciente não encontrado." sem o UUID
Proof: `tests/pages/staff-paciente-detail.test.tsx` › "Dado 404 do paciente, Então a mensagem não expõe o id"

**C12** - E2E: Profissional vinculado percorre a SAE (diagnóstico NANDA-I pela busca → resultado NOC sugerido → intervenção NIC → execução → avaliação "Meta atingida") sem 4xx/5xx em `/api/*`
Proof: `e2e/papeis-profissional.spec.ts` › "profissional vinculado percorre o ciclo da SAE"

### S3 - #204 E2E por papel

**C13** - `global-setup` cria `company_admin`, `atendente` e `profissional` por `POST /api/accounts` + convite + login real; grava `e2e/.auth/{company_admin,atendente,profissional}-storage.json`; Profissional vinculado ao paciente semeado (consulta atribuída)
Proof: `e2e/papeis-smoke.spec.ts` › "sessão de company_admin vem do login real" / "sessão de atendente vem do login real" / "sessão de profissional vem do login real" (`/api/auth/identity` = e-mail e papel da conta criada)
Proof: `tests/e2e/invite-log.test.ts` (leitura do convite no log do `NullEmailGateway`)
Proof: `e2e/papeis-profissional.spec.ts` › "profissional vê o paciente semeado pelo vínculo"

**C14** - Smoke por papel: percorre cada item visível do menu; falha em 4xx/5xx inesperado de `/api/*` e em alerta de erro na página; telas fora do papel (pendência da #199) ficam anotadas, não silenciadas
Proof: `e2e/papeis-smoke.spec.ts` › "company_admin percorre o menu sem erro"
Proof: `e2e/papeis-smoke.spec.ts` › "atendente percorre o menu do papel sem erro"
Proof: `e2e/papeis-smoke.spec.ts` › "profissional percorre o menu do papel sem erro"

**C15** - Specs de agenda/prontuário rodam como Atendente (agenda + lista de espera) e Profissional (agenda própria + SAE + evolução)
Proof: `e2e/papeis-atendente.spec.ts` › "atendente adiciona à lista de espera com procedimento do catálogo"
Proof: `e2e/papeis-profissional.spec.ts` › "profissional vê a própria consulta na agenda"
Proof: `e2e/papeis-profissional.spec.ts` › "profissional registra evolução no paciente vinculado"

**C16** - Specs atuais (Super Admin) continuam verdes
Proof: `npm run test:e2e` (suíte completa)

**C17** - `docs/engineering/conventions.md` (níveis de teste): toda feature de tela precisa de cobertura para os papéis que a usam; `docs/domains/{agenda,acesso}/README.md` atualizados
Proof: `npm run check:docs`

## Handoff

Estimativa: S1 ~10 arquivos (rotas, DTO, 3 telas, 3 testes) · S2 ~7 arquivos (route-family, 2 telas, 3 testes) ·
S3 ~9 arquivos (config, global-setup, 4 suportes, 3 specs) + 3 docs. ~180k tokens no total.
