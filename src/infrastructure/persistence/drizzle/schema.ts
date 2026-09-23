import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const clinics = pgTable('clinics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  createdBy: text('created_by').notNull(),
  // Dados cadastrais (issue #61) — usados no cabeçalho/rodapé de documentos
  // clínicos emitidos (issue #62). Nullable: nem toda instalação os preencheu ainda.
  cnpj: text('cnpj'),
  address: text('address'),
  city: text('city'),
  professionalName: text('professional_name'),
  professionalRegistry: text('professional_registry'),
});

export const partners = pgTable(
  'partners',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    fullName: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone').notNull(),
    crm: text('crm'),
    specialty: text('specialty'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_partners_clinic').on(table.clinicId)],
);

export const professionals = pgTable(
  'professionals',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    fullName: text('full_name').notNull(),
    registry: text('registry'),
    // Repasse (O3.4): regra configurada pelo Admin da clínica — percentual
    // sobre o valor da sessão ou valor fixo por sessão.
    commissionType: text('commission_type').notNull().default('percentage'),
    commissionPct: integer('commission_pct'),
    commissionFixedCents: integer('commission_fixed_cents'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_professionals_clinic').on(table.clinicId)],
);

export const procedures = pgTable(
  'procedures',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    name: text('name').notNull(),
    priceCents: integer('price_cents').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    // Unicidade case-insensitive do catálogo, composta por empresa (MT-06).
    uniqueIndex('uq_procedures_name').on(
      table.clinicId,
      sql`lower(${table.name})`,
    ),
    index('idx_procedures_clinic').on(table.clinicId),
  ],
);

export const procedureSupplies = pgTable(
  'procedure_supplies',
  {
    procedureId: text('procedure_id')
      .notNull()
      .references(() => procedures.id),
    supplyId: text('supply_id').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    uniqueIndex('uq_procedure_supplies').on(table.procedureId, table.supplyId),
  ],
);

export const userAccounts = pgTable(
  'user_accounts',
  {
    id: text('id').primaryKey(),
    // Nulo somente para o papel de sistema (super_admin — cross-empresa, RBAC-01/ADR-003).
    clinicId: text('clinic_id').references(() => clinics.id),
    email: text('email').notNull(),
    // Formato scrypt$custo$salt$hash — nunca a senha em claro.
    passwordHash: text('password_hash').notNull(),
    // Um dos 6 valores de UserRole (RBAC-01).
    role: text('role').notNull(),
    professionalId: text('professional_id').references(() => professionals.id),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    // E-mail de login único por empresa, não globalmente (MT-06, ADR-003).
    uniqueIndex('uq_user_accounts_clinic_email').on(
      table.clinicId,
      table.email,
    ),
    // Postgres trata NULL como distinto em índice único composto — sem este
    // índice parcial, duas contas super_admin (clinic_id NULL) poderiam ter
    // o mesmo email, e o login (findByEmail + LIMIT 1) escolheria uma
    // identidade de forma ambígua.
    uniqueIndex('uq_user_accounts_super_admin_email')
      .on(table.email)
      .where(sql`${table.clinicId} IS NULL`),
    // No máximo UMA conta com clinic_id nulo pode existir (hoje só o Super
    // Admin de bootstrap nasce assim) — fecha a corrida de dois POST
    // concorrentes em /api/auth/bootstrap numa instalação vazia (issue #51).
    // `role` é sempre "super_admin" nessas linhas; o índice só precisa de uma
    // coluna para expressar "no máximo uma linha bate neste predicado".
    uniqueIndex('uq_user_accounts_single_system_account')
      .on(table.role)
      .where(sql`${table.clinicId} IS NULL`),
    index('idx_user_accounts_clinic').on(table.clinicId),
  ],
);

export const scheduleSettings = pgTable(
  'schedule_settings',
  {
    // Uma linha por clínica (era linha única "default" antes da M3 — MT-17).
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    weekdays: text('weekdays').notNull(),
    startHour: integer('start_hour').notNull(),
    endHour: integer('end_hour').notNull(),
    minGapMinutes: integer('min_gap_minutes').notNull(),
    // Almoço da clínica em minutos desde 00:00 — ambos nulos = sem pausa.
    lunchStartMinute: integer('lunch_start_minute'),
    lunchEndMinute: integer('lunch_end_minute'),
    // Política de cancelamento — nulos = padrão (24 h, sem taxa).
    cancelNoticeHours: integer('cancel_notice_hours'),
    lateCancelFeeCents: integer('late_cancel_fee_cents'),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [uniqueIndex('uq_schedule_settings_clinic').on(table.clinicId)],
);

// Feriados/recessos da clínica (professional_id nulo) e ausências de um
// profissional. Datas locais inclusivas.
export const scheduleClosures = pgTable(
  'schedule_closures',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    professionalId: text('professional_id').references(() => professionals.id),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_schedule_closures_clinic_dates').on(
      table.clinicId,
      table.startsOn,
      table.endsOn,
    ),
  ],
);

