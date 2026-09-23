import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface PortalAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  cancelledBy: string | null;
}

interface StaffAppointment extends PortalAppointment {
  cancelledAt: string | null;
  cancelReason: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

const request = (
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const PATIENT_EMAIL = 'remarca.paciente@example.com';
const OTHER_EMAIL = 'remarca.outro@example.com';
const PARTNER_EMAIL = 'remarca.parceiro@example.com';
const patientCookie = () => cookieHeaderFor('patient', PATIENT_EMAIL);
const otherCookie = () => cookieHeaderFor('patient', OTHER_EMAIL);
const staffCookie = () => cookieHeaderFor('company_admin');

// 2027-02-01 é segunda-feira; testes rodam com TZ=UTC e grade padrão 8h–18h.
describe('Feature: Paciente cancela e remarca a própria consulta pelo portal', () => {
  let cancelRoute: typeof import('@/app/api/portal/patient/appointments/[id]/cancel/route');
  let rescheduleRoute: typeof import('@/app/api/portal/patient/appointments/[id]/reschedule/route');
  let slotsRoute: typeof import('@/app/api/portal/patient/slots/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let patientId: string;

  const createAppointment = async (startsAt: string, endsAt: string) => {
    const response = await appointmentsRoute.POST(
      request(
        '/api/appointments',
        'POST',
        {
          patientId,
          startsAt,
          endsAt,
          procedure: 'Curativo',
          priceCents: 10000,
        },
        staffCookie(),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    expect(response.status).toBe(200);
    return body.data.id;
  };

  const staffGet = async (id: string) => {
    const response = await appointmentByIdRoute.GET(
      request(`/api/appointments/${id}`, 'GET', undefined, staffCookie()),
      context(id),
    );
    return ((await response.json()) as Envelope<StaffAppointment>).data;
  };

  const cancel = (
    id: string,
    headers: Record<string, string>,
    body?: unknown,
  ) =>
    cancelRoute.POST(
      request(
        `/api/portal/patient/appointments/${id}/cancel`,
        'POST',
        body,
        headers,
      ),
      context(id),
    );

  const reschedule = (
    id: string,
    headers: Record<string, string>,
    body: unknown,
  ) =>
    rescheduleRoute.POST(
      request(
        `/api/portal/patient/appointments/${id}/reschedule`,
        'POST',
        body,
        headers,
      ),
      context(id),
    );

  beforeAll(async () => {
    cancelRoute = await import(
      '@/app/api/portal/patient/appointments/[id]/cancel/route'
    );
    rescheduleRoute = await import(
      '@/app/api/portal/patient/appointments/[id]/reschedule/route'
    );
    slotsRoute = await import('@/app/api/portal/patient/slots/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    const patientsRoute = await import('@/app/api/patients/route');
    const partnersRoute = await import('@/app/api/partners/route');

    const created = await patientsRoute.POST(
      request(
        '/api/patients',
        'POST',
        {
          fullName: 'Rita Remarca',
          email: PATIENT_EMAIL,
          phone: '11911112222',
        },
        staffCookie(),
      ),
    );
    patientId = ((await created.json()) as Envelope<{ id: string }>).data.id;
    await patientsRoute.POST(
      request(
        '/api/patients',
        'POST',
        { fullName: 'Otto Outro', email: OTHER_EMAIL, phone: '11933334444' },
        staffCookie(),
      ),
    );
    await partnersRoute.POST(
      request(
        '/api/partners',
        'POST',
        {
          fullName: 'Dra. Parceira',
          email: PARTNER_EMAIL,
          phone: '11955556666',
        },
        staffCookie(),
      ),
    );
  });

  describe('POST /api/portal/patient/appointments/:id/cancel', () => {
    it('Dado sem sessão, Quando cancelar, Então 401', async () => {
      const id = await createAppointment(
        '2027-02-01T09:00:00.000Z',
        '2027-02-01T10:00:00.000Z',
      );
      expect((await cancel(id, {})).status).toBe(401);
    });

    it('Dado sessão de parceiro, Quando cancelar, Então 403', async () => {
      const id = await createAppointment(
        '2027-02-01T11:00:00.000Z',
        '2027-02-01T12:00:00.000Z',
      );
      const response = await cancel(
        id,
        cookieHeaderFor('partner', PARTNER_EMAIL),
      );
      expect(response.status).toBe(403);
    });

    it('Dado consulta de outro paciente, Quando cancelar, Então 404 e a consulta segue ativa', async () => {
      const id = await createAppointment(
        '2027-02-01T13:00:00.000Z',
        '2027-02-01T14:00:00.000Z',
      );
      expect((await cancel(id, otherCookie())).status).toBe(404);
      expect((await staffGet(id)).status).toBe('scheduled');
    });

    it('Dado consulta própria com antecedência, Quando cancelar com motivo, Então fica cancelada pelo paciente e a equipe vê quem, quando e por quê', async () => {
      const id = await createAppointment(
        '2027-02-02T09:00:00.000Z',
        '2027-02-02T10:00:00.000Z',
      );

      const response = await cancel(id, patientCookie(), {
        reason: '  Viagem a trabalho  ',
      });
      const body = (await response.json()) as Envelope<PortalAppointment>;

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'patient',
      });
      const stored = await staffGet(id);
      expect(stored).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'patient',
        cancelReason: 'Viagem a trabalho',
      });
      expect(stored.cancelledAt).not.toBeNull();
    });

    it('Dado cancelamento pelo portal, Quando cancelar, Então registra auditoria com o paciente como ator', async () => {
      const id = await createAppointment(
        '2027-02-02T11:00:00.000Z',
        '2027-02-02T12:00:00.000Z',
      );
      await cancel(id, patientCookie());

      // A auditoria é gravada fora da resposta: espera ela aparecer.
      const auditRoute = await import('@/app/api/audit/route');
      const findEvent = async () => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const response = await auditRoute.GET(
            request(
              `/api/audit?patientId=${patientId}`,
              'GET',
              undefined,
              staffCookie(),
            ),
          );
          const body = (await response.json()) as Envelope<
            {
              resourceId: string;
              actorId: string;
              actorRole: string;
              action: string;
              detail: string | null;
            }[]
          >;
          const match = body.data.find((item) => item.resourceId === id);
          if (match) return match;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return undefined;
      };

      expect(await findEvent()).toMatchObject({
        actorId: PATIENT_EMAIL,
        actorRole: 'patient',
        action: 'update',
        detail: 'cancelada pelo paciente no portal',
      });
    });

    it('Dado consulta já cancelada pelo paciente, Quando cancelar de novo, Então 200 sem erro (idempotente)', async () => {
      const id = await createAppointment(
        '2027-02-02T13:00:00.000Z',
        '2027-02-02T14:00:00.000Z',
      );
      await cancel(id, patientCookie(), { reason: 'Primeiro motivo' });

      const again = await cancel(id, patientCookie(), { reason: 'Outro' });

      expect(again.status).toBe(200);
      expect((await staffGet(id)).cancelReason).toBe('Primeiro motivo');
    });

    it('Dado consulta cancelada pela clínica, Quando o paciente cancelar, Então 400 e o registro continua sendo da clínica', async () => {
      const id = await createAppointment(
        '2027-02-02T15:00:00.000Z',
        '2027-02-02T16:00:00.000Z',
      );
      await appointmentByIdRoute.PATCH(
        request(
          `/api/appointments/${id}`,
          'PATCH',
          { action: 'cancel' },
          staffCookie(),
        ),
        context(id),
      );

      const response = await cancel(id, patientCookie());

      expect(response.status).toBe(400);
      expect(await staffGet(id)).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'clinic',
      });
    });

    it('Dado motivo com mais de 1000 caracteres, Quando cancelar, Então 400', async () => {
      const id = await createAppointment(
        '2027-02-03T09:00:00.000Z',
        '2027-02-03T10:00:00.000Z',
      );
      const response = await cancel(id, patientCookie(), {
        reason: 'x'.repeat(1001),
      });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/portal/patient/appointments/:id/reschedule', () => {
    it('Dado sem sessão, Quando remarcar, Então 401', async () => {
      const id = await createAppointment(
        '2027-02-04T09:00:00.000Z',
        '2027-02-04T10:00:00.000Z',
      );
      const response = await reschedule(
        id,
        {},
        {
          startsAt: '2027-02-04T15:00:00.000Z',
        },
      );
      expect(response.status).toBe(401);
    });

    it('Dado consulta de outro paciente, Quando remarcar, Então 404 e o horário não muda', async () => {
      const id = await createAppointment(
        '2027-02-04T11:00:00.000Z',
        '2027-02-04T12:00:00.000Z',
      );
      const response = await reschedule(id, otherCookie(), {
        startsAt: '2027-02-05T15:00:00.000Z',
      });
      expect(response.status).toBe(404);
      expect((await staffGet(id)).startsAt).toBe('2027-02-04T11:00:00.000Z');
    });

    it('Dado horário livre, Quando remarcar, Então muda o horário mantendo a duração e volta a aguardar confirmação', async () => {
      const id = await createAppointment(
        '2027-02-08T09:00:00.000Z',
        '2027-02-08T09:45:00.000Z',
      );

      const response = await reschedule(id, patientCookie(), {
        startsAt: '2027-02-09T14:00:00.000Z',
      });
      const body = (await response.json()) as Envelope<PortalAppointment>;

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({
        startsAt: '2027-02-09T14:00:00.000Z',
        endsAt: '2027-02-09T14:45:00.000Z',
        status: 'scheduled',
      });
    });

    it('Dado horário ocupado, Quando remarcar, Então 409 e a consulta fica onde estava', async () => {
      await createAppointment(
        '2027-02-10T14:00:00.000Z',
        '2027-02-10T15:00:00.000Z',
      );
      const id = await createAppointment(
        '2027-02-10T09:00:00.000Z',
        '2027-02-10T10:00:00.000Z',
      );

      const response = await reschedule(id, patientCookie(), {
        startsAt: '2027-02-10T14:00:00.000Z',
      });

      expect(response.status).toBe(409);
      expect((await staffGet(id)).startsAt).toBe('2027-02-10T09:00:00.000Z');
    });

    it('Dado horário fora da grade (sábado), Quando remarcar, Então 400', async () => {
      const id = await createAppointment(
        '2027-02-11T09:00:00.000Z',
        '2027-02-11T10:00:00.000Z',
      );
      const response = await reschedule(id, patientCookie(), {
        startsAt: '2027-02-13T10:00:00.000Z',
      });
      expect(response.status).toBe(400);
    });

    it('Dado corpo sem startsAt válido, Quando remarcar, Então 400', async () => {
      const id = await createAppointment(
        '2027-02-11T11:00:00.000Z',
        '2027-02-11T12:00:00.000Z',
      );
      const response = await reschedule(id, patientCookie(), {
        startsAt: 'amanhã',
      });
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/portal/patient/slots?appointmentId=…', () => {
    const slots = (query: string, headers: Record<string, string>) =>
      slotsRoute.GET(
        request(
          `/api/portal/patient/slots?${query}`,
          'GET',
          undefined,
          headers,
        ),
      );

    it('Dado remarcação, Quando listar o dia da própria consulta, Então o horário dela aparece livre e com a duração dela', async () => {
      const id = await createAppointment(
        '2027-02-15T10:00:00.000Z',
        '2027-02-15T10:30:00.000Z',
      );

      const response = await slots(
        `appointmentId=${id}&date=2027-02-15`,
        patientCookie(),
      );
      const body = (await response.json()) as Envelope<
        { startsAt: string; endsAt: string }[]
      >;

      expect(response.status).toBe(200);
      expect(body.data).toContainEqual({
        startsAt: '2027-02-15T10:00:00.000Z',
        endsAt: '2027-02-15T10:30:00.000Z',
      });
    });

    it('Dado consulta de outro paciente, Quando listar horários para remarcar, Então 404', async () => {
      const id = await createAppointment(
        '2027-02-16T10:00:00.000Z',
        '2027-02-16T11:00:00.000Z',
      );
      const response = await slots(
        `appointmentId=${id}&date=2027-02-16`,
        otherCookie(),
      );
      expect(response.status).toBe(404);
    });

    it('Dado procedureId e appointmentId juntos, Quando listar, Então 400', async () => {
      const response = await slots(
        'appointmentId=a&procedureId=b&date=2027-02-16',
        patientCookie(),
      );
      expect(response.status).toBe(400);
    });
  });

  it('Dado cancelamento pela equipe, Quando consultar, Então fica registrado como da clínica', async () => {
    const id = await createAppointment(
      '2027-02-17T09:00:00.000Z',
      '2027-02-17T10:00:00.000Z',
    );
    const response = await appointmentByIdRoute.PATCH(
      request(
        `/api/appointments/${id}`,
        'PATCH',
        { action: 'cancel' },
        staffCookie(),
      ),
      context(id),
    );
    const body = (await response.json()) as Envelope<StaffAppointment>;

    expect(body.data).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'clinic',
      cancelReason: null,
    });
    expect(body.data.cancelledAt).not.toBeNull();
  });
});
