import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { FollowUp } from '@/domain/followup/follow-up';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { clearEmailChannels, saveEmailChannel } from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface RunSummary {
  sent: number;
  skipped: number;
  failed: number;
  clinics: Array<{
    clinicId: string;
    channel?: 'configured' | 'none';
    sent: number;
    skipped: number;
    failed: number;
    error?: string;
  }>;
}

type LinkResult = { url: string; sentAt: string };

const LINK = '/api/reminders/whatsapp-link';

/** Amanhã, 10:00 no fuso do processo (TZ=UTC na suíte). */
const tomorrowAt = (hour: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour);
};

const yesterday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
};

describe('Feature: Rotas de lembretes — job por e-mail e botão Enviar WhatsApp', () => {
  let runRoute: typeof import('@/app/api/reminders/run/route');
  let linkRoute: typeof import('@/app/api/reminders/whatsapp-link/route');
  let followUpsRoute: typeof import('@/app/api/follow-ups/route');

  const seedPatient = async (
    clinicId: string,
    fullName: string,
    emailAddress: string,
  ) => {
    const patient = Patient.create({
      fullName,
      email: emailAddress,
      phone: '(11) 98765-4321',
    });
    await (await getRepositories(clinicScope(clinicId))).patients.save(patient);
    return patient;
  };

  const seedAppointment = async (
    clinicId: string,
    patientId: string,
    startsAt: Date,
  ) => {
    const appointment = Appointment.create({
      patientId,
      slot: TimeSlot.create(startsAt, new Date(startsAt.getTime() + 3_600_000)),
      procedure: 'Troca de bolsa de colostomia',
      price: Money.fromCents(25000),
    });
    await (await getRepositories(clinicScope(clinicId))).appointments.save(
      appointment,
    );
    return appointment;
  };

  const seedFollowUp = async (
    clinicId: string,
    patientId: string,
    due: Date,
  ) => {
    const followUp = FollowUp.create({
      patientId,
      appointmentId: null,
      dueDate: due,
      reason: 'Retorno: Curativo de lesão sacral',
    });
    await (await getRepositories(clinicScope(clinicId))).followUps.save(
      followUp,
    );
    return followUp;
  };

  const logs = async () => {
    const db = await getDb();
    return db.select().from(schema.reminderLogs);
  };

  const postLink = (body: unknown, headers = adminCookieHeader(CLINIC_B_ID)) =>
    linkRoute.POST(jsonRequest(LINK, 'POST', body, headers));

  const runJob = () =>
    runRoute.POST(
      jsonRequest('/api/reminders/run', 'POST', undefined, {
        'x-cron-secret': 'cron-secreto',
      }),
    );

  beforeAll(async () => {
    runRoute = await import('@/app/api/reminders/run/route');
    linkRoute = await import('@/app/api/reminders/whatsapp-link/route');
    followUpsRoute = await import('@/app/api/follow-ups/route');
    await ensureTestClinics();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(schema.reminderLogs);
    await db.delete(schema.followUps);
    await db.delete(schema.appointments);
    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    vi.stubEnv('APP_URL', 'https://estomasystech.example.com');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await clearEmailChannels();
  });

  describe('POST /api/reminders/run', () => {
    it('C7 run sem canal da clínica responde 200 com channel none', async () => {
      const patient = await seedPatient(
        CLINIC_A_ID,
        'Paula Dry',
        'paula.dry@example.com',
      );
      await seedAppointment(CLINIC_A_ID, patient.id, tomorrowAt(10));
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const response = await runJob();
      const body = (await response.json()) as Envelope<RunSummary>;

      expect(response.status).toBe(200);
      expect(body.data).not.toHaveProperty('channelEnabled');
      expect(
        body.data.clinics.find((c) => c.clinicId === CLINIC_A_ID)?.channel,
      ).toBe('none');
      expect(body.data.sent).toBe(0);
      expect(body.data.skipped).toBeGreaterThanOrEqual(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('pa***@example.com'),
      );
      expect(info).not.toHaveBeenCalledWith(
        expect.stringContaining('paula.dry@example.com'),
      );
      expect(await logs()).toHaveLength(0);
    });

    it('C8 run separa por empresa', async () => {
      // Cada clínica envia pelo próprio canal (C2, #265).
      await saveEmailChannel(CLINIC_A_ID, 're_test_a');
      await saveEmailChannel(CLINIC_B_ID, 're_test_b');
      const bodies: Array<{ to: string[]; subject: string; text: string }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          bodies.push(JSON.parse(String(init.body)));
          return new Response('{}', { status: 200 });
        }),
      );
      const ana = await seedPatient(
        CLINIC_A_ID,
        'Ana Alfa',
        'ana.a@example.com',
      );
      const bruno = await seedPatient(
        CLINIC_B_ID,
        'Bruno Beta',
        'bruno.b@example.com',
      );
      await seedAppointment(CLINIC_A_ID, ana.id, tomorrowAt(10));
      const appointmentB = await seedAppointment(
        CLINIC_B_ID,
        bruno.id,
        tomorrowAt(13),
      );
      const followUpB = await seedFollowUp(CLINIC_B_ID, bruno.id, yesterday());

      const response = await runJob();
      const body = (await response.json()) as Envelope<RunSummary>;

      expect(response.status).toBe(200);
      const entryA = body.data.clinics.find((c) => c.clinicId === CLINIC_A_ID);
      const entryB = body.data.clinics.find((c) => c.clinicId === CLINIC_B_ID);
      expect(entryA).toEqual({
        clinicId: CLINIC_A_ID,
        channel: 'configured',
        sent: 1,
        skipped: 0,
        failed: 0,
      });
      expect(entryB).toEqual({
        clinicId: CLINIC_B_ID,
        channel: 'configured',
        sent: 2,
        skipped: 0,
        failed: 0,
      });
      const toBruno = bodies.filter((b) => b.to[0] === 'bruno.b@example.com');
      expect(toBruno).toHaveLength(2);
      for (const message of toBruno) {
        expect(message.text).toContain('Clínica B (teste)');
        expect(message.text).not.toContain('Clínica legada');
      }
      const saved = await logs();
      const byRef = new Map(saved.map((r) => [r.referenceId, r]));
      expect(byRef.get(appointmentB.id)?.clinicId).toBe(CLINIC_B_ID);
      expect(byRef.get(followUpB.id)?.clinicId).toBe(CLINIC_B_ID);
      expect(byRef.get(followUpB.id)?.channel).toBe('email');
      expect(saved.filter((r) => r.clinicId === CLINIC_A_ID)).toHaveLength(1);
    });
  });

  describe('POST /api/reminders/whatsapp-link', () => {
    it('C20 link de confirmação traz procedimento, data, hora e clínica', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Carla Souza Lima',
        'carla@example.com',
      );
      const startsAt = new Date(2026, 9, 3, 14, 30);
      const appointment = await seedAppointment(
        CLINIC_B_ID,
        patient.id,
        startsAt,
      );

      const response = await postLink({
        kind: 'confirmation',
        referenceId: appointment.id,
      });
      const body = (await response.json()) as Envelope<LinkResult>;

      expect(response.status).toBe(200);
      expect(body.data.url).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
      const text = decodeURIComponent(body.data.url.split('?text=')[1]);
      expect(text).toContain('Carla');
      expect(text).not.toContain('Souza');
      expect(text).toContain('Troca de bolsa de colostomia');
      expect(text).toContain('03/10/2026');
      expect(text).toContain('14:30');
      expect(text).toContain('Clínica B (teste)');
    });

    it('C21 clique grava log whatsapp_link na empresa da sessão', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Davi Beta',
        'davi@example.com',
      );
      const appointment = await seedAppointment(
        CLINIC_B_ID,
        patient.id,
        tomorrowAt(9),
      );

      await postLink({ kind: 'confirmation', referenceId: appointment.id });

      const saved = await logs();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        kind: 'confirmation',
        channel: 'whatsapp_link',
        referenceId: appointment.id,
        clinicId: CLINIC_B_ID,
        attempt: 1,
      });
    });

    it('C21b telefone inválido não gera link nem conta como clique, e o motivo chega à recepção', async () => {
      const legacy = Patient.restore({
        id: 'legacy-phone-patient',
        fullName: 'Lia Legado',
        email: 'lia@example.com',
        phone: '99999-0000',
        active: true,
        createdAt: new Date(),
      });
      await (await getRepositories(clinicScope(CLINIC_B_ID))).patients.save(
        legacy,
      );
      const appointment = await seedAppointment(
        CLINIC_B_ID,
        legacy.id,
        tomorrowAt(10),
      );

      const response = await postLink({
        kind: 'confirmation',
        referenceId: appointment.id,
      });
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/Informe o DDD/);
      expect(body.error).toMatch(/Corrija o telefone/);
      expect(await logs()).toHaveLength(0);
    });

    it('C22 link de recall traz motivo, data, clínica e portal', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Elisa Beta',
        'elisa@example.com',
      );
      const followUp = await seedFollowUp(
        CLINIC_B_ID,
        patient.id,
        new Date(2026, 8, 1, 12),
      );

      const response = await postLink({
        kind: 'recall',
        referenceId: followUp.id,
      });
      const body = (await response.json()) as Envelope<LinkResult>;

      const text = decodeURIComponent(body.data.url.split('?text=')[1]);
      expect(text).toContain('Elisa');
      expect(text).toContain('Retorno: Curativo de lesão sacral');
      expect(text).toContain('01/09/2026');
      expect(text).toContain('Clínica B (teste)');
      expect(text).toContain('https://estomasystech.example.com/portal');
      const saved = await logs();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        kind: 'recall',
        channel: 'whatsapp_link',
      });
    });

    it('C23 GET devolve o horário do primeiro clique do dia', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Fabio Beta',
        'fabio@example.com',
      );
      const appointment = await seedAppointment(
        CLINIC_B_ID,
        patient.id,
        tomorrowAt(9),
      );
      const other = await seedAppointment(
        CLINIC_B_ID,
        patient.id,
        tomorrowAt(15),
      );
      const first = (await (
        await postLink({ kind: 'confirmation', referenceId: appointment.id })
      ).json()) as Envelope<LinkResult>;

      // Outra recepcionista da mesma empresa abre a tela depois.
      const response = await linkRoute.GET(
        jsonRequest(
          `${LINK}?kind=confirmation&referenceIds=${appointment.id},${other.id}`,
          'GET',
          undefined,
          cookieHeaderFor('atendente', 'outra@clinica.com', CLINIC_B_ID),
        ),
      );
      const body = (await response.json()) as Envelope<Record<string, string>>;

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ [appointment.id]: first.data.sentAt });
      // Outra empresa não enxerga o clique.
      const fromA = await linkRoute.GET(
        jsonRequest(
          `${LINK}?kind=confirmation&referenceIds=${appointment.id}`,
          'GET',
        ),
      );
      expect(
        ((await fromA.json()) as Envelope<Record<string, string>>).data,
      ).toEqual({});
    });

    it('C24 segundo clique devolve o link e mantém um registro', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Gabi Beta',
        'gabi@example.com',
      );
      const followUp = await seedFollowUp(CLINIC_B_ID, patient.id, yesterday());

      const first = (await (
        await postLink({ kind: 'recall', referenceId: followUp.id })
      ).json()) as Envelope<LinkResult>;
      const secondResponse = await postLink({
        kind: 'recall',
        referenceId: followUp.id,
      });
      const second = (await secondResponse.json()) as Envelope<LinkResult>;

      expect(secondResponse.status).toBe(200);
      expect(second.data.url).toBe(first.data.url);
      expect(second.data.sentAt).toBe(first.data.sentAt);
      expect(await logs()).toHaveLength(1);
    });

    it('C25 POSTs concorrentes deixam um registro', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Hugo Beta',
        'hugo@example.com',
      );
      const appointment = await seedAppointment(
        CLINIC_B_ID,
        patient.id,
        tomorrowAt(9),
      );

      const responses = await Promise.all([
        postLink({ kind: 'confirmation', referenceId: appointment.id }),
        postLink({ kind: 'confirmation', referenceId: appointment.id }),
      ]);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(await logs()).toHaveLength(1);
    });

    it('C27 401 sem sessão', async () => {
      const response = await postLink(
        { kind: 'confirmation', referenceId: 'x' },
        { cookie: '' },
      );

      expect(response.status).toBe(401);
    });

    it('C28 403 para paciente e parceiro', async () => {
      for (const role of ['patient', 'partner'] as const) {
        const response = await postLink(
          { kind: 'confirmation', referenceId: 'x' },
          cookieHeaderFor(role, `${role}@example.com`, CLINIC_B_ID),
        );
        expect(response.status).toBe(403);
      }
      expect(await logs()).toHaveLength(0);
    });

    it('C29 400 com corpo inválido', async () => {
      for (const body of [
        {},
        { kind: 'whatsapp', referenceId: 'x' },
        { kind: 'recall' },
        { kind: 'recall', referenceId: '' },
      ]) {
        const response = await postLink(body);
        expect(response.status).toBe(400);
      }
    });

    it('C30 404 para referência de outra empresa', async () => {
      const patientA = await seedPatient(
        CLINIC_A_ID,
        'Iris Alfa',
        'iris@example.com',
      );
      const appointmentA = await seedAppointment(
        CLINIC_A_ID,
        patientA.id,
        tomorrowAt(9),
      );
      const followUpA = await seedFollowUp(
        CLINIC_A_ID,
        patientA.id,
        yesterday(),
      );

      const responses = await Promise.all([
        postLink({ kind: 'confirmation', referenceId: appointmentA.id }),
        postLink({ kind: 'recall', referenceId: followUpA.id }),
        postLink({ kind: 'recall', referenceId: 'nao-existe' }),
      ]);

      expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
      expect(await logs()).toHaveLength(0);
    });
  });

  describe('GET /api/follow-ups — selo de recall esgotado', () => {
    const listPending = async () => {
      const response = await followUpsRoute.GET(
        jsonRequest(
          '/api/follow-ups?status=pending',
          'GET',
          undefined,
          adminCookieHeader(CLINIC_B_ID),
        ),
      );
      return (
        (await response.json()) as Envelope<
          Array<{ id: string; recallExhausted: boolean }>
        >
      ).data;
    };

    const seedAttempts = async (followUpId: string, attempts: number) => {
      const { reminderLog } = await getRepositories(clinicScope(CLINIC_B_ID));
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await reminderLog.save(
          ReminderLog.create('recall', followUpId, new Date(2026, 5, attempt), {
            attempt,
          }),
        );
      }
    };

    it('C32 follow-ups marca recallExhausted só com a 3ª tentativa', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Joana Beta',
        'joana@example.com',
      );
      const byAttempts = new Map<number, string>();
      for (const attempts of [0, 1, 2, 3]) {
        const followUp = await seedFollowUp(
          CLINIC_B_ID,
          patient.id,
          yesterday(),
        );
        await seedAttempts(followUp.id, attempts);
        byAttempts.set(attempts, followUp.id);
      }

      const list = await listPending();
      const flag = (attempts: number) =>
        list.find((f) => f.id === byAttempts.get(attempts))?.recallExhausted;

      expect([0, 1, 2, 3].map(flag)).toEqual([false, false, false, true]);
    });

    it('C33 cliques de WhatsApp não esgotam o recall', async () => {
      const patient = await seedPatient(
        CLINIC_B_ID,
        'Karla Beta',
        'karla@example.com',
      );
      const followUp = await seedFollowUp(CLINIC_B_ID, patient.id, yesterday());
      const { reminderLog } = await getRepositories(clinicScope(CLINIC_B_ID));
      for (const day of [1, 2, 3, 4]) {
        await reminderLog.save(
          ReminderLog.create('recall', followUp.id, new Date(2026, 5, day), {
            channel: 'whatsapp_link',
          }),
        );
      }

      const list = await listPending();

      expect(list.find((f) => f.id === followUp.id)?.recallExhausted).toBe(
        false,
      );
    });
  });
});
