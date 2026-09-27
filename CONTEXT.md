# CONTEXT — VittaFlow Domain

**VittaFlow** is a clinical management system for enterostomal therapy / wound, ostomy and continence nursing (estomaterapia) clinics. It manages patient records, clinical conditions, appointments, inventory, and team operations.

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
- **Cancellation record**: a cancelled appointment keeps who cancelled (`clinic` or `patient`), when, and an optional reason (≤ 1000 chars). Cancellations before this record existed have none.

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

- Notification sent to patient (e.g., appointment confirmation, follow-up due), by one channel.
- Channel: `email` (automatic job) or `whatsapp_link` (staff click on the `wa.me` button).
- Attempt: recall email attempt number (1–3, at D+1/D+7/D+30); always 1 otherwise.
- Idempotent: confirmation and `whatsapp_link` one per (kind, referenceId, channel, local date);
  recall email one per attempt.

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
- Super Admin only: the password yields a **pending login** (5-minute signed token, never a session); the session is issued after the **second factor** — a TOTP code from an authenticator app, enrolled on first login.

**Second factor** (segundo fator)

- TOTP (RFC 6238) from any authenticator app; mandatory for Super Admin, not offered to other roles ([ADR-008](./docs/adr/008-segundo-fator-do-super-admin.md)).
- **Recovery code** (código de recuperação): ten single-use codes shown once at enrollment. Using one does not open a session — it forces re-enrolling the authenticator, which replaces all ten.
- Session claims: user email, role, clinic (Super Admin has no clinic — it operates the platform, outside every clinic), assigned professional (if Profissional).

**Role** (papel)

Fixed catalog of six; a Clinic's Admin de Empresa cannot invent new roles or permissions.

- **Super Admin** (sistema, operador da plataforma): the one platform operator ([ADR-007](./docs/adr/007-super-admin-operador-da-plataforma.md)). Reaches only the `platform` route family (`/plataforma`, `/api/platform/**`) plus logout; no access to any Clinic's data — no patient record, schedule, billing or settings. Invites the first Admin de Empresa of a Clinic and imports the global taxonomy catalog. There is exactly one: it comes from bootstrap, no one creates another, and the database refuses a second one. Signs in with password **and** a second factor ([ADR-008](./docs/adr/008-segundo-fator-do-super-admin.md)).
- **Admin de Empresa** (equipe, admin da clínica): full access within its own Clinic only — operational data, clinical data, clinic settings, account management. A Clinic may have more than one. Creates Profissional, Atendente, Patient, Partner, and other Admin de Empresa accounts, all within its own Clinic.
- **Atendente** (equipe, recepção): operational access only — scheduling and patient/partner registration. No access to clinical data (evolution notes, condition assessments, photos). Creates Patient and Partner accounts.
- **Profissional** (equipe): clinical access, but scoped dynamically — sees only patients it has at least one appointment or evolution note with. Not a fixed "ownership": a patient can accumulate access for several professionals over time (coverage, transfer, return). Creates Patient and Partner accounts.
- **Patient** (paciente): own portal, can read own records and submit photos. Never self-registers — always created by staff.
- **Partner** (parceiro): own portal, referral tracking. Never self-registers, and creates no one.

**Account provisioning** (cadastro de contas)

- No self-registration for any role: every account is created by someone else in the hierarchy above (see Role).
- A Clinic's first Admin de Empresa is invited by Super Admin through the platform (`POST /api/platform/clinics/[id]/admins`); the response never carries the invite link. No self-service onboarding yet.
- No one creates a Super Admin (`ck_user_accounts_system_role_has_no_clinic` + `uq_user_accounts_single_system_account`).

**Authorization** (autorização)

- Two-layer defense ([ADR-002](./docs/adr/002-autorizacao-em-duas-camadas.md)):
  1. **Proxy layer** (`src/proxy.ts`): edge-level checks, rate limiting, early rejects.
  2. **Handler layer** (`src/lib/auth/require-session.ts`): per-route authorization, fail-closed.