// Janelas semanais de atendimento de um profissional. Sem linhas = segue a
// grade da clínica.
export const professionalAvailability = pgTable(
  'professional_availability',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    professionalId: text('professional_id')
      .notNull()
      .references(() => professionals.id),
    weekday: integer('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
  },
  (table) => [
    index('idx_professional_availability_professional').on(
      table.professionalId,
    ),
  ],
);

// Lista de espera: pacientes aguardando vaga, por ordem de chegada.
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    procedureId: text('procedure_id').references(() => procedures.id),
    professionalId: text('professional_id').references(() => professionals.id),
    fromDate: date('from_date', { mode: 'string' }).notNull(),
    toDate: date('to_date', { mode: 'string' }).notNull(),
    notes: text('notes'),
    source: text('source').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_waitlist_entries_clinic_status').on(
      table.clinicId,
      table.status,
      table.createdAt,
    ),
    index('idx_waitlist_entries_patient').on(table.patientId),
  ],
);

export const patients = pgTable(
  'patients',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    birthDate: timestamp('birth_date', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    referredByPartnerId: text('referred_by_partner_id').references(
      () => partners.id,
    ),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_patients_referrer').on(table.referredByPartnerId),
    // Ordenação padrão das listagens.
    index('idx_patients_full_name').on(table.fullName),
    // Busca com ILIKE '%termo%' — GIN + pg_trgm evita full scan.
    index('idx_patients_full_name_trgm').using(
      'gin',
      table.fullName.op('gin_trgm_ops'),
    ),
    index('idx_patients_email_trgm').using(
      'gin',
      table.email.op('gin_trgm_ops'),
    ),
    index('idx_patients_phone_trgm').using(
      'gin',
      table.phone.op('gin_trgm_ops'),
    ),
    index('idx_patients_clinic').on(table.clinicId),
    // E-mail único por empresa, não globalmente (MT-06).
    uniqueIndex('uq_patients_clinic_email').on(table.clinicId, table.email),
  ],
);

export const appointments = pgTable(
  'appointments',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    startsAt: timestamp('starts_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    endsAt: timestamp('ends_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    // Mantida por trigger (migração 0002) para a constraint de exclusão anti-double-booking.
    endsAtBuffered: timestamp('ends_at_buffered', {
      withTimezone: true,
      mode: 'date',
    }),
    procedure: text('procedure').notNull(),
    priceCents: integer('price_cents').notNull(),
    notes: text('notes'),
    status: text('status').notNull(),
    googleEventId: text('google_event_id'),
    // Profissional responsável (F9) — nullable, retrocompatível.
    professionalId: text('professional_id').references(() => professionals.id),
    // Procedimento do catálogo (O1.1) — nullable, histórico intacto.
    procedureId: text('procedure_id').references(() => procedures.id),
    // Registro do cancelamento (quem, quando, por quê) — null no histórico
    // anterior e em consultas não canceladas.
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'date',
    }),
    cancelledBy: text('cancelled_by'),
    cancelReason: text('cancel_reason'),
    // Cancelamento pedido pelo paciente dentro da antecedência mínima.
    cancelledLate: boolean('cancelled_late').notNull().default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_appointments_starts_at').on(table.startsAt),
    index('idx_appointments_professional').on(table.professionalId),
    // Composto cobre findByPatientId com ORDER BY starts_at.
    index('idx_appointments_patient').on(table.patientId, table.startsAt),
    index('idx_appointments_clinic').on(table.clinicId),
  ],
);

