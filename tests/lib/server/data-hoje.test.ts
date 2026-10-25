import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { listAppointmentsFor } from '@/lib/server/data/appointments';
import { buildLinkedTriageQueue } from '@/lib/server/data/triage';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (overrides: Partial<Session>): Session =>
  ({
    role: 'company_admin',
    email: 'x@clinica.com',
    clinicId: CLINIC_A_ID,
    professionalId: null,
    ...overrides,
  }) as Session;

const range = {
  from: new Date('2026-10-01T00:00:00Z'),
  to: new Date('2026-10-31T00:00:00Z'),
};

describe('Feature: leituras da tela Hoje no servidor (#548)', () => {
  it('Dado um profissional sem conta vinculada, Quando lê a agenda, Então não vê nenhuma consulta', async () => {
    await ensureTestClinics();

    const result = await listAppointmentsFor(
      session({ role: 'profissional', professionalId: null }),
      range,
    );

    expect(result).toEqual([]);
  });

  it('Dado um profissional sem vínculo com pacientes, Quando lê a triagem, Então a fila vem vazia', async () => {
    await ensureTestClinics();

    const result = await buildLinkedTriageQueue(
      session({ role: 'profissional', professionalId: 'prof-sem-vinculo' }),
    );

    expect(result).toEqual([]);
  });
});
