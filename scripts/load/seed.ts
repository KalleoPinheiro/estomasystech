import { Client } from "pg";
import {
  clinicIdFor,
  LOAD_ADMIN_EMAIL,
  type LoadProfile,
  PORTAL_ACCOUNTS,
  portalEmail,
  resolveProfile,
} from "./profiles";

/**
 * Semeia volume realista direto no Postgres (INSERT ... SELECT generate_series),
 * para o baseline de carga da #222. Pressupõe o schema já migrado (o app migra
 * no boot: suba `npm run start` uma vez com DATABASE_URL e pare).
 *
 * Uso: `DATABASE_URL=postgres://... npx tsx scripts/load/seed.ts [tipica|issue]`.
 * Idempotente: apaga e recria as empresas `load-clinic-*` antes de semear.
 * NUNCA aponte para um banco de produção — o script recusa bancos sem `load` ou
 * `localhost` no host.
 */
const FIRST_NAMES = ["Maria", "Ana", "João", "Pedro", "Lucia", "Carlos", "Fernanda", "Paulo", "Helena", "Marcos"];
const LAST_NAMES = ["Silva", "Souza", "Oliveira", "Santos", "Lima", "Pereira", "Costa", "Ribeiro", "Alves", "Rocha"];
const PROCEDURES = [
  "Curativo simples",
  "Curativo com desbridamento",
  "Terapia compressiva",
  "Troca de bolsa de estomia",
  "Avaliação inicial",
  "Retorno",
];

function assertSafeTarget(url: string): void {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !host.includes("load")) {
    throw new Error(`Recusado: ${host} não parece um banco de teste de carga.`);
  }
}

async function resetClinics(db: Client): Promise<void> {
  const like = "load-clinic-%";
  for (const table of [
    "audit_events",
    "follow_ups",
    "invoices",
    "appointments",
    "user_accounts",
    "patients",
    "procedures",
    "professionals",
    "schedule_settings",
  ]) {
    await db.query(`DELETE FROM ${table} WHERE clinic_id LIKE $1`, [like]);
  }
  await db.query("DELETE FROM clinics WHERE id LIKE $1", [like]);
}

async function seedCatalog(db: Client, clinicId: string, profile: LoadProfile): Promise<void> {
  await db.query(
    `INSERT INTO clinics (id, name, created_at, created_by) VALUES ($1, $2, now(), 'load-seed')`,
    [clinicId, `Clínica de carga ${clinicId}`],
  );
  await db.query(
    `INSERT INTO professionals (id, clinic_id, full_name, registry, created_at)
     SELECT $1 || '-prof-' || i, $1, 'Profissional ' || i, 'COREN-' || i, now()
     FROM generate_series(0, $2 - 1) AS i`,
    [clinicId, profile.professionals],
  );
  await db.query(
    `INSERT INTO procedures (id, clinic_id, name, price_cents, duration_minutes, created_at)
     SELECT $1 || '-proc-' || (i - 1), $1, ($2::text[])[i], 12000 + i * 1500, 45, now()
     FROM generate_series(1, array_length($2::text[], 1)) AS i`,
    [clinicId, PROCEDURES],
  );
}

async function seedPatients(db: Client, clinicId: string, profile: LoadProfile): Promise<void> {
  await db.query(
    `INSERT INTO patients (id, clinic_id, full_name, email, phone, created_at)
     SELECT $1 || '-pat-' || i, $1,
            ($3::text[])[1 + i % 10] || ' ' || ($4::text[])[1 + (i / 10) % 10] || ' ' || i,
            'p' || i || '@load.test', '1190000' || lpad((i % 10000)::text, 4, '0'),
            now() - (i % 700) * interval '1 day'
     FROM generate_series(0, $2 - 1) AS i`,
    [clinicId, profile.patients, FIRST_NAMES, LAST_NAMES],
  );
}

/**
 * Agenda sem choque de horário por profissional (constraint anti-double-booking):
 * cada profissional ocupa 8 horários por dia, a partir de 15 meses atrás.
 */
