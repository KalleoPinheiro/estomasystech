# B6 — Auditoria de plataforma

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `on`, lote único (ver § Handoff).

Sources:

- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) - fonte única (não há `.tasks/` do B6). Settle: Decision "Auditoria sem empresa" (literal: `audit_events.clinic_id` nullable, `null` = evento de plataforma; ação do super_admin numa clínica grava a clínica-alvo e aparece também na trilha dela; trilha de plataforma = `clinic_id is null or actor_role = 'super_admin'`, só para o super_admin; `resolveActor` sem `LEGACY_CLINIC_ID`); Shape › Changes (`DrizzleAuditEventRepository` montado com `clinicId` no container, AD-017; `GET /api/platform/audit`); Shape › Adds (tela da trilha em `/plataforma`); Open 4 como decidido (sem migração retroativa dos eventos antigos da `legacy-clinic`)
- [#210](https://github.com/KalleoPinheiro/vitta-flow/issues/210) (corpo de 2026-09-27) - critérios do B6: eventos sem empresa não aparecem para Admin de nenhuma empresa; trilha de plataforma só para o super_admin, ações dele numa clínica também na trilha da clínica; repositório escopado por empresa; caso `POST /api/documents/issue` (`findAll({resourceType, resourceId})` sem empresa). `Refs #210`, não fecha
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) - issue mãe (`Refs #214`)
- Decisões provisórias herdadas, mantidas: B2 (`.checks/b2-…` § Out of scope: eventos de MFA "gravam como o login grava hoje") e B3 (`.checks/b3-…` Landing "Auditoria": `actorOverride.clinicId: null`, "hoje `legacy-clinic`, depois do B6 plataforma", **sem tocar no script** - aprovada pelo dono); B4/B5 (ações do super_admin gravam `clinicId` = clínica-alvo, com `clinicScope(id)`). Nenhuma é desfeita: B2/B3 passam a gravar `null` só pela mudança em `resolveActor`; B4/B5 continuam gravando a clínica-alvo
- Sem design de tela vinculante: layout, filtros e textos da tela decididos aqui (Landing)

## Out of scope