- Policy source: `src/lib/auth/access-policy.ts`.
- Scoped by Clinic (`clinic_id`) for every clinic role, and additionally by professional assignment for Profissional. Super Admin is kept out of every clinic route family and only reaches `platform`.
- **Tenant scope** (`src/lib/auth/tenant-scope.ts`): `getRepositories` only accepts a branded `TenantScope` built by `sessionScope` (reads — exact session clinic, `null` when the session has none), `writeScope`/`writeClinicId` (writes — falls back to the legacy clinic when the session has none), `clinicScope` (explicit clinic) or `systemScope` (cross-clinic, allowlisted in `tests/lib/tenant-scope.test.ts`). A raw `{ clinicId: … }` literal does not compile.
- Audit: all changes record the authenticated actor (no anonymous actions); a Super Admin action on a Clinic (inviting its first admin) is recorded in that Clinic's audit trail.

### Business Rules

**Appointment conflicts**

- No two appointments may overlap for a patient.
- Enforced by `endsAtBuffered` and trigger-level exclusion constraint.
- Minimum gap between appointments: defined in `schedule_settings`.

**Patient self-service** (paciente cancela/remarca pelo portal — `src/domain/scheduling/patient-self-service.ts`)

- The patient can cancel or reschedule their own active appointment through the portal only up to the clinic's **cancellation notice** (default 24 h, see Cancellation policy); inside that window the portal points them to the clinic (the server enforces the same rule).
- Reschedule keeps procedure, price, professional and duration — only the time changes, validated by the same availability rule as staff scheduling; the appointment goes back to `scheduled` (awaiting confirmation). Slots for rescheduling (`/api/portal/patient/slots?appointmentId=…`) use the appointment's own duration and professional and ignore the appointment itself as a conflict.
- Both actions are audited with the patient as actor and sync Google Calendar after the response. Cancelling again is idempotent. The portal alerts only cancellations made by the clinic; the patient's own go to the history. Staff see the origin, date and reason in the appointment detail.

**Schedule settings** (configuração de horário)

- Weekday/hour ranges when clinic accepts appointments — one row per clinic.
- Optional **lunch break** (`lunchBreak`, minutes of day): no appointment may overlap it, for any professional. Must sit strictly inside opening hours.
- Business hours respected for appointment creation and reminders.