async function seedAppointments(db: Client, clinicId: string, profile: LoadProfile): Promise<void> {
  await db.query(
    `WITH slots AS (
       SELECT n, n % $2 AS prof, n / $2 AS k FROM generate_series(0, $3 - 1) AS n
     ), timed AS (
       SELECT n, prof,
              date_trunc('day', now()) - interval '15 months' + (k / 8) * interval '1 day'
                + (8 + k % 8) * interval '1 hour' AS starts
       FROM slots
     )
     INSERT INTO appointments
       (id, clinic_id, patient_id, starts_at, ends_at, procedure, price_cents, status,
        professional_id, procedure_id, created_at)
     SELECT $1 || '-apt-' || n, $1, $1 || '-pat-' || (n::bigint * 7919) % $4, starts,
            starts + interval '45 minutes', ($5::text[])[1 + n % 6], 15000,
            CASE WHEN starts > now() THEN (ARRAY['scheduled','confirmed'])[1 + n % 2]
                 ELSE (ARRAY['completed','completed','completed','completed','completed','completed',
                             'cancelled','no_show'])[1 + n % 8] END,
            $1 || '-prof-' || prof, $1 || '-proc-' || (n % 6), starts - interval '3 days'
     FROM timed`,
    [clinicId, profile.professionals, profile.appointments, profile.patients, PROCEDURES],
  );
}

async function seedFinanceAndAudit(db: Client, clinicId: string, profile: LoadProfile): Promise<void> {
  await db.query(
    `INSERT INTO invoices
       (id, clinic_id, patient_id, description, amount_cents, status, issued_at, due_date, paid_at, payment_method)
     SELECT $1 || '-inv-' || i, $1, $1 || '-pat-' || (i::bigint * 104729) % $3, 'Atendimento ' || i, 15000,
            st, ts, ts + interval '10 days', CASE WHEN st = 'paid' THEN ts + interval '2 days' END,
            CASE WHEN st = 'paid' THEN 'pix' END
     FROM (SELECT i, now() - (i % 450) * interval '1 day' AS ts,
                  (ARRAY['paid','paid','paid','pending','pending','cancelled'])[1 + i % 6] AS st
           FROM generate_series(0, $2 - 1) AS i) AS gen`,
    [clinicId, profile.invoices, profile.patients],
  );
  await db.query(
    `INSERT INTO follow_ups (id, clinic_id, patient_id, due_date, reason, status, created_at)
     SELECT $1 || '-fu-' || i, $1, $1 || '-pat-' || (i::bigint * 31) % $3, now() + (i % 60 - 30) * interval '1 day',
            'Retorno de avaliação', (ARRAY['pending','pending','done','cancelled'])[1 + i % 4], now()
     FROM generate_series(0, $2 - 1) AS i`,
    [clinicId, profile.followUps, profile.patients],
  );
  await db.query(
    `INSERT INTO audit_events
       (id, clinic_id, actor_role, actor_id, action, resource_type, resource_id, patient_id, occurred_at)
     SELECT $1 || '-aud-' || i, $1, 'company_admin', 'carga-admin', (ARRAY['read','read','read','update'])[1 + i % 4],
            (ARRAY['patient','anamnesis','condition','appointment'])[1 + i % 4],
            $1 || '-pat-' || i % $3, $1 || '-pat-' || i % $3, now() - (i % 365) * interval '1 day' - (i % 86400) * interval '1 second'
     FROM generate_series(0, $2 - 1) AS i`,
    [clinicId, profile.auditEvents, profile.patients],
  );
}

async function seedAccounts(db: Client, clinicId: string): Promise<void> {
  const insert = `INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, patient_id, created_at)
                  VALUES ($1, $2, $3, 'scrypt$load$nao-loga$nao-loga', $4, $5, now())`;
  await db.query(insert, [`${clinicId}-admin`, clinicId, LOAD_ADMIN_EMAIL, "company_admin", null]);
  for (let i = 0; i < PORTAL_ACCOUNTS; i++) {
    await db.query(insert, [`${clinicId}-acc-${i}`, clinicId, portalEmail(i), "patient", `${clinicId}-pat-${i}`]);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  assertSafeTarget(url);
  const profile = resolveProfile(process.argv[2]);
  const db = new Client({ connectionString: url });
  await db.connect();
  await db.query(`SET TIME ZONE 'America/Sao_Paulo'`);
  await resetClinics(db);
  for (let c = 1; c <= profile.clinics; c++) {
    const clinicId = clinicIdFor(c);
    const started = Date.now();
    await seedCatalog(db, clinicId, profile);
    await seedPatients(db, clinicId, profile);
    await seedAppointments(db, clinicId, profile);
    await seedFinanceAndAudit(db, clinicId, profile);
    await seedAccounts(db, clinicId);
    console.log(`${clinicId} semeada em ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
  await db.query("ANALYZE");
  await db.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
