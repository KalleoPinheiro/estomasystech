# CONTEXT — VittaFlow Domain

**VittaFlow** is a clinical management system for dental therapy (estomaterapia) clinics. It manages patient records, clinical conditions, appointments, inventory, and team operations.

## Glossary

### Entities

**Clinic** (empresa, tenant)

- The tenant boundary: every account except Super Admin belongs to exactly one Clinic, and only sees that Clinic's data.
- Becoming a real entity now (Phase 1 of [ADR-001](./docs/adr/001-multi-tenancy.md): `clinics` table + `clinic_id` on existing tables). Isolation is enforced in the application layer (session carries `clinic_id`, repositories filter by it); Postgres Row-Level Security is deferred to a later phase.
- Created only by Super Admin (no self-service onboarding yet — that's Phase 3 of ADR-001).

**Patient** (paciente)

- Individual receiving treatment. Owns records of clinical conditions, appointments, assessments, and photos.
- Attributes: name, email, phone, birth date, referral source (partner), notes.
- Has an **Anamnesis** (medical history): comorbidities, allergies, medications, surgical history.

**Professional** (profissional)

- Staff member providing care (estomaterapeuta, nurse, therapist).
- May be assigned to appointments and evolution notes.
- Attributes: name, registry (license), commission %.
- A clinical record, distinct from its login account — may optionally have one with the Profissional role (see Access Control § Role).

**Partner** (parceiro)

- Referral source or affiliate (e.g., another clinic, physician).
- Tracked for patient referrals and business relationships.
- May optionally have a login account with the Partner role (see Access Control § Role).

**Appointment** (consulta, agendamento)

- Scheduled interaction between a patient and clinic.
- Attributes: start/end time, procedure (name), price, status, notes, assigned professional.
- May have an associated evolution note and Google Calendar event.
- Statuses: pending, confirmed, completed, cancelled, no-show.
- Anti-double-booking enforced by `endsAtBuffered` trigger.

**Procedure** (procedimento)

- Catalog entry for services offered: name, price, duration.
- Case-insensitive unique name within the catalog.
- Used for template pricing and duration; individual appointments may deviate (backward-compatible).

**Clinical Condition** (condição clínica)

- Wound, ostomy, or other condition being managed over time.
- Attributes: kind (wound type), title, stoma type, start date, status.
- Status: open, closed, archived.
- Linked to a patient for longitudinal tracking.
- Has many **Condition Assessments** (clinical measurements) and **Condition Photos** (imaging).

**Condition Assessment** (avaliação)

- Point-in-time clinical snapshot of a condition.
- Measurements: length/width/depth (mm), tissue type, exudate, pain scale.
- DET scale (for ostomies): discoloration, erosion, overgrowth areas and severities.
- Complications: free-text or canonical codes.

**Condition Photo** (foto)

- Image of a condition, with metadata.
- Origin: `staff` (taken by therapist) or `patient` (remote monitoring).
- Triage status: for remote monitoring workflows.
- May be linked to an assessment or standalone.

**Evolution Note** (nota de evolução)

- Structured narrative per appointment or date, using SOAP format:
  - **S**ubjective: patient report.
  - **O**bjective: clinical findings, assessments.
  - **A**ssessment: interpretation.
  - **P**lan: next steps.
- Author: assigned professional (nullable for backward compatibility).

**Supply** (material, suprimento)

- Inventory item: name, unit, minimum quantity, price.
- Has **Supply Batches** tracking expiration and quantity consumed.

**Stock Movement** (movimento de estoque)

- Ledger entry for supply usage, restocking, or adjustment.
- Type: consumption, in, out, adjustment.
- Reason: free text (e.g., `appointment #123`, `expired`, `damaged`).
- Unit price frozen at movement time (immune to catalog price changes).

**Follow-up** (retorno)

- Scheduled recall or check-in due date.
- Reason: clinical (e.g., dressing change, wound inspection).
- Status: pending, completed, cancelled.

**Reminder** (lembrete)

- Notification sent to patient (e.g., appointment confirmation, follow-up due).
- Idempotent daily: one per (kind, referenceId, date).

**Consent Record** (consentimento)

- Patient's signed agreement to data use (photos, clinical records).
- Timestamp and IP address recorded.

**Audit Event** (evento de auditoria)

- System activity log: create, read, update, delete of sensitive entities.
- Captures actor, action, entity type, and timestamp.
- Required for compliance and forensics.

### Access Control

**Session** (sessão)

- User authenticated with their own password (scrypt hash), set via an emailed invite or self-service reset. Google OAuth is not an authentication method — it is unrelated to login.
- Session claims: user email, role, clinic (Super Admin has no clinic — it is cross-clinic by definition), assigned professional (if Profissional).

**Role** (papel)

Fixed catalog of six; a Clinic's Admin de Empresa cannot invent new roles or permissions.

- **Super Admin** (sistema): the one system-wide operator. Full access to every Clinic, including clinical data; every cross-clinic access is audited. Creates Admin de Empresa (and, if needed, any other role) in any Clinic. No one creates a Super Admin except itself.
- **Admin de Empresa** (equipe, admin da clínica): full access within its own Clinic only — operational data, clinical data, clinic settings, account management. A Clinic may have more than one. Creates Profissional, Atendente, Patient, Partner, and other Admin de Empresa accounts, all within its own Clinic.
- **Atendente** (equipe, recepção): operational access only — scheduling and patient/partner registration. No access to clinical data (evolution notes, condition assessments, photos). Creates Patient and Partner accounts.
- **Profissional** (equipe): clinical access, but scoped dynamically — sees only patients it has at least one appointment or evolution note with. Not a fixed "ownership": a patient can accumulate access for several professionals over time (coverage, transfer, return). Creates Patient and Partner accounts.
- **Patient** (paciente): own portal, can read own records and submit photos. Never self-registers — always created by staff.
- **Partner** (parceiro): own portal, referral tracking. Never self-registers, and creates no one.

**Account provisioning** (cadastro de contas)

- No self-registration for any role: every account is created by someone else in the hierarchy above (see Role).
- First Clinic and its first Admin de Empresa are created manually by Super Admin — no self-service onboarding yet.

**Authorization** (autorização)

- Two-layer defense ([ADR-002](./docs/adr/002-autorizacao-em-duas-camadas.md)):
  1. **Proxy layer** (`src/proxy.ts`): edge-level checks, rate limiting, early rejects.
  2. **Handler layer** (`src/lib/auth/require-session.ts`): per-route authorization, fail-closed.
- Policy source: `src/lib/auth/access-policy.ts`.
- Scoped by Clinic (`clinic_id`) for every role except Super Admin, and additionally by professional assignment for Profissional.
- **Tenant scope** (`src/lib/auth/tenant-scope.ts`): `getRepositories` only accepts a branded `TenantScope` built by `sessionScope` (reads — exact session clinic, `null` for Super Admin), `writeScope`/`writeClinicId` (writes — falls back to the legacy clinic when the session has none), `clinicScope` (explicit clinic) or `systemScope` (cross-clinic, allowlisted in `tests/lib/tenant-scope.test.ts`). A raw `{ clinicId: … }` literal does not compile.
- Audit: all changes record the authenticated actor (no anonymous actions); Super Admin access to another Clinic's data is always audited.

### Business Rules

**Appointment conflicts**

- No two appointments may overlap for a patient.
- Enforced by `endsAtBuffered` and trigger-level exclusion constraint.
- Minimum gap between appointments: defined in `schedule_settings`.

**Schedule settings** (configuração de horário)

- Weekday/hour ranges when clinic accepts appointments.
- Single row (id = `"default"`).
- Business hours respected for appointment creation and reminders.

**Pricing**

- Appointment price set at creation (may differ from current procedure price).
- Stock movement price frozen at time of ledger entry.
- Supplies have cost; procedures have revenue.

**Commission** (repasse ao profissional — rule in `src/domain/billing/commission.ts`)

- **Accrued on production, released on payment:** commission is computed on sessions (completed appointments) of the month, but only enters the payout once the invoice covering it is paid.
- **Cancelled invoice** → no revenue and no commission for that session.
- **Default is the clinic's risk:** an invoice still pending 60 days after its due date (or issue date, when there is none) releases the commission anyway.
- **Package session** is worth package price ÷ sessions (never the full procedure price — that double-counted revenue); release follows the package-sale invoice (`invoices.session_package_id`). Package invoices sold before that link existed release immediately.
- **Courtesy package** (price zero): zero revenue, but commission on the session's normal price, already released — courtesy is the clinic's marketing cost.
- Monthly report shows per professional: accrued (`commissionCents`), released and pending. A payout ledger (marking a payout as done) does not exist yet.

**Taxonomy** (`import-taxonomy` script)

- Canonical lists of condition kinds, stoma types, tissue types, complications.
- Imported once at setup; used for dropdowns and data validation.
- Future: per-clinic customization in Phase 3 (currently global).

**Multi-tenancy roadmap** (see [ADR-001](./docs/adr/001-multi-tenancy.md))

- **Phase 0**: conventions set; no code changes yet.
- **Phase 1 (in progress)**: `clinics` table; `clinic_id` column + default to legacy tenant; backfill.
- **Phase 2 (partial, in progress)**: session claims include `clinic_id`; repositories filter by it in the application layer. Postgres RLS via `SET LOCAL` is deferred to a dedicated later effort, per ADR-001's own recommendation.
- **Phase 3**: self-service onboarding, billing, custom domains.
- **Phase 4**: anonymized benchmarking across clinics.

One account belongs to exactly one Clinic (email is unique per Clinic, not globally) — a person working across two Clinics needs two separate accounts for now.

### Critical constraints

**Auth fail-closed**

- Without `AUTH_SECRET` configured, all routes return 503.
- `VITTA_ALLOW_OPEN_MODE=true` bypasses in dev; has no effect in production.
- There is no master/break-glass password: every account, including Super Admin, is a real record with its own credential.

**Photo storage**

- Currently at root; planned to migrate to `uploads/<clinic_id>/condition-photos/…` in Phase 1.

**No global state per clinic** (in preparation for Phase 2)

- Config goes in tables, not env vars.
- Cache keys must include tenant (prepared but not enforced yet).

**Calendar sync**

- Google Calendar integration requires OAuth tokens (encrypted in `google_accounts`), connected separately after login — unrelated to authentication.
- Bidirectional: appointments ↔ Google events.

**Consent enforcement**

- Patient photos and records require active consent record.
- Consent text versioned by hash.

---

## Architecture layers

See `src/` structure:

- **`app/`** — Next.js pages and API routes (App Router).
- **`application/`** — use-case orchestration (dependencies resolved per-request).
- **`domain/`** — value objects, entities, business rules.
- **`infrastructure/`** — database (Drizzle + Postgres), external APIs (Google Calendar), file storage.
- **`lib/`** — utilities: audit, DTO, date formatting, API responses, auth.
- **`components/`** — React components (using `@still-void/ui` design system).
- **`proxy.ts`** — edge-layer authorization and rate limiting.

---

## Related decisions

- [ADR-001: Multi-tenancy strategy](./docs/adr/001-multi-tenancy.md) — `clinic_id` + RLS, incremental phases.
- [ADR-002: Two-layer authorization](./docs/adr/002-autorizacao-em-duas-camadas.md) — proxy + handler guards, fail-closed.
- [ADR-003: Modelo de papéis multi-empresa](./docs/adr/003-modelo-de-papeis-multi-empresa.md) — catálogo fechado de seis papéis, escopo por empresa e vínculo dinâmico do Profissional.
- [ADR-004: Remoção do Google OAuth como autenticação](./docs/adr/004-remocao-google-oauth-autenticacao.md) — login 100% nativo, Calendar sync desacoplado.
