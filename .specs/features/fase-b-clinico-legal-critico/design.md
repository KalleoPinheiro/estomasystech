# Fase B — Clínico/legal crítico Design

**Spec**: `.specs/features/fase-b-clinico-legal-critico/spec.md`
**Status**: Approved

---

## Architecture Overview

Nenhuma peça nova de arquitetura — as 7 correções (CLIN-01..07) são extensões pontuais de padrões já estabelecidos no repositório (repositório Drizzle + `withTenant`, seção de Configurações no estilo `ScheduleSection`, contrato de 3 estados do `useApiQuery`, `ConfirmAction`/`AlertDialog`). CLIN-08 é validação, sem código de produto novo.

```mermaid
graph TD
    subgraph "CLIN-01/02: dados da clínica"
        A[ClinicInfoSection em Configurações] -->|PUT| B[/api/settings/clinic-info]
        B --> C[DrizzleClinicInfoRepository]
        C --> D[(clinics: +cnpj,address,city,\nprofessionalName,professionalRegistry)]
        E[/api/clinic-info GET] --> C
        F[Páginas de documento] -->|useApiQuery| E
        F -->|dados incompletos?| G[Bloqueio fail-closed]
    end
    subgraph "CLIN-03: atestado"
        H[Atestado page] -->|status != completed?| I[Bloqueio]
    end
    subgraph "CLIN-04: autoria"
        J[EvolutionsSection sem seletor] -->|POST sem professionalId| K[resolveProfessionalId\nsempre via sessão]
    end
    subgraph "CLIN-05: erro anamnese"
        L[PatientRecordPage] -->|error+isLoading| M[AnamnesisSection]
    end
    subgraph "CLIN-06: dirty guard"
        N[TabButton onClick] -->|dirty?| O[ConfirmAction]
    end
    subgraph "CLIN-07: complicações"
        P[conditions-section table] --> Q[render complicationCodes labels]
    end
```

---

## Approach Exploration (dados da clínica — CLIN-01)

1. **Nova tabela `clinic_settings` (1:1 com `clinics`)** — espelha `schedule_settings`. Mais "puro" (separa identidade de configuração), mas exige join extra em toda leitura de documento e é redundante: `clinics` já é 1 linha por empresa.
2. **Estender a tabela `clinics` existente com colunas nullable** (recomendado) — `clinics.id` já É o `clinic_id`; não há necessidade de outra chave estrangeira 1:1. Menos uma tabela, menos um join, mesmo padrão de acesso (`db.select().from(clinics).where(eq(clinics.id, clinicId))`).
3. **Manter em env var, só adicionar UI que escreve num `.env` gerido** — descartada: env var não é multi-tenant (uma instalação, uma clínica) e é exatamente o problema que o #61 pede pra resolver.

