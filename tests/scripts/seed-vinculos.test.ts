process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { MAIN_CLINIC_ID, seedHomologation } from '../../scripts/seed/seed';

const NOW = new Date('2026-10-22T15:00:00Z');
const PASSWORD = 'senha-ficticia-123';

/** Cada profissional da agenda semeada e os pacientes que ele atende. */
async function agendaPairs(): Promise<Map<string, Set<string>>> {
  const main = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  const patients = await main.patients.findAll();
  const pairs = new Map<string, Set<string>>();
  for (const appointment of await main.appointments.findByPatientIds(
    patients.map((patient) => patient.id),
  )) {
    if (appointment.professionalId) {
      const set = pairs.get(appointment.professionalId) ?? new Set<string>();
      pairs.set(appointment.professionalId, set.add(appointment.patientId));
    }
  }
  return pairs;
}

async function expectEveryAgendaPatientLinked(): Promise<void> {
  const main = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  const pairs = await agendaPairs();
  expect(pairs.size).toBeGreaterThan(0);
  for (const [professionalId, patientIds] of pairs) {
    const linked =
      await main.professionalPatientLinks.findLinkedPatientIds(professionalId);
    expect([...patientIds].every((id) => linked.includes(id))).toBe(true);
  }
}

describe('Feature: Profissional abre o prontuário de quem está na própria agenda semeada (#465)', () => {
  it('Dado banco vazio, Quando semear, Então todo paciente da agenda de cada profissional está vinculado a ele', async () => {
    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.counts.professionalLinks).toBeGreaterThan(0);
    await expectEveryAgendaPatientLinked();
  });

  it('Dado banco semeado antes da correção (consultas sem vínculo), Quando semear de novo, Então completa os vínculos sem recriar a agenda', async () => {
    const db = await getDb();
    const appointmentsBefore = (await db.select().from(schema.appointments))
      .length;
    await db
      .delete(schema.professionalPatientLinks)
      .where(eq(schema.professionalPatientLinks.clinicId, MAIN_CLINIC_ID));

    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.skipped).toBe(false);
    expect(report.counts.professionalLinks).toBeGreaterThan(0);
    expect((await db.select().from(schema.appointments)).length).toBe(
      appointmentsBefore,
    );
    await expectEveryAgendaPatientLinked();
  });

  it('Dado vínculos completos, Quando semear de novo, Então nada é criado', async () => {
    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.skipped).toBe(true);
    expect(report.counts.professionalLinks).toBeUndefined();
  });
});