- Retenção da trilha (#210 item 2) - decisão jurídica em aberto
- Índice composto `(clinic_id, occurred_at DESC)` e paginação por cursor (#210 item 3) - fora por pedido do dono; a trilha de plataforma usa o mesmo `limit/offset` de `/api/audit`
- Migração retroativa dos eventos antigos atribuídos à `legacy-clinic` - Open 4 do design
- Filtro por clínica/ator na tela da plataforma - nada no design pede; com um operador e poucas clínicas, período basta

## Landing

Toca `src/domain/audit/*`, `src/lib/audit.ts`, `drizzle-audit-event-repository.ts`, `in-memory-audit-event-repository.ts`,
`schema.ts` + migração `0045`, `src/infrastructure/container.ts`, `src/app/api/audit`, `src/app/api/documents/issue`,
rota nova `src/app/api/platform/audit`, tela nova `src/app/plataforma/auditoria`, `src/lib/dto/audit.ts`, E2E, docs.
Reaproveita `withTenant` (AD-017), `usePagedQuery`, `LoadMoreButton`, `PagedList`, rótulos da tela `/auditoria`
(extraídos para um módulo comum, sem cópia), família `platform` (proxy + `requireStaffSession`).

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| `audit_events.clinic_id` nullable (**porta sem volta**: depois de gravar eventos `null`, voltar a `NOT NULL` exige decidir para onde vão eles) | migração `0045_audit-platform-events.sql`: `ALTER TABLE "audit_events" ALTER COLUMN "clinic_id" DROP NOT NULL`; FK para `clinics.id` mantida; nenhuma linha antiga alterada (Open 4) | tabela `platform_audit_events` separada - o design a rejeita (só venceria com retenção diferente); `clinic_id = 'platform'` sentinela - exigiria uma linha falsa em `clinics` e seria filtrada à mão em cada leitura |
| Domínio | `AuditEventProps.clinicId: string \| null`; `null` = plataforma; string vazia/brancos continua `ValidationError` `Empresa da auditoria é obrigatória` | aceitar `''` como plataforma - dois jeitos de dizer a mesma coisa |
| `resolveActor` | sem `LEGACY_CLINIC_ID`: empresa = `actorOverride.clinicId` ou `session.clinicId`, ambos podendo ser `null`; `input.clinicId` explícito continua aceito e tem precedência | remover `input.clinicId` - as rotas do B4/B5 (aprovadas) passam a clínica-alvo por ele; o repositório escopado recusa divergência, então o parâmetro não abre brecha |
| Repositório escopado (AD-017) | `new DrizzleAuditEventRepository(db, tenant.clinicId)` no container. `findAll` filtra por `withTenant` (escopo de clínica → só ela; escopo de sistema → sem filtro). `save`: escopo de clínica grava a clínica do escopo quando o evento não tem empresa (super_admin agindo na clínica-alvo, modo aberto) e **lança** `Evento de auditoria de outra empresa` se o evento traz outra; escopo de sistema grava a empresa do evento (inclusive `null`). `AuditEventFilter.clinicId` removido | manter `clinicId` no filtro - é o `{ clinicId }` à mão que a #210 item 4 aponta; escopo de clínica sobrescrever em silêncio a empresa divergente - esconderia bug de escopo |
| Leitura da trilha de plataforma | `AuditEventRepository.findPlatformTrail({ from?, to? }, page)` = `clinic_id is null or actor_role = 'super_admin'`, mesma ordem de `findAll`; só em escopo de sistema - em escopo de clínica lança `Trilha de plataforma exige escopo de sistema` | flag no `findAll` - um filtro esquecido viraria vazamento; método separado deixa a trilha de plataforma óbvia no review |
| Escopo da rota da plataforma | `GET /api/platform/audit` usa `sessionScope(guard.session)` (sessão do super_admin tem `clinicId` nulo); **sem** entrada nova na allowlist de `systemScope()` | `systemScope()` - leitura com sessão usa `sessionScope` (AGENTS.md regra 1) |
| Contrato `GET /api/platform/audit` | query `from?`, `to?` (ISO datetime), `limit` 1..500 (default 100), `offset` ≥ 0 - os mesmos limites de `/api/audit`; out `PlatformAuditEventDto[]` = `{ id, clinicId: string \| null, clinicName: string \| null, actorRole, actorId, action, resourceType, resourceId, detail, occurredAt }`; `clinicName` resolvido no servidor por `clinics.findAll()`; **sem** `patientId`/`patientName` (super_admin não vê dado de paciente, ADR-007) | reaproveitar `AuditEventDto` com paciente - vazaria id de paciente para a plataforma se um evento de plataforma trouxesse um |
| Login falho com e-mail que existe numa clínica | continua ator `anonymous` e vai para a **plataforma** (`clinic_id` nulo), inclusive `ambiguous_credentials`; só o login barrado por clínica suspensa (senha provada, B5) vai para a clínica da conta | atribuir à clínica dona do e-mail - exigiria ligar o e-mail digitado a uma clínica antes de provar a senha, e o admin veria a existência/ausência da conta (AC-02); o design diz "elimina o vazamento de logins entre empresas" |
| Demais eventos sem empresa | MFA (B2), recuperação por script (B3), importação da taxonomia, logout/set-password do super_admin → `null` pela mudança em `resolveActor`; o script do B3 só muda o construtor do repositório (novo parâmetro), não a chamada de auditoria | tocar a auditoria do script - o dono decidiu "sem tocar no script" |
| `POST /api/documents/issue` | repositório de `writeScope(guard.session)`; `findAll({resourceType, resourceId})` passa a ser da empresa; o mesmo `resourceId` em outra clínica emite registro próprio | manter `clinicScope(writeClinicId(...))` - equivalente, mas é o id montado à mão |
| Tela | `/plataforma/auditoria`, título `Trilha da plataforma`, link `Trilha da plataforma` no cabeçalho de `/plataforma` e `Clínicas` de volta; filtros `De`/`Até` (data); colunas `Quando`, `Clínica` (`Plataforma` quando `clinicId` nulo; senão o nome, ou o id se a clínica sumiu), `Ator`, `Ação`, `Recurso`, `Detalhe`; 100 por página com `Carregar mais`; vazio `Nenhum evento de plataforma registrado.`; rótulos de ação/recurso compartilhados com `/auditoria` em `src/lib/audit-labels.ts` (ganham `clinic` Clínica, `clinic-status` Situação da clínica, `account-recovery` Recuperação de conta) | copiar os rótulos - duas listas divergem |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"`; E2E: `npx playwright test <spec> -g "<nome>"`.

### S1 - Evento sem empresa no modelo · ~8k

**C1** - Migração 0045: `audit_events.clinic_id` aceita `null`; `clinic_id` de clínica inexistente continua recusado pela FK
Proof: `tests/infrastructure/audit-platform-migration.test.ts -t "clinic_id nulo"`

**C2** - `AuditEvent.create` aceita `clinicId: null` e expõe `null`; `clinicId: ' '` continua `ValidationError`
Proof: `tests/domain/audit-event.test.ts -t "evento de plataforma"`
Proof: `tests/domain/audit-event.test.ts -t "Empresa da auditoria"`

**C3** - `recordAuditNow` com sessão sem empresa, com `actorOverride.clinicId: null` e sem sessão grava evento com `clinicId` `null` (nunca `legacy-clinic`); `input.clinicId` explícito prevalece
Proof: `tests/lib/audit.test.ts -t "sem empresa"`

### S2 - Repositório escopado · ~10k

**C4** - Repositório Drizzle em escopo de clínica: `findAll()` sem filtro devolve só eventos dela (nem de outra clínica, nem de plataforma); escopo de sistema devolve todos
Proof: `tests/infrastructure/drizzle-audit-scope.test.ts -t "findAll escopado"`

**C5** - Repositório Drizzle em escopo de clínica: evento sem empresa é gravado com a clínica do escopo; evento de outra empresa → lança `Evento de auditoria de outra empresa` e nada é gravado
Proof: `tests/infrastructure/drizzle-audit-scope.test.ts -t "save escopado"`

**C6** - Repositório em memória segue as mesmas regras de C4/C5 e da trilha (C9)
Proof: `tests/infrastructure/in-memory-repositories.test.ts -t "auditoria escopada"`

**C7** - `getRepositories(clinicScope(A)).auditEvents` não enxerga eventos de B (container monta com `clinicId`)
Proof: `tests/api/audit-platform-trail.test.ts -t "container escopa a auditoria"`

**C8** - `POST /api/documents/issue`: mesmo `documentType`+`resourceId` na clínica A e na B → `documentNumber` diferentes; reemitir na A devolve o da A
Proof: `tests/api/documents-issue.test.ts -t "por empresa"`

**C9** - Repositório Drizzle: `findPlatformTrail` devolve eventos com `clinic_id` nulo ou `actor_role = 'super_admin'` (inclusive o do super_admin numa clínica) e exclui os demais; respeita `from`/`to`/`limit`/`offset`; em escopo de clínica lança `Trilha de plataforma exige escopo de sistema`
Proof: `tests/infrastructure/drizzle-audit-scope.test.ts -t "trilha de plataforma"`

### S3 - Eventos atribuídos e trilhas nas rotas · ~20k

**C10** - Login com senha errada para e-mail de conta da clínica X grava evento `clinic_id` nulo; `GET /api/audit` do admin de X e do admin da `legacy-clinic` não o mostram; `GET /api/platform/audit` mostra
Proof: `tests/api/audit-platform-trail.test.ts -t "login falho"`

**C11** - Eventos do super_admin sem clínica - código errado do segundo fator (B2), importação da taxonomia - gravam `clinic_id` nulo e aparecem só na trilha de plataforma
Proof: `tests/api/audit-platform-trail.test.ts -t "segundo fator"`
Proof: `tests/api/audit-platform-trail.test.ts -t "taxonomia"`

**C12** - Recuperação por script (B3) grava o evento com `clinic_id` nulo
Proof: `tests/infrastructure/recover-super-admin.test.ts -t "evento de plataforma"`

**C13** - Edição do cadastro pelo super_admin (`PATCH /api/platform/clinics/[id]`) aparece em `GET /api/audit` do admin daquela clínica e em `GET /api/platform/audit`; não aparece no `GET /api/audit` do admin de outra clínica
Proof: `tests/api/audit-platform-trail.test.ts -t "ação do super_admin numa clínica"`

**C14** - `GET /api/platform/audit` exclui eventos de papéis de clínica (ex.: `company_admin` criando paciente) e devolve `clinicId`/`clinicName` (`null`/`null` para plataforma), sem `patientId`/`patientName`, mais novo primeiro
Proof: `tests/api/audit-platform-trail.test.ts -t "formato da trilha"`

**C15** - `GET /api/platform/audit`: `from`/`to` filtram; `limit`/`offset` paginam; `limit=0` ou `limit=501` → `400`
Proof: `tests/api/audit-platform-trail.test.ts -t "filtros e paginação"`

**C16** - `GET /api/platform/audit` com `company_admin` → `403` `Seu papel não tem acesso a este recurso`; sem cookie → `401`
Proof: `tests/api/audit-platform-trail.test.ts -t "só o super_admin"`

### S4 - Tela da trilha · ~8k

**C17** - `/plataforma/auditoria` mostra título `Trilha da plataforma`, linha de plataforma com `Plataforma` na coluna Clínica e linha de clínica com o nome; rótulos de ação/recurso (`Criação`, `Dados da clínica`); vazio → `Nenhum evento de plataforma registrado.`; chama `/api/platform/audit?limit=100&offset=0`
Proof: `tests/pages/plataforma-auditoria.test.tsx -t "trilha da plataforma"`

**C18** - `/plataforma` tem link `Trilha da plataforma` para `/plataforma/auditoria`
Proof: `tests/pages/plataforma.test.tsx -t "link da trilha"`

**C19** - E2E: super_admin cria clínica pela API, abre a trilha pelo link e vê a linha `Criação`/`Clínica` com o nome da clínica
Proof: `e2e/plataforma.spec.ts -g "trilha da plataforma"`

### S5 - Documentação e gates · ~6k

**C20** - `docs/domains/acesso/README.md` descreve a trilha de plataforma (regra nova com `/api/platform/audit`, `clinic_id` nulo, login falho na plataforma, ação do super_admin nas duas trilhas) e ACE-RN-10 cita a trilha; ADR-010 aceito registra a decisão; `CONTEXT.md` define evento de plataforma
Proof: `tests/docs/super-admin-docs.test.ts -t "trilha de plataforma"`
Proof: `npm run check:docs`

**C21** - Nenhum arquivo novo usa `systemScope()` e `src/app` não referencia `LEGACY_CLINIC_ID`; `src/lib/audit.ts` também não
Proof: `tests/lib/tenant-scope.test.ts -t "allowlist justificada"`
Proof: `tests/lib/audit.test.ts -t "sem clínica legada"`

**C22** - Gates: typecheck, lint, check:sv, cobertura ≥ 90%; E2E nas duas configs
Proof: `npm run typecheck && npm run lint && npm run check:sv && npm run test:coverage`
Proof: `npx playwright test`
Proof: `npm run build && npx playwright test -c playwright.prod.config.ts`

## Swept

- validation: C15 (query); C2 (empresa em branco)
- failure modes: C5 (empresa divergente lança); C9 (trilha em escopo errado lança); falha de auditoria segue a régua de cada rota (inalterada)
- idempotency: C8 (reemissão de documento por empresa)
- authorization: C16 (família `platform`); C10/C13 (quem vê o quê); DTO sem paciente C14
- concurrency: n/a - append-only, nenhuma leitura-então-escrita nova
- data lifecycle: eventos antigos intactos (Open 4); retenção fora (#210 item 2)
- dependency failure: n/a - só o banco, já coberto pelas regras de cada rota
- state transitions: n/a
- observability: é a própria feature; C10–C14

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| origem de evento sem empresa (6) | login falho C10 · MFA C11 · taxonomia C11 · script B3 C12 · sessão sem empresa genérica C3 · modo aberto (sem sessão) C3 | - |
| escopo × operação do repositório (2×3) | clínica/`findAll` C4 · sistema/`findAll` C4 · clínica/`save` C5 · sistema/`save` C5 (grava `null`) · clínica/trilha C9 (lança) · sistema/trilha C9 | - |
| implementações do repositório (2) | Drizzle C4/C5/C9 · memória C6 | - |
| quem lê a trilha de plataforma (3) | super_admin C10 · `company_admin` C16 · sem sessão C16 | - |

- Claims naming a status code, route or response shape: C8, C10, C13, C14, C15, C16 - cada um com prova que chama o handler

## Handoff

Lote único: S1–S5 somam ~52k de leitura estimada, abaixo de 150k.

Registro do build (lote único, sem passagem de bastão):

- **Fronteira:** C1–C21 fechadas no próprio lote (`7dbba49..HEAD`); C22 pelos gates locais e pelo CI do PR.
- **Ajustado durante o build (testes que fixavam o comportamento antigo, previsto pela fonte):** `tests/infrastructure/recover-super-admin.test.ts` esperava `legacy-clinic` "até o B6" e passou a esperar `clinicId: null`; `tests/lib/audit.test.ts` idem para `actorOverride` sem empresa; `tests/api/auth-routes.test.ts` lê os eventos de login falho no escopo de sistema e confere `clinicId` nulo; `accounts-hierarchy` e `patient-export-access` deixaram de passar `clinicId` no filtro (removido do contrato). Nenhuma checagem baixou.
- **Descartado:** nada.
- **Ambiente local:** E2E com config temporário (não commitado) que só troca o `executablePath` do Chromium para `/opt/pw-browsers/chromium-1194`, e `NODE_USE_ENV_PROXY=1` (mesmo arranjo do B5).
