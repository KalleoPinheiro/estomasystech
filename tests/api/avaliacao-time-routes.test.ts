import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface AssessmentBody {
  id: string;
  infectionLevel: string | null;
  infectionSigns: string[];
  woundEdges: string | null;
  exudateType: string | null;
  granulationPct: number | null;
  epithelialPct: number | null;
  sloughPct: number | null;
  necroticPct: number | null;
}

describe('Feature: TIME completo na avaliação de ferida pela API (#464)', () => {
  let assessmentsRoute: typeof import('@/app/api/conditions/[id]/assessments/route');
  let conditionId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const post = (body: Record<string, unknown>) =>
    assessmentsRoute.POST(
      jsonRequest(`/api/conditions/${conditionId}/assessments`, 'POST', body),
      context(conditionId),
    );

  beforeAll(async () => {
    const patientsRoute = await import('@/app/api/patients/route');
    const conditionsRoute = await import(
      '@/app/api/patients/[id]/conditions/route'
    );
    assessmentsRoute = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );
    const patient = (await (
      await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Carla Moraes',
          email: 'carla.time@example.com',
          phone: '11977775555',
        }),
      )
    ).json()) as Envelope<{ id: string }>;
    const condition = (await (
      await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patient.data.id}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Úlcera venosa',
        }),
        context(patient.data.id),
      )
    ).json()) as Envelope<{ id: string }>;
    conditionId = condition.data.id;
  });

  it('Dado o TIME completo, Quando POST e depois GET, Então grava e devolve infecção, bordas, exsudato e tecido', async () => {
    const response = await post({
      lengthMm: 30,
      widthMm: 20,
      tissueType: 'slough',
      exudate: 'high',
      infectionLevel: 'local',
      infectionSigns: 'erythema,malodor,purulent_exudate',
      woundEdges: 'macerated',
      exudateType: 'purulent',
      granulationPct: 40,
      epithelialPct: 0,
      sloughPct: 55,
      necroticPct: 5,
    });
    const created = (await response.json()) as Envelope<AssessmentBody>;

    expect(response.status).toBe(200);
    expect(created.data.infectionLevel).toBe('local');
    expect(created.data.infectionSigns).toEqual([
      'erythema',
      'malodor',
      'purulent_exudate',
    ]);

    const listed = (await (
      await assessmentsRoute.GET(
        jsonRequest(`/api/conditions/${conditionId}/assessments`, 'GET'),
        context(conditionId),
      )
    ).json()) as Envelope<AssessmentBody[]>;
    const stored = listed.data.find((a) => a.id === created.data.id);

    expect(stored).toMatchObject({
      infectionLevel: 'local',
      infectionSigns: ['erythema', 'malodor', 'purulent_exudate'],
      woundEdges: 'macerated',
      exudateType: 'purulent',
      granulationPct: 40,
      epithelialPct: 0,
      sloughPct: 55,
      necroticPct: 5,
    });
  });

  it('Dado avaliação no formato anterior, Quando POST, Então segue válida com o TIME vazio', async () => {
    const response = await post({ lengthMm: 10, widthMm: 5, exudate: 'low' });
    const body = (await response.json()) as Envelope<AssessmentBody>;

    expect(response.status).toBe(200);
    expect(body.data.infectionLevel).toBeNull();
    expect(body.data.infectionSigns).toEqual([]);
    expect(body.data.woundEdges).toBeNull();
    expect(body.data.granulationPct).toBeNull();
  });

  it.each([
    ['nível de infecção', { infectionLevel: 'grave' }],
    ['borda', { woundEdges: 'lisas' }],
    ['tipo de exsudato', { exudateType: 'verde' }],
    ['percentual acima de 100', { granulationPct: 101 }],
    ['percentual fracionado', { sloughPct: 10.5 }],
  ])(
    'Dado %s inválido, Quando POST, Então responde 400',
    async (_nome, body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
    },
  );

  it('Dado sinal de infecção desconhecido, Quando POST, Então responde 400 pelo domínio', async () => {
    const response = await post({ infectionSigns: 'erythema,tosse' });
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Sinais de infecção inválidos: tosse');
  });

  it('Dado percentuais que somam mais de 100, Quando POST, Então responde 400', async () => {
    const response = await post({ granulationPct: 70, sloughPct: 40 });
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(body.error).toContain('não pode passar de 100%');
  });
});