/**
 * Tokens de convite e reset de senha. Sem `clinic_id` de propósito: o consumo
 * acontece antes de existir sessão (não há tenant de contexto), a conta alvo já
 * carrega a empresa e o acesso é sempre pela chave única `secret_hash` — nunca
 * por listagem que pudesse cruzar empresas.
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => userAccounts.id),
    // "invite" | "reset" (AuthTokenPurpose).
    purpose: text('purpose').notNull(),
    // SHA-256 hex do segredo entregue no link — o segredo em si nunca é persistido.
    secretHash: text('secret_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    // Única chave de busca no consumo do link.
    uniqueIndex('uq_auth_tokens_secret_hash').on(table.secretHash),
    // Invalidação em lote dos tokens anteriores do mesmo propósito.
    index('idx_auth_tokens_account_purpose').on(table.accountId, table.purpose),
    // No máximo um token não-usado por conta+propósito: força emissões
    // concorrentes a serializar no índice (issue #50) em vez de deixar duas
    // linhas "não usadas" nascerem da mesma janela de corrida.
    uniqueIndex('uq_auth_tokens_account_purpose_unused')
      .on(table.accountId, table.purpose)
      .where(sql`${table.usedAt} IS NULL`),
  ],
);

export const googleAccounts = pgTable(
  'google_accounts',
  {
    // id determinístico (`${clinicId ?? 'system'}:${email}`) — permite upsert
    // por `target: id` sem depender de índice único parcial (issue #74).
    id: text('id').primaryKey(),
    // Nulo somente para o papel de sistema (modo aberto), igual a user_accounts.
    clinicId: text('clinic_id').references(() => clinics.id),
    email: text('email').notNull(),
    // Refresh token do OAuth cifrado com AES-256-GCM (chave derivada de AUTH_SECRET).
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    connectedAt: timestamp('connected_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_google_accounts_clinic').on(table.clinicId)],
);

export const anamneses = pgTable(
  'anamneses',
  {
    patientId: text('patient_id')
      .primaryKey()
      .references(() => patients.id),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    comorbidities: text('comorbidities').notNull().default(''),
    allergies: text('allergies').notNull().default(''),
    medications: text('medications').notNull().default(''),
    surgicalHistory: text('surgical_history').notNull().default(''),
    notes: text('notes').notNull().default(''),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_anamneses_clinic').on(table.clinicId)],
);

export const evolutionNotes = pgTable(
  'evolution_notes',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    appointmentId: text('appointment_id'),
    // Autor da evolução (F9) — nullable, retrocompatível.
    professionalId: text('professional_id').references(() => professionals.id),
    subjective: text('subjective').notNull().default(''),
    objective: text('objective').notNull().default(''),
    assessment: text('assessment').notNull().default(''),
    plan: text('plan').notNull().default(''),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_evolution_notes_patient').on(table.patientId),
    index('idx_evolution_notes_clinic').on(table.clinicId),
  ],
);

export const clinicalConditions = pgTable(
  'clinical_conditions',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    stomaType: text('stoma_type'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_clinical_conditions_patient').on(table.patientId),
    index('idx_clinical_conditions_clinic').on(table.clinicId),
  ],
);

export const conditionAssessments = pgTable(
  'condition_assessments',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    conditionId: text('condition_id')
      .notNull()
      .references(() => clinicalConditions.id),
    lengthMm: integer('length_mm'),
    widthMm: integer('width_mm'),
    depthMm: integer('depth_mm'),
    tissueType: text('tissue_type'),
    exudate: text('exudate'),
    painScale: integer('pain_scale'),
    skinCondition: text('skin_condition'),
    complications: text('complications'),
    // Complicações canônicas (CSV de enum) — O2.2; texto livre legado preservado acima.
    complicationCodes: text('complication_codes'),
    // Escala DET (estomias): área 0–3 e severidade 0–2 por domínio — O2.2.
    detDiscolorationArea: integer('det_discoloration_area'),
    detDiscolorationSeverity: integer('det_discoloration_severity'),
    detErosionArea: integer('det_erosion_area'),
    detErosionSeverity: integer('det_erosion_severity'),
    detOvergrowthArea: integer('det_overgrowth_area'),
    detOvergrowthSeverity: integer('det_overgrowth_severity'),
    notes: text('notes'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_condition_assessments_condition').on(table.conditionId),
    index('idx_condition_assessments_clinic').on(table.clinicId),
  ],
);

export const conditionPhotos = pgTable(
  'condition_photos',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    conditionId: text('condition_id')
      .notNull()
      .references(() => clinicalConditions.id),
    assessmentId: text('assessment_id'),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Monitoramento remoto (O4.2): origem, observação do paciente e triagem.
    origin: text('origin').notNull().default('staff'),
    patientNote: text('patient_note'),
    triageStatus: text('triage_status'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_condition_photos_condition').on(table.conditionId),
    index('idx_condition_photos_triage').on(table.triageStatus),
    index('idx_condition_photos_clinic').on(table.clinicId),
  ],
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    kind: text('kind').notNull().default('accept'),
    textHash: text('text_hash').notNull(),
    textVersion: text('text_version'),
    ipAddress: text('ip_address'),
    acceptedAt: timestamp('accepted_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_consent_records_patient').on(table.patientId),
    index('idx_consent_records_clinic').on(table.clinicId),
  ],
);

export const supplies = pgTable(
  'supplies',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    minQty: integer('min_qty').notNull(),
    priceCents: integer('price_cents').notNull(),
    stockQty: integer('stock_qty').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_supplies_clinic').on(table.clinicId)],
);

export const supplyBatches = pgTable(
  'supply_batches',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    supplyId: text('supply_id')
      .notNull()
      .references(() => supplies.id),
    label: text('label'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    quantity: integer('quantity').notNull(),
    remaining: integer('remaining').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_supply_batches_supply').on(table.supplyId),
    index('idx_supply_batches_expires_at').on(table.expiresAt),
    index('idx_supply_batches_clinic').on(table.clinicId),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    supplyId: text('supply_id')
      .notNull()
      .references(() => supplies.id),
    type: text('type').notNull(),
    quantity: integer('quantity').notNull(),
    reason: text('reason').notNull(),
    // Consulta atendida com este material (custo por atendimento).
    appointmentId: text('appointment_id').references(() => appointments.id),
    // Preço unitário congelado na saída — histórico imune a reajustes.
    unitPriceCents: integer('unit_price_cents'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_stock_movements_supply').on(table.supplyId),
    index('idx_stock_movements_appointment').on(table.appointmentId),
    index('idx_stock_movements_created_at').on(table.createdAt),
    index('idx_stock_movements_clinic').on(table.clinicId),
  ],
);

export const followUps = pgTable(
  'follow_ups',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    appointmentId: text('appointment_id'),
    dueDate: timestamp('due_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_follow_ups_status').on(table.status),
    index('idx_follow_ups_due_date').on(table.dueDate),
    index('idx_follow_ups_clinic').on(table.clinicId),
  ],
);

export const reminderLogs = pgTable(
  'reminder_logs',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    kind: text('kind').notNull(),
    referenceId: text('reference_id').notNull(),
    sentOn: text('sent_on').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    // Idempotência diária: um lembrete por (tipo, referência, dia). referenceId já é
    // um id de linha (uuid) globalmente único, então não precisa de clinic_id na chave.
    uniqueIndex('uq_reminder_logs_daily').on(
      table.kind,
      table.referenceId,
      table.sentOn,
    ),
    index('idx_reminder_logs_clinic').on(table.clinicId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    // Empresa a que o evento pertence, ou empresa acessada em acesso cross-empresa
    // do papel de sistema — sempre concreto, resolvido em src/lib/audit.ts (MT-13, MT-29).
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    actorRole: text('actor_role').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    patientId: text('patient_id'),
    detail: text('detail'),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_audit_events_patient').on(table.patientId),
    index('idx_audit_events_occurred_at').on(table.occurredAt),
    index('idx_audit_events_clinic').on(table.clinicId),
  ],
);

export const sessionPackages = pgTable(
  'session_packages',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    procedureId: text('procedure_id')
      .notNull()
      .references(() => procedures.id),
    totalSessions: integer('total_sessions').notNull(),
    usedSessions: integer('used_sessions').notNull().default(0),
    priceCents: integer('price_cents').notNull(),
    // Validade opcional (COMP3-07) — null = sem validade (histórico preservado).
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_session_packages_patient').on(table.patientId),
    index('idx_session_packages_clinic').on(table.clinicId),
  ],
);

export const packageConsumptions = pgTable(
  'package_consumptions',
  {
    packageId: text('package_id')
      .notNull()
      .references(() => sessionPackages.id),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    appointmentId: text('appointment_id').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    // Uma consulta consome no máximo uma sessão (idempotência da conclusão reparadora).
    uniqueIndex('uq_package_consumption_appointment').on(table.appointmentId),
    index('idx_package_consumptions_clinic').on(table.clinicId),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    appointmentId: text('appointment_id'),
    // Fatura da venda de um pacote de sessões — base da liberação da comissão
    // das sessões consumidas. Null em faturas avulsas/de consulta e nas de
    // pacote vendidas antes do vínculo existir.
    sessionPackageId: text('session_package_id').references(
      () => sessionPackages.id,
    ),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull(),
    issuedAt: timestamp('issued_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    paymentMethod: text('payment_method'),
    // Desconto sobre o valor da fatura (0 = sem desconto) e o motivo.
    discountCents: integer('discount_cents').notNull().default(0),
    discountReason: text('discount_reason'),
  },
  (table) => [
    index('idx_invoices_status').on(table.status),
    index('idx_invoices_issued_at').on(table.issuedAt),
    // Portal do paciente e filtros por paciente.
    index('idx_invoices_patient').on(table.patientId),
    index('idx_invoices_clinic').on(table.clinicId),
    index('idx_invoices_session_package').on(table.sessionPackageId),
  ],
);

// Recebimentos de uma fatura (parciais ou total) — imutáveis. A fatura vira
// `paid` quando a soma alcança o valor líquido. Faturas pagas antes desta
// tabela existir ganham um recebimento `legacy-<id>` na migração.
export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id),
    amountCents: integer('amount_cents').notNull(),
    method: text('method').notNull(),
    paidAt: timestamp('paid_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_invoice_payments_invoice').on(table.invoiceId)],
);

// Catálogo de taxonomias de enfermagem (NANDA-I/NOC/NIC) — populado por importação
// licenciada (scripts/import-taxonomy.ts), unicidade por (code, edition).
export const nursingDiagnoses = pgTable(
  'nursing_diagnoses',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    domain: text('domain').notNull(),
    class: text('class').notNull(),
    definition: text('definition'),
    edition: text('edition').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_nursing_diagnoses_code_edition').on(
      table.code,
      table.edition,
    ),
    index('idx_nursing_diagnoses_label').on(table.label),
  ],
);

export const nursingOutcomes = pgTable(
  'nursing_outcomes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    domain: text('domain').notNull(),
    class: text('class').notNull(),
    edition: text('edition').notNull(),
    // Escala Likert 1–5 do resultado, âncoras 1→5 (ver NocScale).
    scaleAnchor1: text('scale_anchor_1').notNull(),
    scaleAnchor2: text('scale_anchor_2').notNull(),
    scaleAnchor3: text('scale_anchor_3').notNull(),
    scaleAnchor4: text('scale_anchor_4').notNull(),
    scaleAnchor5: text('scale_anchor_5').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_nursing_outcomes_code_edition').on(
      table.code,
      table.edition,
    ),
    index('idx_nursing_outcomes_label').on(table.label),
  ],
);

export const nursingInterventions = pgTable(
  'nursing_interventions',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    domain: text('domain').notNull(),
    class: text('class').notNull(),
    edition: text('edition').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_nursing_interventions_code_edition').on(
      table.code,
      table.edition,
    ),
    index('idx_nursing_interventions_label').on(table.label),
  ],
);

// Ligações sugeridas NANDA→NOC/NIC — priorizam o subset curado na busca, não restringem.
export const taxonomyLinkages = pgTable(
  'taxonomy_linkages',
  {
    diagnosisCode: text('diagnosis_code').notNull(),
    role: text('role').notNull(),
    targetCode: text('target_code').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.diagnosisCode, table.role, table.targetCode],
    }),
    index('idx_taxonomy_linkages_diagnosis').on(table.diagnosisCode),
  ],
);

// Plano de cuidados (SAE) — raiz do agregado diagnóstico→resultado→intervenção.
export const carePlans = pgTable(
  'care_plans',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    conditionId: text('condition_id').references(() => clinicalConditions.id),
    professionalId: text('professional_id').references(() => professionals.id),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_care_plans_patient').on(table.patientId),
    index('idx_care_plans_condition').on(table.conditionId),
    index('idx_care_plans_clinic').on(table.clinicId),
  ],
);

export const carePlanDiagnoses = pgTable(
  'care_plan_diagnoses',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    carePlanId: text('care_plan_id')
      .notNull()
      .references(() => carePlans.id),
    diagnosisCode: text('diagnosis_code').notNull(),
    type: text('type').notNull(),
    // Etiologia ("relacionado a").
    relatedFactors: text('related_factors'),
    // Sinais/sintomas ("evidenciado por") — ausente em diagnóstico de risco.
    definingCharacteristics: text('defining_characteristics'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_care_plan_diagnoses_plan').on(table.carePlanId),
    index('idx_care_plan_diagnoses_clinic').on(table.clinicId),
  ],
);

export const carePlanOutcomes = pgTable(
  'care_plan_outcomes',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    carePlanId: text('care_plan_id')
      .notNull()
      .references(() => carePlans.id),
    outcomeCode: text('outcome_code').notNull(),
    baselineScore: integer('baseline_score').notNull(),
    targetScore: integer('target_score').notNull(),
    deadline: timestamp('deadline', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_care_plan_outcomes_plan').on(table.carePlanId),
    check(
      'chk_care_plan_outcomes_baseline_score',
      sql`${table.baselineScore} BETWEEN 1 AND 5`,
    ),
    check(
      'chk_care_plan_outcomes_target_score',
      sql`${table.targetScore} BETWEEN 1 AND 5`,
    ),
    index('idx_care_plan_outcomes_clinic').on(table.clinicId),
  ],
);

export const carePlanInterventions = pgTable(
  'care_plan_interventions',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    carePlanId: text('care_plan_id')
      .notNull()
      .references(() => carePlans.id),
    interventionCode: text('intervention_code').notNull(),
    frequency: text('frequency').notNull(),
    priority: text('priority').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_care_plan_interventions_plan').on(table.carePlanId),
    index('idx_care_plan_interventions_clinic').on(table.clinicId),
  ],
);

// Reavaliação de resultado NOC — append-only (integridade de prontuário).
export const outcomeEvaluations = pgTable(
  'outcome_evaluations',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    outcomeId: text('outcome_id')
      .notNull()
      .references(() => carePlanOutcomes.id),
    score: integer('score').notNull(),
    professionalId: text('professional_id').references(() => professionals.id),
    notes: text('notes'),
    evaluatedAt: timestamp('evaluated_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_outcome_evaluations_outcome').on(table.outcomeId),
    check('chk_outcome_evaluations_score', sql`${table.score} BETWEEN 1 AND 5`),
    index('idx_outcome_evaluations_clinic').on(table.clinicId),
  ],
);

// Execução de intervenção NIC prescrita — append-only.
export const interventionRecords = pgTable(
  'intervention_records',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    interventionId: text('intervention_id')
      .notNull()
      .references(() => carePlanInterventions.id),
    professionalId: text('professional_id').references(() => professionals.id),
    notes: text('notes'),
    performedAt: timestamp('performed_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    index('idx_intervention_records_intervention').on(table.interventionId),
    index('idx_intervention_records_clinic').on(table.clinicId),
  ],
);

/**
 * Vínculo Profissional↔Paciente (R4, RBAC-17..21) — nunca revogado uma vez
 * criado. Concedido por: cadastro do paciente pelo Profissional, criação de
 * agendamento ou de nota de evolução com esse profissional.
 */
