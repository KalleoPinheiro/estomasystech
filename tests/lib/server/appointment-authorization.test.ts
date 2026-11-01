import { beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  assertProfessionalActsAsSelf,
  authorizeAppointmentAct,
} from '@/lib/server/appointment-authorization';
import {
  buildAppointment,
  buildPatient,
  buildProfessional,
} from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (
  role: Session['role'],
  clinicId: string,
  professionalId: string | null = null,
) =>
  ({
    role,
    subject: `${role}@clinica.com`,
    clinicId,
    professionalId,
  }) as unknown as Session;

let slotIndex = 0;

async function seed(linked: boolean) {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const professional = buildProfessional();
  await repos.professionals.save(professional);
  const patient = buildPatient();
  await repos.patients.save(patient);
  if (linked) {
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
  }
  slotIndex += 1;
  const start = new Date(Date.UTC(2026, 7, 1, 8) + slotIndex * 3_600_000);
  const appointment = buildAppointment({
    patientId: patient.id,
    slot: TimeSlot.create(start, new Date(start.getTime() + 1_800_000)),
  });
  await repos.appointments.save(appointment);
  return { professional, patient, appointment };
}

beforeAll(async () => {
  await ensureTestClinics();
});

describe('Feature: autorização do ato sobre a consulta (R4, #603, ADR-079)', () => {
  const scopeA = () => clinicScope(CLINIC_A_ID);

  it('Dada consulta inexistente, Quando um admin age, Então é 404 «Consulta» e não vaza o id', async () => {
    const err = await authorizeAppointmentAct(
      session('company_admin', CLINIC_A_ID),
      scopeA(),
      'nao-existe',
    ).catch((e) => e);

    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('Consulta não encontrado(a)');
    expect(err.entity).toBe('Consulta');
    expect(err.entityId).toBe('nao-existe');
  });

  it('Dada consulta de outra empresa, Quando o admin da empresa A age, Então é 404', async () => {
    const { appointment } = await seed(true);
    const err = await authorizeAppointmentAct(
      session('company_admin', CLINIC_B_ID),
      clinicScope(CLINIC_B_ID),
      appointment.id,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('Dado Profissional sem vínculo com o paciente, Quando age, Então é 403 (inclui remarcar)', async () => {
    const { professional, appointment } = await seed(false);
    const err = await authorizeAppointmentAct(
      session('profissional', CLINIC_A_ID, professional.id),
      scopeA(),
      appointment.id,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toBe(
      'Profissional só pode registrar para pacientes vinculados a ele',
    );
  });

  it('Dado Profissional sem professionalId na sessão, Quando age, Então é 403', async () => {
    const { appointment } = await seed(true);
    await expect(
      authorizeAppointmentAct(
        session('profissional', CLINIC_A_ID, null),
        scopeA(),
        appointment.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Dado Profissional vinculado ao paciente, Quando age, Então é autorizado', async () => {
    const { professional, appointment } = await seed(true);
    await expect(
      authorizeAppointmentAct(
        session('profissional', CLINIC_A_ID, professional.id),
        scopeA(),
        appointment.id,
      ),
    ).resolves.toBeUndefined();
  });

  it.each(['company_admin', 'atendente'] as const)(
    'Dado %s sem vínculo, Quando age numa consulta da empresa, Então é autorizado (R4 é só do Profissional)',
    async (role) => {
      const { appointment } = await seed(false);
      await expect(
        authorizeAppointmentAct(
          session(role, CLINIC_A_ID),
          scopeA(),
          appointment.id,
        ),
      ).resolves.toBeUndefined();
    },
  );
});

describe('Feature: Profissional só agenda no próprio nome (#603)', () => {
  const prof = session('profissional', CLINIC_A_ID, 'prof-1');

  it('Dado Profissional com o professionalId de outro, Quando agenda, Então é 403', () => {
    expect(() => assertProfessionalActsAsSelf(prof, 'prof-2')).toThrow(
      ForbiddenError,
    );
    expect(() => assertProfessionalActsAsSelf(prof, 'prof-2')).toThrow(
      'Profissional só pode agendar em seu próprio nome',
    );
  });

  it.each([
    ['o próprio id', 'prof-1'],
    ['id ausente (null)', null],
    ['id ausente (undefined)', undefined],
    ['id vazio', ''],
  ])('Dado Profissional com %s, Quando agenda, Então passa', (_n, id) => {
    expect(() => assertProfessionalActsAsSelf(prof, id)).not.toThrow();
  });

  it.each(['company_admin', 'atendente'] as const)(
    'Dado %s agendando no nome de qualquer profissional, Então passa',
    (role) => {
      expect(() =>
        assertProfessionalActsAsSelf(session(role, CLINIC_A_ID), 'prof-2'),
      ).not.toThrow();
    },
  );
});
