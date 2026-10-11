import { beforeAll, describe, expect, it } from 'vitest';
import { ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const atendente = () => cookieHeaderFor('atendente', 'recepcao@clinica.com');
const profissional = (professionalId: string | null) =>
  cookieHeaderFor(
    'profissional',
    'prof@clinica.com',
    undefined,
    professionalId,
  );

const CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  cancellationPolicy: { noticeHours: 24, lateFeeCents: 5000 },
};

/**
 * #215 (decisão de @KalleoPinheiro, 2026-10-11): grade, almoço e política/taxa
 * de cancelamento só do Admin; feriados com Admin e Atendente; ausência com
 * Admin e Atendente para qualquer profissional e o Profissional só a própria.
 */
describe('Feature: Permissão da grade, feriados e ausências por papel (#215)', () => {
  let scheduleRoute: typeof import('@/app/api/settings/schedule/route');
  let scheduleConfigRoute: typeof import('@/app/api/schedule-config/route');
  let closuresRoute: typeof import('@/app/api/settings/schedule/closures/route');
  let closureByIdRoute: typeof import('@/app/api/settings/schedule/closures/[id]/route');
  let ana: string;
  let bia: string;

  const createClosure = async (
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => {
    const response = await closuresRoute.POST(
      jsonRequest('/api/settings/schedule/closures', 'POST', body, headers),
    );
    const envelope = (await response.json()) as Envelope<{
      closure: { id: string };
    } | null>;
    return { status: response.status, envelope };
  };

  const removeClosure = async (id: string, headers?: Record<string, string>) =>
    closureByIdRoute.DELETE(
      jsonRequest(
        `/api/settings/schedule/closures/${id}`,
        'DELETE',
        undefined,
        headers,
      ),
      context(id),
    );

  beforeAll(async () => {
    scheduleRoute = await import('@/app/api/settings/schedule/route');
    scheduleConfigRoute = await import('@/app/api/schedule-config/route');
    closuresRoute = await import('@/app/api/settings/schedule/closures/route');
    closureByIdRoute = await import(
      '@/app/api/settings/schedule/closures/[id]/route'
    );
    const professionalsRoute = await import('@/app/api/professionals/route');
    await ensureTestClinics();
    const create = async (fullName: string) => {
      const response = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', { fullName }),
      );
      return ((await response.json()) as Envelope<{ id: string }>).data.id;
    };
    ana = await create('Dra. Ana Permissão');
    bia = await create('Dra. Bia Permissão');
  });

  describe('Grade, almoço e política de cancelamento', () => {
    it.each([
      ['atendente', atendente],
      ['profissional', () => profissional('x')],
    ])(
      'Dado %s, Quando PUT /api/settings/schedule, Então 403 e a grade não muda',
      async (_, headers) => {
        const response = await scheduleRoute.PUT(
          jsonRequest(
            '/api/settings/schedule',
            'PUT',
            {
              ...CONFIG,
              cancellationPolicy: { noticeHours: 0, lateFeeCents: 999_999 },
            },
            headers(),
          ),
        );
        expect(response.status).toBe(403);

        const read = await scheduleConfigRoute.GET(
          jsonRequest('/api/schedule-config', 'GET'),
        );
        const body = (await read.json()) as Envelope<{
          config: { cancellationPolicy?: { lateFeeCents: number } };
        }>;
        expect(body.data.config.cancellationPolicy?.lateFeeCents).not.toBe(
          999_999,
        );
      },
    );

    it('Dado Atendente, Quando GET /api/settings/schedule, Então 403 (rota de edição do Admin)', async () => {
      const response = await scheduleRoute.GET(
        jsonRequest('/api/settings/schedule', 'GET', undefined, atendente()),
      );
      expect(response.status).toBe(403);
    });

    it('Dado Admin, Quando PUT, Então 200; e toda a equipe lê a grade em /api/schedule-config', async () => {
      const saved = await scheduleRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', CONFIG),
      );
      expect(saved.status).toBe(200);

      for (const headers of [atendente(), profissional(ana)]) {
        const read = await scheduleConfigRoute.GET(
          jsonRequest('/api/schedule-config', 'GET', undefined, headers),
        );
        const body = (await read.json()) as Envelope<{
          config: { cancellationPolicy?: { lateFeeCents: number } };
          isDefault: boolean;
        }>;
        expect(read.status).toBe(200);
        expect(body.data.isDefault).toBe(false);
        expect(body.data.config.cancellationPolicy?.lateFeeCents).toBe(5000);
      }
    });
  });

  describe('Feriados e ausências', () => {
    it('Dado Atendente, Quando cadastra feriado e ausência de qualquer profissional e remove, Então 200', async () => {
      const holiday = await createClosure(
        { startsOn: '2031-01-06', reason: 'Feriado local' },
        atendente(),
      );
      const absence = await createClosure(
        { professionalId: bia, startsOn: '2031-01-07', reason: 'Férias' },
        atendente(),
      );
      expect(holiday.status).toBe(200);
      expect(absence.status).toBe(200);

      for (const created of [holiday, absence]) {
        const id = created.envelope.data?.closure.id as string;
        expect((await removeClosure(id, atendente())).status).toBe(200);
      }
    });

    it('Dado Profissional, Quando cadastra a própria ausência e remove, Então 200', async () => {
      const own = await createClosure(
        { professionalId: ana, startsOn: '2031-02-03', reason: 'Congresso' },
        profissional(ana),
      );
      expect(own.status).toBe(200);
      const id = own.envelope.data?.closure.id as string;
      expect((await removeClosure(id, profissional(ana))).status).toBe(200);
    });

    it.each([
      ['feriado da clínica', null],
      ['ausência de colega', 'bia'],
    ])(
      'Dado Profissional, Quando cadastra %s, Então 403 e nada é gravado',
      async (_, who) => {
        const professionalId = who === 'bia' ? bia : null;
        const denied = await createClosure(
          { professionalId, startsOn: '2031-03-03', reason: 'Indevido' },
          profissional(ana),
        );
        expect(denied.status).toBe(403);
        expect(denied.envelope.error).toBe(
          'Profissional registra e remove só a própria ausência',
        );

        const list = await closuresRoute.GET(
          jsonRequest(
            '/api/settings/schedule/closures?from=2031-03-01&to=2031-03-31',
            'GET',
          ),
        );
        expect(((await list.json()) as Envelope<unknown[]>).data).toEqual([]);
      },
    );

    it('Dado Profissional sem vínculo, Quando cadastra ausência, Então 403', async () => {
      const denied = await createClosure(
        { professionalId: ana, startsOn: '2031-03-04', reason: 'Indevido' },
        profissional(null),
      );
      expect(denied.status).toBe(403);
    });

    it('Dado feriado e ausência de colega, Quando o Profissional remove, Então 403 e os dois ficam', async () => {
      const holiday = await createClosure({
        startsOn: '2031-04-07',
        reason: 'Feriado',
      });
      const colleague = await createClosure({
        professionalId: bia,
        startsOn: '2031-04-08',
        reason: 'Férias da Bia',
      });

      for (const created of [holiday, colleague]) {
        const id = created.envelope.data?.closure.id as string;
        expect((await removeClosure(id, profissional(ana))).status).toBe(403);
        expect((await removeClosure(id)).status).toBe(200);
      }
    });
  });
});
