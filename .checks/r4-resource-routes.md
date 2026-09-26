# R4 nas rotas clínicas por id de recurso (#186)

Profile: `standard` · Source: [issue #186](https://github.com/KalleoPinheiro/vitta-flow/issues/186) (critérios 1–5), revisão pré-produção #183.

## Checks

Sessão de teste: Profissional da Clínica A com `professionalId` real; "sem vínculo" = nenhum
`professional_patient_links` para o paciente dono do recurso; "com vínculo" = `ensureLink` feito.

| # | Critério | Prova | Valor esperado |
| --- | --- | --- | --- |
| 1 | `GET`/`PATCH /api/conditions/:id` aplicam R4 | `tests/api/professional-resource-scope.test.ts` › "Cenário: conditions/[id]" | sem vínculo `404`, `notes` ausente; com vínculo `200` |
| 2 | `GET`/`POST /api/conditions/:id/assessments` | idem › "conditions/[id]/assessments" | `404` / `200` |
| 3 | `GET`/`POST /api/conditions/:id/photos` | idem › "conditions/[id]/photos" | `404` / `200` |
| 4 | `GET` (binário), `DELETE`, `PATCH` (triagem) `/api/photos/:id` | idem › "photos/[id]" | `404` / `200`; foto não apagada nem triada sem vínculo |
| 5 | `GET /api/photos/triage` só lista fotos de pacientes vinculados ao Profissional | idem › "photos/triage" | lista contém só a foto do paciente vinculado; admin vê as duas |
| 6 | `GET`/`PATCH /api/care-plans/:id` | idem › "care-plans/[id]" | `404` / `200` |
| 7 | `POST /api/care-plans/:id/{diagnoses,outcomes,interventions}` | idem › "care-plans/[id]/*" | `404` / `200` |
| 8 | `POST /api/care-plan-interventions/:id/records` (intervenção → plano → paciente) | idem › "care-plan-interventions/[id]/records" | `404` / `200` |
| 9 | `POST /api/care-plan-outcomes/:id/evaluations` (resultado → plano → paciente) | idem › "care-plan-outcomes/[id]/evaluations" | `404` / `200` |
| 10 | `GET /api/follow-ups` filtrado por vínculo para o Profissional | idem › "follow-ups" | só retorno do paciente vinculado |
| 11 | `GET /api/waitlist` filtrado por vínculo para o Profissional | idem › "waitlist" | só entrada do paciente vinculado |
| 12 | Conformidade: todo handler de rota da família `clinical` fora de `/api/patients/:id/*` chama a checagem R4 | `tests/api/clinical-resource-scope-conformance.test.ts` | falha listando o `METHOD arquivo` sem a chamada |
| 13 | Resolução recurso→paciente num helper único | `tests/lib/clinical-resource-scope.test.ts` | condição, foto, plano, intervenção, resultado → `patientId`; id inexistente → `null` |
| 14 | 404 não vaza o `patientId` do recurso | `tests/lib/clinical-resource-scope.test.ts` › "mensagem cita o recurso" | mensagem cita o id pedido, nunca o do paciente |
| 15 | Outros papéis não mudam (admin segue `200` sem vínculo, sem query extra) | `tests/lib/clinical-resource-scope.test.ts` › "não-profissional"; `tests/api/professional-resource-scope.test.ts` › admin | `200` |

Comandos: `npm run typecheck`, `npm run lint`, `npm run check:docs`, `npm run test:coverage` (≥ 90%), `npm run test:e2e`.

## Requisitos não escritos (varredura)

| Requisito | Onde caiu |
| --- | --- |
| Validação | Checagem R4 roda **antes** do parse do corpo nas rotas `:id` — Profissional sem vínculo recebe `404` mesmo com corpo inválido (não distingue recurso existente por `400`). Exceção: `POST conditions/:id/photos` valida o multipart antes (o `400` independe do recurso, nada vaza). |
| Falhas | Recurso inexistente para Profissional → `404` (mesma resposta de "sem vínculo"). Para outros papéis o comportamento anterior fica igual. |
| Idempotência | n/a — checagem é só leitura. |
| Autorização | Check 1–12; escopo de empresa segue nos repositórios (`sessionScope`/`writeScope`), a resolução usa os mesmos repositórios escopados. |
| Concorrência | n/a — vínculo nunca é revogado (ADR-003), não há janela de corrida relevante. |
| Ciclo de vida | Condição/plano resolvidos continuam sob R4 (a checagem não olha status). |
| Dependência externa | `DELETE`/`GET` de foto: a checagem roda antes de tocar o storage. |
| Transições | `PATCH` de triagem `escalated` cria follow-up só depois da checagem. |
| Observabilidade/auditoria | Acesso negado não gera `AuditEvent` (igual às rotas `/api/patients/:id/*`); leitura/escrita autorizada mantém a auditoria existente. |

## Out of scope

- `POST /api/follow-ups` e `POST /api/waitlist` com `patientId` alheio pelo Profissional — escrita operacional, não citada na issue; registrado como pergunta aberta.
- `GET /api/follow-ups?patientId=` e demais rotas operacionais (`appointments` já filtrado por #anterior).
- Reestruturar `route-family.ts` (allowlist de subrotas é da #185).

## Landing

| Decisão | Forma | Alternativa rejeitada |
| --- | --- | --- |
| Helper único | `src/lib/auth/clinical-resource-scope.ts`: `resolveClinicalResourcePatientId(kind, id, repos)` + `assertClinicalResourceAccessible(session, kind, id, repos)` + `linkedPatientFilter(session, links)` | repetir `findById` + `assertPatientAccessibleToProfessional` em cada rota — 13 cópias da mesma cadeia |
| Não-profissional não paga query | `assertClinicalResourceAccessible` retorna antes de resolver quando `role !== 'profissional'` | resolver sempre — muda o `404`/`400` de admin em recurso inexistente |
| 404 com o recurso, não com o paciente | Reemite `NotFoundError(<recurso>, <id pedido>)` | propagar `NotFoundError('Paciente', patientId)` — vazaria o `patientId` do recurso a quem não tem vínculo |
| Filtro de listagens em memória | `follow-ups`, `waitlist`, `photos/triage` filtram o resultado pelo conjunto de `findLinkedPatientIds` | novo parâmetro `patientIds` nos repositórios — contrato novo para três listagens limitadas por `MAX_ROWS` |
| Conformidade estrutural | teste lê cada `route.ts` da família `clinical` fora de `/api/patients/` e exige a chamada ao helper dentro de cada `export async function <METHOD>` | teste comportamental genérico — exigiria fabricar um recurso real por tipo de id (já coberto pelos testes de rota) |
