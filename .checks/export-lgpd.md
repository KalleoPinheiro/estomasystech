# Exportação LGPD restrita a quem pode ver o prontuário (#185)

Profile: `standard` · handoff: sessão orquestradora faz a verificação independente.

Sources:

- [Issue #185](https://github.com/KalleoPinheiro/estomasystech/issues/185): critérios de aceite 1–5 e a pergunta aberta sobre o Atendente
- [ADR-002](../docs/adr/002-autorizacao-em-duas-camadas.md): proxy + handler leem a mesma política
- [ADR-003](../docs/adr/003-modelo-de-papeis-multi-empresa.md): vínculo dinâmico do Profissional (R4)

## Out of scope

- Exportação **sem** dado clínico para o Atendente: é pergunta de produto (portabilidade pedida à recepção), fica em aberto. Padrão seguro aplicado: negar
- Vínculo R4 nas rotas por id de recurso (`/api/conditions/:id`, `/api/photos/:id` …): issue #186
- Liberar leitura de `/api/taxonomy`, `/api/professionals`, `/api/procedures`: issues #188/#189/#204
- Auditar tentativas negadas (403/404): nenhuma rota do sistema audita negação hoje; mudar isso vale para todas, não só para esta

## Landing

Toca `src/lib/auth/route-family.ts` (só a classificação de `/api/patients/:id/*`), o handler
`src/app/api/patients/[id]/export/route.ts` e o `PatientHeader` de `src/app/(staff)/pacientes/[id]/page.tsx`.
Reaproveita `assertPatientAccessibleToProfessional`, `requireStaffSession` (que já aplica a família de rota
no handler), `classifyRoute`/`isFamilyAllowedForRole` e `GET /api/auth/identity`.

| Decisão | Forma literal | Alternativa rejeitada |
| --- | --- | --- |
| Classificação de subrota de paciente | `/api/patients/<id>/<qualquer coisa>` é `clinical`, exceto se o primeiro segmento depois do id estiver em `NON_CLINICAL_PATIENT_SUBROUTES` (hoje vazia: as 5 subrotas existentes, `anamnesis`, `care-plans`, `conditions`, `evolutions`, `export`, são clínicas). `/api/patients` e `/api/patients/<id>` continuam `operational` | manter a lista de subrotas clínicas trocando `includes` por comparação exata: continua fail-open, e uma subrota nova nasce operacional e aberta ao Atendente |
| Família do export | `clinical` (mesma matriz: Admins e Profissional; Atendente negado) | `administrative`: tiraria o export do Profissional vinculado, que já lê cada parte do prontuário individualmente; mudar isso é decisão de produto |
| Ordem da checagem R4 no handler | `assertPatientAccessibleToProfessional` antes de `patients.findById` | depois do `findById`: mesmo status, mas faz uma leitura desnecessária do cadastro para quem não tem vínculo |
| Valor do C3 corrigido durante o build | a borda devolve `STAFF_ONLY_MESSAGE` para qualquer negação (`src/proxy.ts`, `forbidden`); o C3 prova status `403` e `data = null` | trocar a mensagem do proxy para a de família: muda contrato de todas as rotas, fora do escopo |
| Visibilidade do link na UI | link aparece quando `/api/auth/identity` respondeu e (`account === null`, modo aberto, que o servidor libera) ou `isFamilyAllowedForRole(classifyRoute('/api/patients/<id>/export'), role)`; carregando ou erro → escondido | chamar o export para descobrir se pode (gera auditoria de leitura só por abrir a ficha); lista de papéis fixa na tela (diverge da matriz de `route-family.ts`) |

## Checks

Proofs rodam com `npx vitest run <arquivo> -t "<nome>"`.

**C1** - `/api/patients/abc/export` é classificado `clinical`
Proof: `tests/lib/route-family.test.ts` › "Dado o pathname /api/patients/abc/export, Quando classificar, Então família clinical"

**C2** - Subrota nova e desconhecida de `/api/patients/:id/*` é `clinical` (fail-closed); `/api/patients` e `/api/patients/abc` seguem `operational`; nome de subrota clínica fora da posição de subrota não arrasta a rota (ex.: `/api/patients/conditions-report` é o próprio registro, `operational`)
Proof: `tests/lib/route-family.test.ts` › "Cenário: subrotas de paciente fail-closed (#185)"

**C3** - Atendente recebe `403` na borda em `GET /api/patients/abc/export`, com `data = null` (o proxy usa a mensagem genérica `"Acesso restrito à equipe da clínica"` para toda negação; a mensagem de família é só do handler, C4)
Proof: `tests/proxy.test.ts` › "Dada sessão de atendente no export LGPD, Então responde 403 na borda (#185)"

**C4** - Atendente recebe `403` no handler, `data = null`, e nenhum evento de auditoria `resourceType='export'` é gravado
Proof: `tests/api/patient-export-access.test.ts` › "Dado atendente, Quando GET export, Então 403 sem dados"
Proof (varredura): `tests/api/route-guard-conformance.test.ts` › atendente × família negada inclui `patients/[id]/export/route.ts`

**C5** - Profissional sem vínculo recebe `404` (não vaza existência), sem dados
Proof: `tests/api/patient-export-access.test.ts` › "Dado profissional sem vínculo, Quando GET export, Então 404"

**C6** - Profissional com vínculo recebe `200` com `data.patient.id` do paciente
Proof: `tests/api/patient-export-access.test.ts` › "Dado profissional com vínculo, Quando GET export, Então 200"

**C7** - Company Admin recebe `200` com `data.patient.id` e `data.conditions[0].notes`
Proof: `tests/api/patient-export-access.test.ts` › "Dado company_admin, Quando GET export, Então 200 com dado clínico"

**C8** - Link "Exportar dados (LGPD)" aparece para `company_admin`, `super_admin`, `profissional` e em modo aberto; some para `atendente` e quando a identidade falha ao carregar
Proof: `tests/pages/staff-paciente-detail.test.tsx` › "Cenário: link de exportação LGPD por papel (#185)"

**C9** - Export LGPD ponta a ponta continua funcionando para o Admin (sem regressão)
Proof: `npm run test:e2e` › `e2e/export-lgpd.spec.ts`

## Requisitos não escritos

| Requisito | Onde caiu |
| --- | --- |
| Validação | n/a: rota sem corpo; `:id` inválido já cai em `404` (existente, `audit-lgpd-routes.test.ts`) |
| Falhas | existente: falha de auditoria derruba a resposta (write-ahead, SEC1-20) |
| Idempotência | n/a: GET de leitura |
| Autorização | C1–C8 |
| Concorrência | n/a |
| Ciclo de vida | vínculo removido/transferido: coberto pelo próprio `hasLink` (R4, existente) |
| Dependência externa | n/a |
| Transições | n/a |
| Observabilidade/auditoria | existente: export bem-sucedido audita; negação não audita (Out of scope). C4 prova que a negação não grava evento de export |