**Cancellation policy** (política de cancelamento — `cancellationPolicy` in the clinic's schedule settings)

- `noticeHours` (0–168, default 24): minimum notice for the patient to cancel/reschedule alone in the portal.
- `lateFeeCents` (default 0 = no fee): optional fee for **late cancellation** and **no-show**.
- Staff cancelling records who asked (`clinic` or `patient`, e.g. by phone). A patient request inside the notice window is marked **late** (`appointments.cancelled_late`); a clinic cancellation is never late. With a fee configured, staff choose whether to charge it: the fee becomes an ordinary **pending invoice** linked to the appointment ("Taxa de cancelamento tardio" / "Taxa de não comparecimento"). The appointment never becomes a completed session, so the fee never enters commission. Charging a fee on a non-late cancellation is refused.
- Saving the schedule grid without the policy or lunch fields keeps the stored values (older screens can't wipe them).

**Waitlist** (lista de espera — `src/domain/scheduling/waitlist.ts`, `waitlist_entries`)

- A patient waiting for a slot: optional procedure and professional (empty = any), a date window (≤ 180 days) and notes; first come, first served. Added by staff (agenda → Lista de espera) or by the patient in the portal when a day has no free slot (30-day window starting that day, never in the past). Repeating the same request does not duplicate it.
- When staff cancel an appointment, the response says how many waiting entries accept that day (and professional); the agenda shows it as a toast. The system never books automatically — staff offer the slot and use "Agendar" (form prefilled), which removes the entry as `scheduled`. Entries leave as `scheduled` or `removed` (staff, or the patient in the portal — own entries only).

**Schedule availability** (`src/domain/scheduling/schedule-availability.ts`)

- **Closures** (`schedule_closures`): a clinic-wide closure (holiday, recess — `professional_id` null) blocks the whole day for everyone; a professional closure (vacation, congress) blocks only that professional's appointments. Local inclusive dates, 1–366 days, mandatory reason. Registering a closure never cancels existing appointments: the response lists the active ones in the period so the front desk reschedules case by case. Managed in Configurações (Admin and Atendente, same family as the grid); holidays are entered by hand (no national-holiday import).
- **Professional weekly hours** (`professional_availability`): windows per weekday (non-overlapping). A professional with no windows follows only the clinic grid; with windows, an appointment assigned to them must fit entirely inside one window **and** the clinic grid/lunch. Edited in Profissionais (Admin only — `/api/professionals` family).
- One rule everywhere: `assertSlotAvailable` (staff create/reschedule/recurring, portal self-scheduling/reschedule and the portal slot list) checks grid → lunch → closures → professional hours → gap between appointments. Portal bookings have no professional, so only clinic closures apply to them. The agenda grid shows clinic closures as closed days and professional absences as a note.

**Pricing**

- Appointment price set at creation (may differ from current procedure price).
- Stock movement price frozen at time of ledger entry.
- Supplies have cost; procedures have revenue.

**Invoice payments and discount** (`src/domain/billing/invoice.ts`, `invoice_payments`)

- An invoice can be paid in **several payments** (partial payments), each immutable with amount, method and date. It stays `pending` until the payments reach the **net amount**; then it becomes `paid`, with the date and method of the settling payment. "Receber" with the full balance keeps the historic one-click flow.
- **Discount** with a mandatory reason, only while pending, replacing any previous discount; it cannot bring the net amount below what was already received, nor to zero (that is cancelling). A discount that makes the net equal to the received amount settles the invoice.
- An invoice with any payment cannot be cancelled (give a discount on the balance instead).
- Billing totals: **received** = sum of payments (partials included); **to receive** = balance of pending invoices (net − received). Invoices paid before payments were recorded got one `legacy-<id>` payment in migration 0036.
- **Commission is unchanged**: it is released only when the invoice is fully `paid` and is still computed on the session value — an invoice discount does not reduce the professional's commission (clinic's cost).
- **Receipt** (`/documentos/recibo/:invoiceId/:paymentId`, number `REC-…`): one per payment — who paid, amount, method, date, invoice value, discount, received so far and remaining balance; Admin only (billing family). The patient portal shows paid and remaining amounts on partially paid invoices.

**Commission** (repasse ao profissional — rule in `src/domain/billing/commission.ts`)

- **Accrued on production, released on payment:** commission is computed on sessions (completed appointments) of the month, but only enters the payout once the invoice covering it is paid.
- **Cancelled invoice** → no revenue and no commission for that session.
- **Default is the clinic's risk:** an invoice still pending 60 days after its due date (or issue date, when there is none) releases the commission anyway.
- **Package session** is worth package price ÷ sessions (never the full procedure price — that double-counted revenue); release follows the package-sale invoice (`invoices.session_package_id`). Package invoices sold before that link existed release immediately.
- **Courtesy package** (price zero): zero revenue, but commission on the session's normal price, already released — courtesy is the clinic's marketing cost.
- **Commission rule per professional** (set only by Admin de Empresa): `percentage` of the session value, or `fixed` amount per session performed.
- Monthly report shows per professional: accrued (`commissionCents`), released and pending — computed session by session with the same rule the payout ledger uses.

**Commission payout** (repasse — `src/domain/billing/commission-payout.ts`, screen `/repasses`)

- **Monthly closing per professional**, one per month, recorded only by Admin de Empresa. Closing month M pays everything released up to the end of M and not yet paid — including late releases from earlier months. Only months already ended can be closed.
- Each session is paid **at most once** (unique `(appointment_id, kind)` among *active* items of `commission_payout_items`); the amount is **frozen** in the item, and the rule in force is snapshotted on the payout, so a later rule change never recalculates what was paid.
- A paid session whose invoice is cancelled afterwards becomes a **reversal** (negative item) deducted in the next closing; a closing whose balance is zero or negative is refused and the reversal waits.
- Access is declared by route family (`src/lib/auth/route-family.ts`): `/api/commission-payouts` (clinic view + closing) is `administrative` (Admin only); `/api/my-payouts` is the new `professional_self` family (Admin and Profissional, never Atendente) and always scopes to the session's `professionalId`. **Profissional** sees only their own statement (to receive, awaiting patient payment, history).
- **Cancelling a payout** recorded by mistake (Admin only, `POST /api/commission-payouts/:id/cancel`): never deleted — marked `cancelled` with a mandatory reason, who and when, and audited. Its sessions return to the balance and the month can be closed again (the uniqueness indexes are partial on active rows). Only the **latest active payout of each professional** can be cancelled, since a later closing may have deducted reversals from it. The system does not move money: refunding an amount already transferred is settled directly with the professional.
- **Payout receipt** (`/documentos/repasse/:id`, number `REP-…`): printable document with the clinic header (blocked while clinic info is incomplete), professional and registry, period, paid date and method, rule applied, sessions and reversals, total, and a "received" signature line for the professional; a cancelled payout prints with a CANCELADO mark and the reason. Admin issues any receipt of the clinic; Profissional only their own (`/api/my-payouts/:id`, 404 for anyone else's).

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

- Namespaced per clinic: `<clinic_id>/condition-photos/<id>`. Default is local disk (`UPLOADS_DIR`, Docker volume); `PHOTO_STORAGE=s3` stores in a private S3-compatible bucket (AWS S3, R2, MinIO) under the same keys — required with more than one replica. Missing S3 variables fail at startup, never silently fall back to disk.

**Multiple replicas** (analysis item A4)

- All rate limits are counted in Postgres (`rate_limit_windows`, atomic fixed-window upsert) and hold **summed across replicas** (issue #77). If the database fails, the replica's in-memory limit applies instead of allowing everything.
- Auth endpoints (login, forgot/set password, bootstrap) write every attempt — exact.
- The global `/api/*` limit (`API_RATE_LIMIT_MAX`, `proxy.ts`) is batched: each replica counts locally and sends the accumulated delta at most once per second per IP, reading back the global total. Drift is bounded by one second of traffic per replica; database writes are at most one per IP per second per replica, not one per request.
- Other per-process state is safe to keep per replica: the staff revocation cache (60 s TTL over the database), the closed-month report cache (only settled reports, which no longer change) and the Calendar gateway cache (token reuse only).

**No global state per clinic** (in preparation for Phase 2)

- Config goes in tables, not env vars.
- Cache keys must include tenant (prepared but not enforced yet).

**Calendar sync**

- Google Calendar integration requires OAuth tokens (encrypted in `google_accounts`), connected separately after login — unrelated to authentication.
- Bidirectional: appointments ↔ Google events.
- Gateway resolved **lazily** (`LazyCalendarGateway`): building the services never reads `google_accounts`; the credential is read on first use — for appointment sync, inside `after()`, off the response path. With no Google integration configured in env, the gateway is `NullCalendarGateway` and no query happens at all.

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
- [ADR-005: Revogação de sessão por versão](./docs/adr/005-revogacao-de-sessao-por-versao.md) — `session_version` na conta × `sv` no token; logout, senha e desativação revogam.
- [ADR-006: Chave de dados clínicos](./docs/adr/006-chave-de-dados-clinicos.md) — `DATA_ENCRYPTION_KEY` versionada, separada do `AUTH_SECRET`; todo texto clínico cifrado.
- [ADR-007: Super Admin é o operador da plataforma](./docs/adr/007-super-admin-operador-da-plataforma.md) — um único super_admin, família `platform`, sem acesso a dado de clínica; emenda o ADR-003.
- [ADR-008: Segundo fator do Super Admin](./docs/adr/008-segundo-fator-do-super-admin.md) — TOTP obrigatório, login em duas etapas, códigos de recuperação que levam ao recadastro.
