import { beforeAll, describe, expect, it } from 'vitest';
import { CLINIC_B_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const clinicB = () =>
  cookieHeaderFor('company_admin', 'admin@b.com', CLINIC_B_ID);
const atendente = () => cookieHeaderFor('atendente', 'recepcao@clinica.com');

const PATIENT_EMAIL = 'agenda.prof@example.com';

// 2027-03-01 é segunda-feira; testes rodam com TZ=UTC.
describe('Feature: Agenda por profissional, almoço e feriados (rotas)', () => {
  let closuresRoute: typeof import('@/app/api/settings/schedule/closures/route');
  let closureByIdRoute: typeof import('@/app/api/settings/schedule/closures/[id]/route');
  let availabilityRoute: typeof import('@/app/api/professionals/[id]/availability/route');
  let scheduleRoute: typeof import('@/app/api/settings/schedule/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let slotsRoute: typeof import('@/app/api/portal/patient/slots/route');
  let patientId: string;
  let professionalId: string;
  let procedureId: string;

  const createAppointment = (
    startsAt: string,
    endsAt: string,
    extra: Record<string, unknown> = {},
  ) =>
    appointmentsRoute.POST(
      jsonRequest('/api/appointments', 'POST', {
        patientId,
        startsAt,
        endsAt,
        procedure: 'Curativo',
        priceCents: 10000,
        ...extra,
      }),
    );

  const createClosure = async (
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) =>
    closuresRoute.POST(
      jsonRequest('/api/settings/schedule/closures', 'POST', body, headers),
    );

  beforeAll(async () => {
    closuresRoute = await import('@/app/api/settings/schedule/closures/route');
    closureByIdRoute = await import(
      '@/app/api/settings/schedule/closures/[id]/route'
    );
    availabilityRoute = await import(
      '@/app/api/professionals/[id]/availability/route'
    );
    scheduleRoute = await import('@/app/api/settings/schedule/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    slotsRoute = await import('@/app/api/portal/patient/slots/route');
    const patientsRoute = await import('@/app/api/patients/route');
    const professionalsRoute = await import('@/app/api/professionals/route');
    const proceduresRoute = await import('@/app/api/procedures/route');
    await ensureTestClinics();

    const patient = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Paula Agenda',
        email: PATIENT_EMAIL,
        phone: '11900001111',
      }),
    );
    patientId = ((await patient.json()) as Envelope<{ id: string }>).data.id;
    const professional = await professionalsRoute.POST(
      jsonRequest('/api/professionals', 'POST', { fullName: 'Dra. Bia' }),
    );
    professionalId = ((await professional.json()) as Envelope<{ id: string }>)
      .data.id;
    const procedure = await proceduresRoute.POST(
      jsonRequest('/api/procedures', 'POST', {
        name: `Curativo agenda ${Date.now()}`,
        priceCents: 10000,
        durationMinutes: 60,
      }),
    );
    procedureId = ((await procedure.json()) as Envelope<{ id: string }>).data
      .id;
  });

  describe('Feriados e ausências', () => {
    it('Dado feriado da clínica, Quando a equipe tenta agendar no dia, Então 400 com o motivo', async () => {
      const created = await createClosure({
        startsOn: '2027-03-01',
        reason: 'Feriado municipal',
      });
      expect(created.status).toBe(200);

      const response = await createAppointment(
        '2027-03-01T09:00:00.000Z',
        '2027-03-01T10:00:00.000Z',
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Clínica fechada em 01/03/2027');
    });

    it('Dado feriado, Quando o paciente lista horários do dia no portal, Então lista vazia', async () => {
      const response = await slotsRoute.GET(
        jsonRequest(
          `/api/portal/patient/slots?procedureId=${procedureId}&date=2027-03-01`,
          'GET',
          undefined,
          cookieHeaderFor('patient', PATIENT_EMAIL),
        ),
      );
      const body = (await response.json()) as Envelope<unknown[]>;
      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('Dado consulta ativa no período, Quando bloquear a clínica, Então a resposta lista a consulta afetada', async () => {
      const appointment = await createAppointment(
        '2027-03-02T09:00:00.000Z',
        '2027-03-02T10:00:00.000Z',
      );
      const { id } = ((await appointment.json()) as Envelope<{ id: string }>)
        .data;

      const response = await createClosure({
        startsOn: '2027-03-02',
        endsOn: '2027-03-03',
        reason: 'Recesso',
      });
      const body = (await response.json()) as Envelope<{
        closure: { startsOn: string; endsOn: string; professionalId: null };
        affectedAppointments: { id: string }[];
      }>;

      expect(body.data.closure).toMatchObject({
        startsOn: '2027-03-02',
        endsOn: '2027-03-03',
        professionalId: null,
      });
      expect(body.data.affectedAppointments.map((a) => a.id)).toEqual([id]);
    });

    it('Dado ausência da Dra. Bia, Quando agendar com ela, Então 400; sem profissional, 200', async () => {
      await createClosure({
        professionalId,
        startsOn: '2027-03-04',
        reason: 'Congresso',
      });

      const withHer = await createAppointment(
        '2027-03-04T09:00:00.000Z',
        '2027-03-04T10:00:00.000Z',
        { professionalId },
      );
      const without = await createAppointment(
        '2027-03-04T09:00:00.000Z',
        '2027-03-04T10:00:00.000Z',
      );

      expect(withHer.status).toBe(400);
      expect(without.status).toBe(200);
    });

    it('Dado férias de vários dias começando antes, Quando agendar no meio do período, Então bloqueia', async () => {
      await createClosure({
        professionalId,
        startsOn: '2027-06-01',
        endsOn: '2027-06-10',
        reason: 'Férias',
      });
      const response = await createAppointment(
        '2027-06-07T09:00:00.000Z',
        '2027-06-07T10:00:00.000Z',
        { professionalId },
      );
      expect(response.status).toBe(400);
    });

    it('Dado bloqueios cadastrados, Quando listar o período, Então vêm ordenados; formato inválido dá 400', async () => {
      const response = await closuresRoute.GET(
        jsonRequest(
          '/api/settings/schedule/closures?from=2027-03-01&to=2027-03-31',
          'GET',
        ),
      );
      const body = (await response.json()) as Envelope<{ startsOn: string }[]>;
      expect(body.data.map((c) => c.startsOn)).toEqual([
        '2027-03-01',
        '2027-03-02',
        '2027-03-04',
      ]);

      const invalid = await closuresRoute.GET(
        jsonRequest(
          '/api/settings/schedule/closures?from=hoje&to=2027-03-31',
          'GET',
        ),
      );
      expect(invalid.status).toBe(400);
    });

    it('Dado datas invertidas ou profissional inexistente, Quando bloquear, Então 400/404', async () => {
      const inverted = await createClosure({
        startsOn: '2027-03-10',
        endsOn: '2027-03-09',
        reason: 'x',
      });
      const ghost = await createClosure({
        professionalId: 'nao-existe',
        startsOn: '2027-03-10',
        reason: 'Férias',
      });
      expect(inverted.status).toBe(400);
      expect(ghost.status).toBe(404);
    });

    it('Dado bloqueio da clínica A, Quando a clínica B lista ou remove, Então não vê e recebe 404', async () => {
      const created = await createClosure({
        startsOn: '2027-04-05',
        reason: 'Só da clínica A',
      });
      const { closure } = (
        (await created.json()) as Envelope<{ closure: { id: string } }>
      ).data;

      const listB = await closuresRoute.GET(
        jsonRequest(
          '/api/settings/schedule/closures?from=2027-04-01&to=2027-04-30',
          'GET',
          undefined,
          clinicB(),
        ),
      );
      expect(((await listB.json()) as Envelope<unknown[]>).data).toEqual([]);

      const deleteB = await closureByIdRoute.DELETE(
        jsonRequest(
          `/api/settings/schedule/closures/${closure.id}`,
          'DELETE',
          undefined,
          clinicB(),
        ),
        context(closure.id),
      );
      expect(deleteB.status).toBe(404);
    });

    it('Dado bloqueio, Quando remover, Então o dia volta a aceitar agendamento', async () => {
      const created = await createClosure({
        startsOn: '2027-04-06',
        reason: 'Engano',
      });
      const { closure } = (
        (await created.json()) as Envelope<{ closure: { id: string } }>
      ).data;

      const removed = await closureByIdRoute.DELETE(
        jsonRequest(`/api/settings/schedule/closures/${closure.id}`, 'DELETE'),
        context(closure.id),
      );
      expect(removed.status).toBe(200);

      const appointment = await createAppointment(
        '2027-04-06T09:00:00.000Z',
        '2027-04-06T10:00:00.000Z',
      );
      expect(appointment.status).toBe(200);
    });

    it('Dado atendente, Quando cadastrar feriado, Então pode (mesma família da grade)', async () => {
      const response = await createClosure(
        { startsOn: '2027-04-21', reason: 'Tiradentes' },
        atendente(),
      );
      expect(response.status).toBe(200);
    });
  });

  describe('Horário do profissional', () => {
    it('Dado horário salvo, Quando ler, Então devolve as janelas ordenadas', async () => {
      const saved = await availabilityRoute.PUT(
        jsonRequest(
          `/api/professionals/${professionalId}/availability`,
          'PUT',
          {
            windows: [
              { weekday: 3, startMinute: 780, endMinute: 1080 },
              { weekday: 2, startMinute: 480, endMinute: 720 },
            ],
          },
        ),
        context(professionalId),
      );
      expect(saved.status).toBe(200);

      const read = await availabilityRoute.GET(
        jsonRequest(`/api/professionals/${professionalId}/availability`, 'GET'),
        context(professionalId),
      );
      const body = (await read.json()) as Envelope<{
        windows: { weekday: number }[];
      }>;
      expect(body.data.windows.map((w) => w.weekday)).toEqual([2, 3]);
    });

    it('Dado horário só terça de manhã e quarta à tarde, Quando agendar com ela fora disso, Então 400; dentro, 200', async () => {
      const outside = await createAppointment(
        '2027-03-09T14:00:00.000Z',
        '2027-03-09T15:00:00.000Z',
        { professionalId },
      );
      const inside = await createAppointment(
        '2027-03-09T09:00:00.000Z',
        '2027-03-09T10:00:00.000Z',
        { professionalId },
      );
      expect(outside.status).toBe(400);
      expect(inside.status).toBe(200);
    });

    it('Dado consulta com ela, Quando remarcar para fora do horário dela, Então 400', async () => {
      const created = await createAppointment(
        '2027-03-16T09:00:00.000Z',
        '2027-03-16T10:00:00.000Z',
        { professionalId },
      );
      const { id } = ((await created.json()) as Envelope<{ id: string }>).data;

      const response = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${id}`, 'PATCH', {
          action: 'reschedule',
          startsAt: '2027-03-18T09:00:00.000Z',
          endsAt: '2027-03-18T10:00:00.000Z',
        }),
        context(id),
      );
      expect(response.status).toBe(400);
    });

    it('Dado lista vazia, Quando salvar, Então volta a seguir só a clínica', async () => {
      await availabilityRoute.PUT(
        jsonRequest(
          `/api/professionals/${professionalId}/availability`,
          'PUT',
          {
            windows: [],
          },
        ),
        context(professionalId),
      );
      const response = await createAppointment(
        '2027-03-22T14:00:00.000Z',
        '2027-03-22T15:00:00.000Z',
        { professionalId },
      );
      expect(response.status).toBe(200);
    });

    it('Dado janelas sobrepostas, Quando salvar, Então 400', async () => {
      const response = await availabilityRoute.PUT(
        jsonRequest(
          `/api/professionals/${professionalId}/availability`,
          'PUT',
          {
            windows: [
              { weekday: 1, startMinute: 480, endMinute: 720 },
              { weekday: 1, startMinute: 700, endMinute: 800 },
            ],
          },
        ),
        context(professionalId),
      );
      expect(response.status).toBe(400);
    });

    it('Dado profissional da clínica A, Quando a clínica B lê ou grava o horário, Então 404', async () => {
      const read = await availabilityRoute.GET(
        jsonRequest(
          `/api/professionals/${professionalId}/availability`,
          'GET',
          undefined,
          clinicB(),
        ),
        context(professionalId),
      );
      const write = await availabilityRoute.PUT(
        jsonRequest(
          `/api/professionals/${professionalId}/availability`,
          'PUT',
          { windows: [] },
          clinicB(),
        ),
        context(professionalId),
      );
      expect(read.status).toBe(404);
      expect(write.status).toBe(404);
    });

    it('Dado atendente, Quando gravar horário de profissional, Então 403 (cadastro de profissionais é do Admin)', async () => {
      const response = await availabilityRoute.PUT(
        jsonRequest(
          `/api/professionals/${professionalId}/availability`,
          'PUT',
          { windows: [] },
          atendente(),
        ),
        context(professionalId),
      );
      expect(response.status).toBe(403);
    });
  });

  describe('Pausa de almoço', () => {
    it('Dado pausa salva na grade, Quando ler, agendar ou listar horários, Então a pausa vale em todo lugar', async () => {
      const saved = await scheduleRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [1, 2, 3, 4, 5],
          startHour: 8,
          endHour: 18,
          minGapMinutes: 15,
          lunchBreak: { startMinute: 720, endMinute: 780 },
        }),
      );
      expect(saved.status).toBe(200);
      try {
        const read = await scheduleRoute.GET(
          jsonRequest('/api/settings/schedule', 'GET'),
        );
        expect(
          ((await read.json()) as Envelope<{ config: { lunchBreak: unknown } }>)
            .data.config.lunchBreak,
        ).toEqual({ startMinute: 720, endMinute: 780 });

        const atLunch = await createAppointment(
          '2027-05-03T12:00:00.000Z',
          '2027-05-03T12:30:00.000Z',
        );
        expect(atLunch.status).toBe(400);

        const slots = await slotsRoute.GET(
          jsonRequest(
            `/api/portal/patient/slots?procedureId=${procedureId}&date=2027-05-04`,
            'GET',
            undefined,
            cookieHeaderFor('patient', PATIENT_EMAIL),
          ),
        );
        const starts = (
          (await slots.json()) as Envelope<{ startsAt: string }[]>
        ).data.map((s) => s.startsAt);
        expect(starts).not.toContain('2027-05-04T12:00:00.000Z');
        expect(starts).toContain('2027-05-04T13:00:00.000Z');
      } finally {
        await scheduleRoute.PUT(
          jsonRequest('/api/settings/schedule', 'PUT', {
            weekdays: [1, 2, 3, 4, 5],
            startHour: 8,
            endHour: 18,
            minGapMinutes: 15,
            lunchBreak: null,
          }),
        );
      }
    });

    it('Dado pausa fora do horário de funcionamento, Quando salvar, Então 400', async () => {
      const response = await scheduleRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [1],
          startHour: 8,
          endHour: 18,
          minGapMinutes: 15,
          lunchBreak: { startMinute: 1080, endMinute: 1140 },
        }),
      );
      expect(response.status).toBe(400);
    });
  });
});
