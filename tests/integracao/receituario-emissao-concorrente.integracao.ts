import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { getRepositories } from '@/infrastructure/container';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleCarePlanInterventionRepository } from '@/infrastructure/persistence/drizzle/drizzle-care-plan-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { issuePrescriptionFor } from '@/lib/server/prescription';
import { buildPatient } from '../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { validCnpj } from '../support/cnpj';
import { withDatabase } from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER ??= 'pglite';

/**
 * Emissão concorrente do receituário (#998, ADR-116, Postgres real). O conteúdo
 * congelado tem de ser lido depois da trava do plano: quem espera a trava não
 * pode gravar o plano como estava antes de outra transação mexer nele.
 *
 * Outra conexão, fora do pool do app, segura a mesma trava consultiva que a
 * emissão usa. Enquanto a emissão espera, essa conexão acrescenta uma
 * intervenção ao plano e confirma; a emissão só então segue e tem de congelar
 * o plano com a intervenção nova. Lido antes da trava, congelaria o antigo.
 */

const session = {
  expiresAtMs: Date.now() + 3_600_000,
  role: 'company_admin',
  subject: 'admin@clinica.com',
  clinicId: CLINIC_A_ID,
  professionalId: null,
} as Session;

beforeAll(async () => {
  await ensureTestClinics();
  const { clinics } = await getRepositories(clinicScope(CLINIC_A_ID));
  const clinic = await clinics.findById(CLINIC_A_ID);
  await clinics.update(
    (clinic as NonNullable<typeof clinic>).updateInfo({
      cnpj: validCnpj('998998990001'),
      address: 'Rua das Flores, 10',
      city: 'Campinas',
      professionalName: 'Resp. Técnica',
      professionalRegistry: 'COREN-SP 999999',
    }),
  );
});

async function seedPlan(): Promise<string> {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const patient = buildPatient({ fullName: 'Maria das Dores' });
  await repos.patients.save(patient);
  const plan = CarePlan.create({ patientId: patient.id });
  await repos.carePlans.save(plan);
  await repos.carePlanInterventions.save(
    CarePlanIntervention.create({
      carePlanId: plan.id,
      interventionCode: '990',
      frequency: 'diária',
      priority: 'media',
    }),
  );
  return plan.id;
}

/** Conexão avulsa no banco deste arquivo: não disputa o pool da emissão. */
async function outsideConnection(): Promise<Client> {
  const db = await getDb();
  const { rows } = (await db.execute(
    sql`select current_database() as name`,
  )) as unknown as { rows: { name: string }[] };
  const client = new Client({
    connectionString: withDatabase(
      inject('integrationDatabaseUrl'),
      rows[0]?.name ?? '',
    ),
  });
  await client.connect();
  return client;
}

async function waitForBlockedLock(client: Client): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await client.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_locks
       where locktype = 'advisory' and not granted`,
    );
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('a emissão não chegou a esperar a trava do plano');
}

describe('Feature: emissão concorrente do receituário (#998, Postgres real)', () => {
  it('Dada outra transação com a trava do plano que muda o plano, Quando a emissão espera e segue, Então congela o plano depois da mudança e emitir de novo devolve o mesmo número', async () => {
    const planId = await seedPlan();
    const client = await outsideConnection();
    try {
      await client.query('begin');
      const key = `${CLINIC_A_ID}|receituario|${planId}`;
      await client.query(
        'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        [key],
      );

      const pending = issuePrescriptionFor(session, planId, null);
      await waitForBlockedLock(client);

      const outside = drizzle(client, { schema }) as unknown as AppDb;
      await new DrizzleCarePlanInterventionRepository(
        outside,
        CLINIC_A_ID,
      ).save(
        CarePlanIntervention.create({
          carePlanId: planId,
          interventionCode: '991',
          frequency: 'a cada troca de curativo',
          priority: 'media',
        }),
      );
      await client.query('commit');

      const issued = await pending;
      const { nursingPrescriptions } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      const [frozen, ...others] =
        await nursingPrescriptions.findByCarePlanId(planId);
      expect(others).toHaveLength(0);
      expect(frozen?.id).toBe(issued.id);
      expect(frozen?.content?.items).toHaveLength(2);
      expect(frozen?.content?.items).toEqual(
        expect.arrayContaining([
          { label: '990', frequency: 'diária' },
          { label: '991', frequency: 'a cada troca de curativo' },
        ]),
      );

      const again = await issuePrescriptionFor(session, planId, null);
      expect(again.documentNumber).toBe(issued.documentNumber);
    } finally {
      await client.end();
    }
  });
});
