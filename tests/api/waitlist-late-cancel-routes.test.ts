import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLINIC_B_ID, ensureTestClinics } from '../support/clinics';
import { linkAllPortalAccounts } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const PATIENT_EMAIL = 'espera.paciente@example.com';
const OTHER_EMAIL = 'espera.outro@example.com';
const patientCookie = () => cookieHeaderFor('patient', PATIENT_EMAIL);
const otherCookie = () => cookieHeaderFor('patient', OTHER_EMAIL);
const clinicB = () =>
  cookieHeaderFor('company_admin', 'admin@b.com', CLINIC_B_ID);

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Próximo dia útil a partir de amanhã (datas relativas ao relógio real). */
function nextBusinessDay(offset = 1): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + offset);
  while (day.getDay() === 0 || day.getDay() === 6) {
    day.setDate(day.getDate() + 1);
  }
  return day;
}

const at = (day: Date, hour: number) => {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('Feature: Lista de espera e cancelamento tardio (rotas)', () => {
  let scheduleRoute: typeof import('@/app/api/settings/schedule/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let waitlistRoute: typeof import('@/app/api/waitlist/route');
  let waitlistByIdRoute: typeof import('@/app/api/waitlist/[id]/route');
  let portalWaitlistRoute: typeof import('@/app/api/portal/patient/waitlist/route');
  let portalLeaveRoute: typeof import('@/app/api/portal/patient/waitlist/[id]/leave/route');
  let portalRoute: typeof import('@/app/api/portal/patient/route');
  let patientId: string;
  let otherPatientId: string;
  let procedureId: string;

  const savePolicy = (cancellationPolicy: unknown, extra = {}) =>
    scheduleRoute.PUT(
      jsonRequest('/api/settings/schedule', 'PUT', {
        weekdays: [1, 2, 3, 4, 5],
        startHour: 8,
        endHour: 18,
        minGapMinutes: 15,
        cancellationPolicy,
        ...extra,
      }),
    );

  const createAppointment = async (startsAt: string, endsAt: string) => {
    const response = await appointmentsRoute.POST(
      jsonRequest('/api/appointments', 'POST', {
        patientId,
        startsAt,
        endsAt,
        procedure: 'Curativo',
        priceCents: 10000,
      }),
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const patch = (id: string, body: unknown) =>
    appointmentByIdRoute.PATCH(
      jsonRequest(`/api/appointments/${id}`, 'PATCH', body),
      context(id),
    );

  beforeAll(async () => {
    scheduleRoute = await import('@/app/api/settings/schedule/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    invoicesRoute = await import('@/app/api/invoices/route');
    waitlistRoute = await import('@/app/api/waitlist/route');
    waitlistByIdRoute = await import('@/app/api/waitlist/[id]/route');
    portalWaitlistRoute = await import(
      '@/app/api/portal/patient/waitlist/route'
    );
    portalLeaveRoute = await import(
      '@/app/api/portal/patient/waitlist/[id]/leave/route'
    );
    portalRoute = await import('@/app/api/portal/patient/route');
    const patientsRoute = await import('@/app/api/patients/route');
    const proceduresRoute = await import('@/app/api/procedures/route');
    await ensureTestClinics();

    const created = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Ester Espera',
        email: PATIENT_EMAIL,
        phone: '11900002222',
      }),
    );
    patientId = ((await created.json()) as Envelope<{ id: string }>).data.id;
    const other = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Otávio Outro',
        email: OTHER_EMAIL,
        phone: '11900003333',
      }),
    );
    otherPatientId = ((await other.json()) as Envelope<{ id: string }>).data.id;
    const procedure = await proceduresRoute.POST(
      jsonRequest('/api/procedures', 'POST', {
        name: 'Curativo espera',
        priceCents: 10000,
        durationMinutes: 60,
      }),
    );
    procedureId = ((await procedure.json()) as Envelope<{ id: string }>).data
      .id;
  });

  afterAll(async () => {
    await savePolicy({ noticeHours: 24, lateFeeCents: 0 });
  });

  describe('Política de cancelamento', () => {
    it('Dado política salva, Quando ler a grade e o portal, Então a antecedência aparece nos dois', async () => {
      expect(
        (await savePolicy({ noticeHours: 48, lateFeeCents: 3500 })).status,
      ).toBe(200);

      const read = await scheduleRoute.GET(
        jsonRequest('/api/settings/schedule', 'GET'),
      );
      expect(
        (
          (await read.json()) as Envelope<{
            config: { cancellationPolicy: unknown };
          }>
        ).data.config.cancellationPolicy,
      ).toEqual({ noticeHours: 48, lateFeeCents: 3500 });

      await linkAllPortalAccounts();
      const portal = await portalRoute.GET(
        jsonRequest('/api/portal/patient', 'GET', undefined, patientCookie()),
      );
      expect(
        ((await portal.json()) as Envelope<{ changeNoticeHours: number }>).data
          .changeNoticeHours,
      ).toBe(48);
    });

    it('Dado tela antiga que não manda política nem almoço, Quando salvar a grade, Então os dois são preservados', async () => {
      await savePolicy(
        { noticeHours: 12, lateFeeCents: 2000 },
        { lunchBreak: { startMinute: 720, endMinute: 780 } },
      );
      await scheduleRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [1, 2, 3, 4, 5],
          startHour: 8,
          endHour: 18,
          minGapMinutes: 20,
        }),
      );
      const read = await scheduleRoute.GET(
        jsonRequest('/api/settings/schedule', 'GET'),
      );
      const { config } = (
        (await read.json()) as Envelope<{
          config: {
            cancellationPolicy: unknown;
            lunchBreak: unknown;
            minGapMinutes: number;
          };
        }>
      ).data;
      expect(config.minGapMinutes).toBe(20);
      expect(config.cancellationPolicy).toEqual({
        noticeHours: 12,
        lateFeeCents: 2000,
      });
      expect(config.lunchBreak).toEqual({ startMinute: 720, endMinute: 780 });
      await savePolicy(
        { noticeHours: 24, lateFeeCents: 0 },
        { lunchBreak: null },
      );
    });

    it('Dado política inválida, Quando salvar, Então 400', async () => {
      expect(
        (await savePolicy({ noticeHours: 200, lateFeeCents: 0 })).status,
      ).toBe(400);
    });

    it('Dado paciente pedindo em cima da hora (política de 168h com taxa), Quando a equipe cancela cobrando, Então fica tardio e a taxa vira fatura pendente', async () => {
      await savePolicy({ noticeHours: 168, lateFeeCents: 4000 });
      const day = nextBusinessDay();
      const id = await createAppointment(at(day, 10), at(day, 11));

      const response = await patch(id, {
        action: 'cancel',
        requestedBy: 'patient',
        reason: 'Imprevisto',
        chargeLateFee: true,
      });
      const body = (await response.json()) as Envelope<{
        status: string;
        cancelledBy: string;
        cancelledLate: boolean;
        feeInvoiceId: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'patient',
        cancelledLate: true,
      });
      const invoices = await invoicesRoute.GET(
        jsonRequest(`/api/invoices?patientId=${patientId}`, 'GET'),
      );
      const fee = (
        (await invoices.json()) as Envelope<
          {
            id: string;
            amountCents: number;
            status: string;
            description: string;
          }[]
        >
      ).data.find((i) => i.id === body.data.feeInvoiceId);
      expect(fee).toMatchObject({ amountCents: 4000, status: 'pending' });
      expect(fee?.description).toContain('Taxa de cancelamento tardio');

      // Relido do banco: o tardio persiste.
      const stored = await appointmentByIdRoute.GET(
        jsonRequest(`/api/appointments/${id}`, 'GET'),
        context(id),
      );
      expect(
        ((await stored.json()) as Envelope<{ cancelledLate: boolean }>).data
          .cancelledLate,
      ).toBe(true);
    });

    it('Dado política de 168h, Quando o paciente tenta cancelar pelo portal dias antes, Então 400 com a antecedência da clínica', async () => {
      const cancelRoute = await import(
        '@/app/api/portal/patient/appointments/[id]/cancel/route'
      );
      await savePolicy({ noticeHours: 168, lateFeeCents: 4000 });
      const day = nextBusinessDay(2);
      const id = await createAppointment(at(day, 8), at(day, 9));
      await linkAllPortalAccounts();
      const response = await cancelRoute.POST(
        jsonRequest(
          `/api/portal/patient/appointments/${id}/cancel`,
          'POST',
          {},
          patientCookie(),
        ),
        context(id),
      );
      expect(response.status).toBe(400);
      expect(((await response.json()) as Envelope<null>).error).toContain(
        '168 horas',
      );
    });

    it('Dado cancelamento pela clínica, Quando pedir taxa, Então 400 e a consulta segue ativa', async () => {
      const day = nextBusinessDay();
      const id = await createAppointment(at(day, 14), at(day, 15));
      const response = await patch(id, {
        action: 'cancel',
        chargeLateFee: true,
      });
      expect(response.status).toBe(400);

      const read = await appointmentByIdRoute.GET(
        jsonRequest(`/api/appointments/${id}`, 'GET'),
        context(id),
      );
      expect(
        ((await read.json()) as Envelope<{ status: string }>).data.status,
      ).toBe('scheduled');
    });

    it('Dado falta com taxa, Quando registrar cobrando, Então gera a fatura de não comparecimento', async () => {
      const day = nextBusinessDay(2);
      const id = await createAppointment(at(day, 16), at(day, 17));
      const response = await patch(id, {
        action: 'no_show',
        chargeLateFee: true,
      });
      const body = (await response.json()) as Envelope<{
        status: string;
        feeInvoiceId: string | null;
      }>;
      expect(body.data.status).toBe('no_show');
      expect(body.data.feeInvoiceId).not.toBeNull();
      await savePolicy({ noticeHours: 24, lateFeeCents: 0 });
    });
  });

  describe('Lista de espera', () => {
    const windowFrom = dateKey(nextBusinessDay(20));
    const windowTo = dateKey(nextBusinessDay(40));

    it('Dado paciente na fila, Quando um horário do período vaga, Então o cancelamento informa quantos aceitam o dia', async () => {
      const added = await waitlistRoute.POST(
        jsonRequest('/api/waitlist', 'POST', {
          patientId: otherPatientId,
          procedureId,
          fromDate: windowFrom,
          toDate: windowTo,
          notes: 'Só de manhã',
        }),
      );
      const entry = (
        (await added.json()) as Envelope<{
          patientName: string;
          procedureName: string;
          source: string;
        }>
      ).data;
      expect(entry).toMatchObject({
        patientName: 'Otávio Outro',
        procedureName: 'Curativo espera',
        source: 'staff',
      });

      const day = nextBusinessDay(25);
      const id = await createAppointment(at(day, 9), at(day, 10));
      const response = await patch(id, { action: 'cancel' });
      expect(
        ((await response.json()) as Envelope<{ waitlistMatches: number }>).data
          .waitlistMatches,
      ).toBe(1);

      const matches = await waitlistRoute.GET(
        jsonRequest(`/api/waitlist?date=${dateKey(day)}`, 'GET'),
      );
      expect(((await matches.json()) as Envelope<unknown[]>).data).toHaveLength(
        1,
      );
      const outside = await waitlistRoute.GET(
        jsonRequest(
          `/api/waitlist?date=${dateKey(nextBusinessDay(60))}`,
          'GET',
        ),
      );
      expect(((await outside.json()) as Envelope<unknown[]>).data).toEqual([]);
    });

    it('Dado data em formato inválido, Quando filtrar, Então 400', async () => {
      const response = await waitlistRoute.GET(
        jsonRequest('/api/waitlist?date=amanha', 'GET'),
      );
      expect(response.status).toBe(400);
    });

    it('Dado entrada na fila, Quando marcar como agendada, Então sai da fila; resolver de novo dá 409', async () => {
      const added = await waitlistRoute.POST(
        jsonRequest('/api/waitlist', 'POST', {
          patientId,
          fromDate: windowFrom,
          toDate: windowTo,
        }),
      );
      const { id } = ((await added.json()) as Envelope<{ id: string }>).data;

      const resolved = await waitlistByIdRoute.PATCH(
        jsonRequest(`/api/waitlist/${id}`, 'PATCH', {
          resolution: 'scheduled',
        }),
        context(id),
      );
      expect(
        ((await resolved.json()) as Envelope<{ status: string }>).data.status,
      ).toBe('scheduled');
      const list = await waitlistRoute.GET(jsonRequest('/api/waitlist', 'GET'));
      expect(
        ((await list.json()) as Envelope<{ id: string }[]>).data.map(
          (e) => e.id,
        ),
      ).not.toContain(id);

      const again = await waitlistByIdRoute.PATCH(
        jsonRequest(`/api/waitlist/${id}`, 'PATCH', { resolution: 'removed' }),
        context(id),
      );
      expect(again.status).toBe(409);
    });

    it('Dado fila da clínica A, Quando a clínica B lista ou resolve, Então não vê e recebe 404', async () => {
      const listB = await waitlistRoute.GET(
        jsonRequest('/api/waitlist', 'GET', undefined, clinicB()),
      );
      expect(((await listB.json()) as Envelope<unknown[]>).data).toEqual([]);

      const listA = await waitlistRoute.GET(
        jsonRequest('/api/waitlist', 'GET'),
      );
      const [first] = ((await listA.json()) as Envelope<{ id: string }[]>).data;
      const resolveB = await waitlistByIdRoute.PATCH(
        jsonRequest(
          `/api/waitlist/${first.id}`,
          'PATCH',
          { resolution: 'removed' },
          clinicB(),
        ),
        context(first.id),
      );
      expect(resolveB.status).toBe(404);
    });

    it('Dado paciente de outra clínica, Quando a clínica B tenta pôr na fila, Então 404', async () => {
      const response = await waitlistRoute.POST(
        jsonRequest(
          '/api/waitlist',
          'POST',
          { patientId, fromDate: windowFrom, toDate: windowTo },
          clinicB(),
        ),
      );
      expect(response.status).toBe(404);
    });

    it('Dado paciente no portal, Quando entrar na fila, listar e sair, Então só vê e mexe na própria entrada', async () => {
      await linkAllPortalAccounts();
      const joined = await portalWaitlistRoute.POST(
        jsonRequest(
          '/api/portal/patient/waitlist',
          'POST',
          { procedureId, fromDate: windowFrom, toDate: windowTo },
          patientCookie(),
        ),
      );
      const entry = (
        (await joined.json()) as Envelope<{ id: string; source: string }>
      ).data;
      expect(entry.source).toBe('patient');

      await linkAllPortalAccounts();
      const mine = await portalWaitlistRoute.GET(
        jsonRequest(
          '/api/portal/patient/waitlist',
          'GET',
          undefined,
          patientCookie(),
        ),
      );
      expect(
        ((await mine.json()) as Envelope<{ id: string }[]>).data.map(
          (e) => e.id,
        ),
      ).toEqual([entry.id]);

      await linkAllPortalAccounts();
      const theirs = await portalLeaveRoute.POST(
        jsonRequest(
          `/api/portal/patient/waitlist/${entry.id}/leave`,
          'POST',
          undefined,
          otherCookie(),
        ),
        context(entry.id),
      );
      expect(theirs.status).toBe(404);

      await linkAllPortalAccounts();
      const left = await portalLeaveRoute.POST(
        jsonRequest(
          `/api/portal/patient/waitlist/${entry.id}/leave`,
          'POST',
          undefined,
          patientCookie(),
        ),
        context(entry.id),
      );
      expect(
        ((await left.json()) as Envelope<{ status: string }>).data.status,
      ).toBe('removed');
      await linkAllPortalAccounts();
      const after = await portalWaitlistRoute.GET(
        jsonRequest(
          '/api/portal/patient/waitlist',
          'GET',
          undefined,
          patientCookie(),
        ),
      );
      expect(((await after.json()) as Envelope<unknown[]>).data).toEqual([]);
    });

    it('Dado paciente pedindo período começando ontem, Quando entrar pelo portal, Então 400', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await linkAllPortalAccounts();
      const response = await portalWaitlistRoute.POST(
        jsonRequest(
          '/api/portal/patient/waitlist',
          'POST',
          { procedureId, fromDate: dateKey(yesterday), toDate: windowTo },
          patientCookie(),
        ),
      );
      expect(response.status).toBe(400);
    });

    it('Dado sem sessão ou sessão de parceiro, Quando usar a fila do portal, Então 401/403', async () => {
      const anonymous = await portalWaitlistRoute.GET(
        jsonRequest('/api/portal/patient/waitlist', 'GET', undefined, {
          cookie: '',
        }),
      );
      await linkAllPortalAccounts();
      const partner = await portalWaitlistRoute.GET(
        jsonRequest(
          '/api/portal/patient/waitlist',
          'GET',
          undefined,
          cookieHeaderFor('partner', 'parceiro@example.com'),
        ),
      );
      expect(anonymous.status).toBe(401);
      expect(partner.status).toBe(403);
    });
  });
});
