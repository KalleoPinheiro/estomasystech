import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  buildAppointment,
  buildPatient,
  buildProfessional,
} from '../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

const signIn = (
  role: 'profissional' | 'company_admin',
  professionalId?: string,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    CLINIC_A_ID,
    professionalId ?? null,
  );
};

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
});

describe('Feature: R4 nas ações de consulta não deixa rastro (#603, #605, Postgres real)', () => {
  it('Dado profissional sem vínculo, Quando confirma a consulta, Então ela segue agendada e nenhum evento de auditoria é gravado', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const stranger = buildProfessional();
    await repos.professionals.save(stranger);
    const patient = buildPatient();
    await repos.patients.save(patient);
    const appointment = buildAppointment({ patientId: patient.id });
    await repos.appointments.save(appointment);
    signIn('profissional', stranger.id);
    const before = (await repos.auditEvents.findAll()).length;
    const { confirmAppointment } = await import(
      '@/app/(staff)/agenda/agenda-actions'
    );

    const result = await confirmAppointment({ id: appointment.id });

    expect(result.success).toBe(false);
    expect((await repos.appointments.findById(appointment.id))?.status).toBe(
      appointment.status,
    );
    expect((await repos.auditEvents.findAll()).length).toBe(before);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado paciente inexistente, Quando agenda a série, Então responde não encontrado e a trilha não ganha evento', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    signIn('company_admin');
    const before = (await repos.auditEvents.findAll()).length;
    const { scheduleRecurring } = await import(
      '@/app/(staff)/agenda/agenda-actions'
    );

    const result = await scheduleRecurring({
      patientId: 'nao-existe',
      startsAt: '2035-01-03T13:00:00.000Z',
      endsAt: '2035-01-03T13:30:00.000Z',
      procedure: 'Curativo',
      priceCents: 9000,
      occurrences: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Paciente não encontrado(a)');
    expect((await repos.auditEvents.findAll()).length).toBe(before);
  });
});