**Escolha**: opção 2, já capturada em `context.md` (Agent's Discretion). Confirmado com o usuário nas perguntas de discuss.

**Correção pós-scan (achado durante a leitura do código, ainda na fase de Design):** já existe `src/domain/clinic/clinic.ts` (entidade `Clinic`), `src/domain/clinic/clinic-repository.ts` (`ClinicRepository` com `create`/`findById`) e `src/infrastructure/persistence/drizzle/drizzle-clinic-repository.ts` (`DrizzleClinicRepository`), já ligados em `getRepositories().clinics`, hoje usados só pelo bootstrap do primeiro Super Admin (criação de clínica). **Reuso obrigatório**: os componentes abaixo foram corrigidos para estender essas peças (novos campos em `Clinic` + `update()` em `ClinicRepository`/`DrizzleClinicRepository`) em vez de criar um módulo `clinic-info` paralelo — evita dois modelos para a mesma linha da tabela `clinics`.

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --- | --- | --- |
| `ScheduleSection` (padrão de seção editável em Configurações) | `src/app/(staff)/configuracoes/page.tsx` | Espelhar estrutura (useApiQuery + draft local + PUT) para `ClinicInfoSection` |
| `Clinic` + `ClinicRepository` + `DrizzleClinicRepository` (já existem) | `src/domain/clinic/*`, `src/infrastructure/persistence/drizzle/drizzle-clinic-repository.ts` | Estender com campos cadastrais + `update()`, em vez de criar módulo paralelo |
| `useApiQuery` (contrato de 3 estados `data/error/isLoading`) | `src/lib/use-api-query.ts` | Reusar sem alteração — só passar `error`/`isLoading` adiante em `anamnesis-section` |
| `ConfirmAction` / `AlertDialog` do Still Void | `src/components/confirm-action.tsx` | Reusar para o diálogo de descarte (CLIN-06) — só troca o gatilho de "click direto" pra "click condicional" |
| `ErrorAlert`, `LoadingIndicator`, `EmptyState` | `src/components/feedback.tsx` | Reusar para o novo estado de bloqueio de documento e erro de anamnese |
| `COMPLICATION_OPTIONS` (labels canônicas) | `src/app/(staff)/pacientes/[id]/conditions-section.tsx:383` | Reusar o mesmo array pra render (já existe, só não é lido na tabela) |
| `resolveProfessionalId` | `src/app/api/patients/[id]/evolutions/route.ts` | Simplificar — remove o branch que aceita `bodyProfessionalId` de sessões não-`profissional` |
| `requireStaffSession` + checagem de `role` inline | `src/lib/auth/require-session.ts` | Reusar; checagem `company_admin`/`super_admin` inline no handler, igual padrão já usado em outras rotas administrativas |

### Integration Points

| System | Integration Method |
| --- | --- |
| Postgres (`clinics`) | Migration `drizzle/0026_clinic-info-fields.sql` — `ALTER TABLE clinics ADD COLUMN ...` (5 colunas nullable) |
| `getRepositories()` (container) | `clinics: ClinicRepository` já existe — ganha o método `update` na mesma interface |
| `/api/clinic-info` (já existe) | GET passa a ler `clinics.findById(clinicId)` em vez de `getClinicInfo()` via env; `getClinicInfo()`/`src/lib/clinic-info.ts` é removido (dead code após a troca) |

---

## Components

### `Clinic` (domínio, modificado)

- **Purpose**: Ganha os campos cadastrais opcionais e um método imutável de atualização.
- **Location**: `src/domain/clinic/clinic.ts`
- **Interfaces** (adições):
  - `ClinicProps`/`ClinicState` ganham `cnpj?: string | null; address?: string | null; city?: string | null; professionalName?: string | null; professionalRegistry?: string | null` (default `null` em `create`).
  - Getters: `cnpj`, `address`, `city`, `professionalName`, `professionalRegistry`.
  - `updateInfo(fields: ClinicInfoFields): Clinic` — retorna nova instância (imutabilidade) com os campos sobrescritos; sem validação de formato (texto livre), só trim.
  - `isCompleteForDocumentEmission(): boolean` — `true` quando `cnpj`, `professionalName` e `professionalRegistry` estão preenchidos (não vazios após trim).
- **Dependencies**: nenhuma nova.
- **Reuses**: mantém o esqueleto atual da classe (constructor privado + `restore`/`create`).

### `ClinicRepository` / `DrizzleClinicRepository` (modificados)

- **Purpose**: Ganham `update`.
- **Location**: `src/domain/clinic/clinic-repository.ts`, `src/infrastructure/persistence/drizzle/drizzle-clinic-repository.ts`
- **Interfaces**: `update(clinic: Clinic): Promise<void>` — `UPDATE clinics SET cnpj=…, address=…, city=…, professional_name=…, professional_registry=… WHERE id = clinic.id`. `findById`/`toClinic` passam a mapear as 5 colunas novas.
- **Dependencies**: `AppDb`, `drizzle-orm/eq`.
- **Reuses**: mesmo arquivo/classe existente — só adiciona método e estende o mapeamento.

### `ClinicInfoDto` / `toClinicInfoDto` (modificado — movido para `dto.ts`)

- **Purpose**: DTO de saída para as rotas de clínica; hoje a interface `ClinicInfoDto` vive solta em `src/components/document-frame.tsx` — passa a viver em `src/lib/dto.ts` (convenção do projeto) com `toClinicInfoDto(clinic: Clinic): ClinicInfoDto`, e `document-frame.tsx` importa o tipo de lá.
- **Location**: `src/lib/dto.ts`, `src/components/document-frame.tsx` (só o import muda)
- **Reuses**: mesmo padrão de `toEvolutionNoteDto` já presente em `dto.ts`.

### `/api/settings/clinic-info` (novo route)

- **Purpose**: GET (dados atuais) + PUT (salvar), restrito a `company_admin`/`super_admin`.
- **Location**: `src/app/api/settings/clinic-info/route.ts`
- **Interfaces**: `GET` → `{ info: ClinicInfoDto }`; `PUT` (body: campos editáveis, texto opcional) → `{ info: ClinicInfoDto }`, usando `clinic.updateInfo(body)` + `clinics.update(...)`.
- **Dependencies**: `requireStaffSession`, `getRepositories`, zod schema.
- **Reuses**: espelha `src/app/api/settings/schedule/route.ts` na estrutura; `toClinicInfoDto`.

### `/api/clinic-info` (existente, modificado)

- **Purpose**: GET consumido pelas páginas de documento — passa a ler do repositório (por `clinicId` da sessão) em vez de env var.
- **Location**: `src/app/api/clinic-info/route.ts`
- **Mudança**: troca `getClinicInfo()` (env) por `getRepositories({clinicId}).clinics.findById(clinicId)` + `toClinicInfoDto`, com fallback pro nome default (`"EstomaSysTech — Clínica de Estomaterapia"`) quando `findById` retorna `null` (defensivo — nunca deveria faltar, já que a conta staff sempre tem `clinicId` de uma clínica existente).

### `ClinicInfoSection` (novo, em Configurações)

- **Purpose**: Formulário de edição dos dados da clínica, visível só pra `company_admin`/`super_admin`.
- **Location**: `src/app/(staff)/configuracoes/page.tsx` (nova função, ao lado de `ScheduleSection`)
- **Reuses**: mesma estrutura de `ScheduleSection` (draft local + `useApiQuery` + `apiFetch` PUT + `useToast`).

### Bloqueio fail-closed nas páginas de documento (modificado)

- **Purpose**: Não renderizar Atestado/Relatório/Plano de Cuidados quando `!isCompleteForDocumentEmission(clinic)`.
- **Location**: `src/app/documentos/atestado/[appointmentId]/page.tsx`, `src/app/documentos/relatorio/[conditionId]/page.tsx`, `src/app/documentos/plano-cuidados/[carePlanId]/page.tsx`
- **Reuses**: `ErrorAlert` para a mensagem de bloqueio; `isCompleteForDocumentEmission` do domínio novo.
- **Nota**: `src/app/documentos/consentimento/[patientId]/page.tsx` **não** muda (fora de escopo, CLIN-02 AC3).

### Bloqueio de status no Atestado (modificado)

- **Purpose**: Não renderizar a declaração quando `appointment.status !== "completed"`.
- **Location**: `src/app/documentos/atestado/[appointmentId]/page.tsx`
- **Reuses**: `ErrorAlert`.

### `EvolutionsSection` (modificado)

- **Purpose**: Remove o `NativeSelect` de profissional; não envia `professionalId` no POST.
- **Location**: `src/app/(staff)/pacientes/[id]/evolutions-section.tsx`
- **Reuses**: mantém todo o resto igual (o backend resolve autoria).

### `resolveProfessionalId` (modificado)

- **Purpose**: Ignorar `bodyProfessionalId` para **todo** papel, não só `profissional`.
- **Location**: `src/app/api/patients/[id]/evolutions/route.ts`
- **Mudança**: remove o branch `if (bodyProfessionalId) return bodyProfessionalId;` — o fluxo cai direto pra resolução via `session.subject` → conta → `professionalId`, igual já acontecia quando nada era selecionado.

### `AnamnesisSection` (modificado) + `PatientRecordPage` (modificado)

- **Purpose**: Distinguir erro de "sem histórico".
- **Location**: `src/app/(staff)/pacientes/[id]/anamnesis-section.tsx`, `src/app/(staff)/pacientes/[id]/page.tsx`
- **Mudança**: `page.tsx` passa a extrair `error`/`isLoading` da query de anamnese e repassar como props; `AnamnesisSection` ganha `error`/`isLoading` e usa `ErrorAlert`/`LoadingIndicator` no mesmo padrão de `ConditionsSection`/`EvolutionsSection`.

### Guarda de troca de aba (novo, em `PatientRecordPage`)

- **Purpose**: Interceptar `setTab` quando há formulário sujo em Evolução ou Anamnese.
- **Location**: `src/app/(staff)/pacientes/[id]/page.tsx` (orquestra) + `evolutions-section.tsx`/`anamnesis-section.tsx` (reportam dirty via callback `onDirtyChange(isDirty: boolean)`)
- **Interfaces**: `PatientRecordPage` mantém `dirtyTab: TabKey | null`; `TabButton.onClick` chama um handler que, se `dirtyTab` não for `null` e o alvo for diferente da aba atual, abre `ConfirmAction` controlado (ver Tech Decisions) em vez de trocar direto.
- **Reuses**: `ConfirmAction`/`AlertDialog`.

### `conditions-section` — exibição de complicações (modificado)

- **Purpose**: Renderizar `a.complicationCodes` (labels) na tabela de avaliações.
- **Location**: `src/app/(staff)/pacientes/[id]/conditions-section.tsx` (linha ~214, dentro do `TableRow` de avaliações)
- **Mudança**: nova célula (ou concatenação na mesma célula) mapeando `a.complicationCodes` → `COMPLICATION_OPTIONS` labels, junção por vírgula.

---

## Data Models

```typescript
// src/domain/clinic/clinic.ts (adições)
export interface ClinicInfoFields {
  cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  professionalName?: string | null;
  professionalRegistry?: string | null;
}

// Clinic ganha updateInfo(fields: ClinicInfoFields): Clinic
// e isCompleteForDocumentEmission(): boolean

// src/lib/dto.ts (adição)
export interface ClinicInfoDto {
  name: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
}
```

**Migration** (`drizzle/0026_clinic-info-fields.sql`):

```sql
ALTER TABLE clinics
  ADD COLUMN cnpj text,
  ADD COLUMN address text,
  ADD COLUMN city text,
  ADD COLUMN professional_name text,
  ADD COLUMN professional_registry text;
```

**Relationships**: 1:1 com `clinics.id` (já é a PK/tenant key) — sem tabela nova.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| --- | --- | --- |
| Documento acessado sem CNPJ/responsável técnico cadastrado | `isCompleteForDocumentEmission` retorna `false`, página renderiza `ErrorAlert` com link pra Configurações | Mensagem clara, sem gerar PDF incompleto |
| Atestado de consulta não `completed` | Early return com `ErrorAlert` explicando o status atual | Sem emissão indevida |
| POST de evolução com `professionalId` forjado no corpo | Ignorado — servidor sempre resolve por sessão | Autoria correta mesmo sob requisição adulterada |
| Falha 5xx ao buscar anamnese | `error` não-nulo repassado a `AnamnesisSection`, que renderiza `ErrorAlert` com `onRetry` | Profissional não confunde com "sem histórico" |
| `PUT /api/settings/clinic-info` por papel não autorizado | 403 (`STAFF_ONLY_MESSAGE` ou mensagem específica) | Formulário não aparece pra quem não pode editar (UI também esconde a seção) |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| --- | --- | --- | --- |
| `professionalId` do body sendo aceito sem checagem pra papéis não-`profissional` | `src/app/api/patients/[id]/evolutions/route.ts:44-47` | Forjamento de autoria em nota clínica (achado #64 em si) | CLIN-04 remove esse branch — tarefa própria com teste de discriminação (autoria sempre da sessão) |
| `AnamnesisSection` recebe só `data`, nunca `error`, da query de anamnese | `src/app/(staff)/pacientes/[id]/page.tsx` (query de anamnese) | Erro de rede vira "sem histórico" silenciosamente — já é o próprio achado #65 | CLIN-05 corrige propagando `error`/`isLoading` |
| `complicationCodes` gravado mas nunca lido na UI | `src/app/(staff)/pacientes/[id]/conditions-section.tsx:214` | Dado clínico gravado, efetivamente invisível — já é o próprio achado #67 | CLIN-07 corrige |
| `src/lib/clinic-info.ts` fica dead code após a migração pra repositório | `src/lib/clinic-info.ts` | Nenhum — arquivo removido na mesma task que troca `/api/clinic-info` | Task de CLIN-01/02 remove o arquivo e seus imports |

> Nenhum outro risco de segurança/perf identificado nas áreas tocadas — o restante são bugs de UI já cobertos pelas próprias user stories.

---

## Tech Decisions (only non-obvious ones)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Diálogo de confirmação de descarte (CLIN-06) | `AlertDialog` controlado (`open`/`onOpenChange` do Radix, exportado por `@still-void/ui/react/client`) em vez de reaproveitar `ConfirmAction` (que só abre via clique no próprio trigger) | O gatilho aqui é condicional (só abre se dirty), não "todo clique abre" — `ConfirmAction` não suporta abertura programática; usar o primitivo `AlertDialog` direto evita criar um segundo wrapper (AD-014: não inventar padrão de UI novo, só o necessário) |
| Quem pode editar dados da clínica | Checagem inline `session.role === "company_admin" \|\| session.role === "super_admin"` no handler, sem novo helper genérico | Só 1 rota nova precisa disso; criar abstração pra um único uso violaria YAGNI |
| `cnpj`/demais campos sem validação de formato (regex CNPJ) | Aceita qualquer texto não vazio | Fora do escopo pedido pelo AC (que pede presença, não formato); validação de dígito verificador de CNPJ é feature própria, não pedida |

> **Nota**: nenhuma decisão aqui estabelece convenção de projeto nova além do já coberto por AD-017 (uso de `withTenant`) — não requer nova entrada em `STATE.md`.

---

## Tips consumidos

- Reuso confirmado em cada componente listado acima — nenhuma peça de arquitetura nova além de `clinic-info` (domínio pequeno, espelha `schedule-config`).