export const professionalPatientLinks = pgTable(
  'professional_patient_links',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    professionalId: text('professional_id')
      .notNull()
      .references(() => professionals.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('uq_professional_patient_links').on(
      table.professionalId,
      table.patientId,
    ),
    index('idx_professional_patient_links_professional').on(
      table.professionalId,
    ),
    index('idx_professional_patient_links_clinic').on(table.clinicId),
  ],
);

/**
 * Livro de repasses: fechamento mensal por profissional (um por mês). O valor
 * de cada item é congelado no pagamento — mudar a regra depois não recalcula
 * o que já foi pago.
 */
export const commissionPayouts = pgTable(
  'commission_payouts',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    professionalId: text('professional_id')
      .notNull()
      .references(() => professionals.id),
    // Mês fechado (YYYY-MM): paga o que foi liberado até o fim dele.
    period: text('period').notNull(),
    totalCents: integer('total_cents').notNull(),
    paidAt: timestamp('paid_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    paymentMethod: text('payment_method').notNull(),
    notes: text('notes'),
    // Regra vigente no fechamento (retrato para o comprovante) — mudar a regra
    // do profissional depois não altera o que o documento mostra.
    ruleKind: text('rule_kind'),
    ruleValue: integer('rule_value'),
    // `active` | `cancelled`: repasse registrado por engano é cancelado, nunca
    // apagado — a trilha continua, as sessões voltam ao saldo.
    status: text('status').notNull().default('active'),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'date',
    }),
    cancelledBy: text('cancelled_by'),
    cancelReason: text('cancel_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    // Um fechamento ATIVO por profissional/mês — cancelado libera o refechamento.
    uniqueIndex('uq_commission_payouts_active_period')
      .on(table.clinicId, table.professionalId, table.period)
      .where(sql`${table.status} = 'active'`),
    index('idx_commission_payouts_professional').on(table.professionalId),
  ],
);

