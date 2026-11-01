import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  buildAppointment,
  buildPatient,
  buildProfessional,
} from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();
const calendar = vi.fn();
const dispense = vi.fn();

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
vi.mock('@/lib/calendar-sync', () => ({
  scheduleCalendarSync: (...args: unknown[]) => calendar(...args),
}));
vi.mock('@/application/inventory/dispense-procedure-kit', () => ({
  DispenseProcedureKit: class {
    execute = (input: unknown) => dispense(input);
  },
}));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  professionalId: string | null = null,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    CLINIC_A_ID,
    professionalId,
  );
};

const actions = () => import('@/app/(staff)/agenda/agenda-actions');

let week = 0;
const slot = (hourUtc = 13) => {
  const start = new Date(Date.UTC(2034, 0, 2 + 28 * week, hourUtc, 0));
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
  };
};

let linkedId: string;
let strangerId: string;

const seed = async (clinicId: string = CLINIC_A_ID) => {
  week += 1;
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient();
  await repos.patients.save(patient);
  const { startsAt, endsAt } = slot();
  const appointment = buildAppointment({
    patientId: patient.id,
    slot: TimeSlot.create(new Date(startsAt), new Date(endsAt)),
  });
  await repos.appointments.save(appointment);
  if (clinicId === CLINIC_A_ID) {
    await repos.professionalPatientLinks.ensureLink(linkedId, patient.id);
  }
  return { repos, patient, appointment };
};

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
  calendar.mockReset();
  dispense.mockReset().mockResolvedValue({ warnings: [] });
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const linked = buildProfessional();
  const stranger = buildProfessional();
  await repos.professionals.save(linked);
  await repos.professionals.save(stranger);
  linkedId = linked.id;
  strangerId = stranger.id;
});

type Actions = Awaited<ReturnType<typeof actions>>;
const ACT_ON_APPOINTMENT: Array<
  [
    string,
    (
      a: Actions,
      id: string,
    ) => Promise<{ success: boolean; error: string | null }>,
  ]
> = [
  ['confirmar', (a, id) => a.confirmAppointment({ id })],
  ['concluir', (a, id) => a.completeAppointment({ id })],
  ['cancelar', (a, id) => a.cancelAppointment({ id, requestedBy: 'clinic' })],
  ['marcar falta', (a, id) => a.markAppointmentNoShow({ id })],
  ['remarcar', (a, id) => a.rescheduleAppointment({ id, ...slot(15) })],
];

describe('Feature: R4 nas Server Actions da agenda (#603, #605, ADR-079)', () => {
  describe.each(ACT_ON_APPOINTMENT)('Cenário: %s', (_name, act) => {
    it('Dado profissional sem vínculo, Quando age sobre a consulta, Então recusa, nada muda e a tela não atualiza', async () => {
      signIn('profissional', strangerId);
      const { repos, appointment } = await seed();

      const result = await act(await actions(), appointment.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Profissional só pode registrar para pacientes vinculados a ele',
      );
      const after = await repos.appointments.findById(appointment.id);
      expect(after?.status).toBe(appointment.status);
      expect(
        (await repos.auditEvents.findAll()).filter(
          (e) => e.resourceId === appointment.id,
        ),
      ).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado consulta de outra empresa, Quando o profissional age sobre ela, Então responde não encontrada', async () => {
      signIn('profissional', linkedId);
      const { appointment } = await seed(CLINIC_B_ID);

      const result = await act(await actions(), appointment.id);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/não encontrad/i);
    });

    it('Dado profissional vinculado, Quando age sobre a consulta, Então a ação é gravada', async () => {
      signIn('profissional', linkedId);
      const { appointment } = await seed();

      const result = await act(await actions(), appointment.id);

      expect(result.success).toBe(true);
    });

    it('Dado atendente, Quando age sobre consulta de qualquer paciente, Então mantém o acesso', async () => {
      signIn('atendente');
      const { appointment } = await seed();

      expect((await act(await actions(), appointment.id)).success).toBe(true);
    });
  });

  describe('Cenário: agendar só no próprio nome', () => {
    const booking = (patientId: string, professionalId: string | null) => ({
      patientId,
      ...slot(17),
      procedure: 'Curativo',
      priceCents: 9000,
      professionalId,
    });

    it('Dado profissional, Quando agenda com o professionalId de outro, Então recusa e não concede vínculo', async () => {
      signIn('profissional', linkedId);
      const { repos, patient } = await seed();
      const { scheduleAppointment, scheduleRecurring } = await actions();

      const single = await scheduleAppointment(booking(patient.id, strangerId));
      const series = await scheduleRecurring({
        ...booking(patient.id, strangerId),
        occurrences: 2,
      });

      for (const result of [single, series]) {
        expect(result.success).toBe(false);
        expect(result.error).toBe(
          'Profissional só pode agendar em seu próprio nome',
        );
      }
      expect(
        await repos.professionalPatientLinks.hasLink(strangerId, patient.id),
      ).toBe(false);
    });

    it('Dado profissional, Quando agenda em seu nome para paciente novo, Então é aceito e ganha o vínculo', async () => {
      signIn('profissional', linkedId);
      const { repos } = await seed();
      const fresh = buildPatient();
      await repos.patients.save(fresh);
      const { scheduleAppointment } = await actions();

      const result = await scheduleAppointment(booking(fresh.id, linkedId));

      expect(result.success).toBe(true);
      expect(
        await repos.professionalPatientLinks.hasLink(linkedId, fresh.id),
      ).toBe(true);
    });
  });

  describe('Cenário: série com paciente alheio (#605)', () => {
    it.each([
      ['inexistente', async () => 'nao-existe'],
      ['de outra empresa', async () => (await seed(CLINIC_B_ID)).patient.id],
    ])(
      'Dado paciente %s, Quando agenda a série, Então responde não encontrado e não audita',
      async (_n, patientId) => {
        signIn('company_admin');
        const id = await patientId();
        const { scheduleRecurring } = await actions();

        const result = await scheduleRecurring({
          patientId: id,
          ...slot(),
          procedure: 'Curativo',
          priceCents: 9000,
          occurrences: 2,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Paciente não encontrado(a)');
        const repos = await getRepositories(clinicScope(CLINIC_A_ID));
        expect(
          (await repos.auditEvents.findAll()).filter(
            (e) => e.resourceId === id,
          ),
        ).toHaveLength(0);
      },
    );
  });
});
