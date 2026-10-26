import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  buildPatient,
  buildProcedure,
  buildProfessional,
} from '../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
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

/** Segunda-feira distante, 10:00 em São Paulo, dentro da grade padrão. */
let week = 0;
const slot = (hourUtc = 13) => {
  const start = new Date(Date.UTC(2032, 0, 5 + 28 * week, hourUtc, 0));
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
  };
};

const seed = async () => {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const patient = buildPatient();
  await repos.patients.save(patient);
  return { repos, patient };
};

const booking = (patientId: string, hourUtc = 13) => ({
  patientId,
  ...slot(hourUtc),
  procedure: 'Curativo',
  priceCents: 9000,
});

beforeEach(async () => {
  week += 1;
  await ensureTestClinics();
  refreshed.mockClear();
  calendar.mockReset();
  dispense.mockReset().mockResolvedValue({ warnings: [] });
  signIn('atendente');
});

describe('Feature: Server Actions da agenda (#551)', () => {
  describe('Cenário: quem pode gravar', () => {
    it('Dada a sessão sem login, Quando agendar, Então recusa sem gravar', async () => {
      cookieStore.value = undefined;
      const { patient } = await seed();
      const { scheduleAppointment } = await actions();

      const result = await scheduleAppointment(booking(patient.id));

      expect(result.success).toBe(false);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado um papel do portal, Quando agendar, Então recusa', async () => {
      signIn('patient');
      const { patient } = await seed();
      const { scheduleAppointment } = await actions();

      expect((await scheduleAppointment(booking(patient.id))).success).toBe(
        false,
      );
    });

    it('Dada entrada inválida, Quando agendar, Então responde o erro de validação', async () => {
      const { scheduleAppointment } = await actions();

      const result = await scheduleAppointment({
        patientId: '',
      } as unknown as Parameters<typeof scheduleAppointment>[0]);

      expect(result.success).toBe(false);
    });
  });

  describe('Cenário: agendar', () => {
    it('Dada a atendente, Quando agenda com profissional, Então grava, concede o vínculo e agenda o Google Agenda depois do commit', async () => {
      const { repos, patient } = await seed();
      const professional = buildProfessional();
      await repos.professionals.save(professional);
      const { scheduleAppointment } = await actions();

      const result = await scheduleAppointment({
        ...booking(patient.id),
        professionalId: professional.id,
      });

      expect(result.success).toBe(true);
      expect(
        await repos.professionalPatientLinks.hasLink(
          professional.id,
          patient.id,
        ),
      ).toBe(true);
      expect(calendar).toHaveBeenCalledTimes(1);
    });

    it('Dado o Google Agenda fora do ar, Quando agenda, Então a consulta continua gravada', async () => {
      calendar.mockImplementation(() => {
        throw new Error('Google fora do ar');
      });
      const { repos, patient } = await seed();
      const { scheduleAppointment } = await actions();

      const result = await scheduleAppointment(booking(patient.id));

      expect(result.success).toBe(true);
      expect(
        await repos.appointments.findById(result.data?.id as string),
      ).not.toBeNull();
    });

    it('Dado um horário ocupado, Quando agenda por cima, Então a mensagem de conflito é a de sempre', async () => {
      const { patient } = await seed();
      const { scheduleAppointment } = await actions();
      await scheduleAppointment(booking(patient.id));

      const again = await scheduleAppointment(booking(patient.id));

      expect(again.error).toBe(
        'Horário indisponível: é necessário intervalo mínimo de 15 minutos entre consultas',
      );
    });
  });

  describe('Cenário: série semanal', () => {
    it('Dada uma série de 3 sessões com profissional, Quando agenda, Então cria as 3, vincula o profissional e sincroniza cada uma', async () => {
      const { repos, patient } = await seed();
      const professional = buildProfessional();
      await repos.professionals.save(professional);
      const { scheduleRecurring } = await actions();

      const result = await scheduleRecurring({
        ...booking(patient.id),
        professionalId: professional.id,
        occurrences: 3,
      });

      expect(result.data?.created).toHaveLength(3);
      expect(calendar).toHaveBeenCalledTimes(3);
      expect(
        await repos.professionalPatientLinks.hasLink(
          professional.id,
          patient.id,
        ),
      ).toBe(true);
    });
  });

  describe('Cenário: mudar a consulta', () => {
    it('Dada uma consulta, Quando remarca, Então a nova hora vale e o Google Agenda acompanha', async () => {
      const { repos, patient } = await seed();
      const actionsModule = await actions();
      const created = await actionsModule.scheduleAppointment(
        booking(patient.id),
      );
      calendar.mockClear();

      const moved = slot(15);
      const result = await actionsModule.rescheduleAppointment({
        id: created.data?.id as string,
        ...moved,
      });

      expect(result.error).toBeNull();
      expect(
        (
          await repos.appointments.findById(created.data?.id as string)
        )?.slot.start.toISOString(),
      ).toBe(moved.startsAt);
      expect(calendar).toHaveBeenCalledTimes(1);
    });

    it('Dada uma consulta, Quando confirma, Então fica confirmada', async () => {
      const { repos, patient } = await seed();
      const actionsModule = await actions();
      const created = await actionsModule.scheduleAppointment(
        booking(patient.id),
      );

      await actionsModule.confirmAppointment({
        id: created.data?.id as string,
      });

      expect(
        (await repos.appointments.findById(created.data?.id as string))?.status,
      ).toBe('confirmed');
    });

    it('Dada uma consulta com procedimento, Quando conclui, Então baixa o kit depois do commit e devolve os avisos', async () => {
      dispense.mockResolvedValue({ warnings: ['Luva sem estoque'] });
      const { repos, patient } = await seed();
      const actionsModule = await actions();
      const procedure = buildProcedure();
      await repos.procedures.save(procedure);
      const created = await actionsModule.scheduleAppointment({
        ...booking(patient.id),
        procedureId: procedure.id,
      });
      const id = created.data?.id as string;

      const result = await actionsModule.completeAppointment({ id });

      expect(result.success).toBe(true);
      expect(result.data?.kitWarnings).toEqual(['Luva sem estoque']);
      expect((await repos.appointments.findById(id))?.status).toBe('completed');
    });

    it('Dada uma consulta sem procedimento, Quando conclui, Então não baixa kit nenhum', async () => {
      const { patient } = await seed();
      const actionsModule = await actions();
      const created = await actionsModule.scheduleAppointment(
        booking(patient.id),
      );

      const result = await actionsModule.completeAppointment({
        id: created.data?.id as string,
      });

      expect(result.data?.kitWarnings).toEqual([]);
      expect(dispense).not.toHaveBeenCalled();
    });

    it('Dada uma consulta inexistente, Quando conclui, Então responde erro e não atualiza a tela', async () => {
      const { completeAppointment } = await actions();

      const result = await completeAppointment({ id: 'nao-existe' });

      expect(result.success).toBe(false);
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: cancelar e faltar', () => {
    it('Dada uma consulta e alguém na fila para o dia, Quando a clínica cancela, Então conta quem aceita o horário', async () => {
      const { repos, patient } = await seed();
      const actionsModule = await actions();
      const created = await actionsModule.scheduleAppointment(
        booking(patient.id),
      );
      const day = String(created.data?.startsAt).slice(0, 10);
      const waiting = buildPatient();
      await repos.patients.save(waiting);
      await repos.waitlist.save(
        WaitlistEntry.create({
          patientId: waiting.id,
          fromDate: day,
          toDate: day,
          source: 'staff',
        }),
      );

      const result = await actionsModule.cancelAppointment({
        id: created.data?.id as string,
        requestedBy: 'clinic',
      });

      expect(result.success).toBe(true);
      expect(result.data?.waitlistMatches).toBe(1);
    });

    it('Dada uma consulta com evento no Google, Quando a clínica registra falta, Então remove o evento depois do commit', async () => {
      const { repos, patient } = await seed();
      const actionsModule = await actions();
      const created = await actionsModule.scheduleAppointment(
        booking(patient.id),
      );
      const id = created.data?.id as string;
      const appointment = await repos.appointments.findById(id);
      await repos.appointments.save(
        (appointment as NonNullable<typeof appointment>).withGoogleEventId(
          'evt-1',
        ),
      );
      calendar.mockClear();

      const result = await actionsModule.markAppointmentNoShow({ id });

      expect(result.success).toBe(true);
      expect(result.data?.waitlistMatches).toBe(0);
      expect(calendar).toHaveBeenCalledTimes(1);
    });
  });
});