export const commissionPayoutItems = pgTable(
  'commission_payout_items',
  {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    payoutId: text('payout_id')
      .notNull()
      .references(() => commissionPayouts.id),
    professionalId: text('professional_id')
      .notNull()
      .references(() => professionals.id),
    appointmentId: text('appointment_id').notNull(),
    // `session` = repasse da sessão; `reversal` = estorno de sessão já paga
    // cuja fatura foi cancelada depois (valor negativo).
    kind: text('kind').notNull(),
    procedure: text('procedure').notNull(),
    sessionDate: timestamp('session_date', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    baseCents: integer('base_cents').notNull(),
    commissionCents: integer('commission_cents').notNull(),
    // Falso quando o repasse foi cancelado: a sessão volta ao saldo a pagar.
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    // Uma sessão é paga no máximo uma vez entre os repasses ativos (e
    // estornada no máximo uma vez).
    uniqueIndex('uq_commission_payout_items_active_appointment')
      .on(table.appointmentId, table.kind)
      .where(sql`${table.active}`),
    index('idx_commission_payout_items_payout').on(table.payoutId),
    index('idx_commission_payout_items_professional').on(table.professionalId),
  ],
);

/**
 * Janelas de rate limit compartilhadas entre réplicas (issue #77) — só para
 * os endpoints de autenticação. Tabela de sistema, sem `clinic_id`: a chave é
 * `<limite>:<ip>`, anterior a qualquer sessão.
 */
export const rateLimitWindows = pgTable(
  'rate_limit_windows',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: timestamp('reset_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [index('idx_rate_limit_windows_reset_at').on(table.resetAt)],
);
