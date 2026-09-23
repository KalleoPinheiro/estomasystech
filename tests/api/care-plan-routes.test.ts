import { beforeAll, describe, expect, it } from 'vitest';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { TaxonomyLinkage } from '@/domain/taxonomy/taxonomy-linkage';
import { getRepositories } from '@/infrastructure/container';
import { systemScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const scaleAnchors = [
  'Gravemente comprometido',
  'Substancialmente comprometido',
  'Moderadamente comprometido',
  'Levemente comprometido',
  'Não comprometido',
] as const;

describe('Feature: Rotas do plano de cuidados (SAE) e catálogo de taxonomias', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientCarePlansRoute: typeof import('@/app/api/patients/[id]/care-plans/route');
  let carePlanByIdRoute: typeof import('@/app/api/care-plans/[id]/route');
  let diagnosesRoute: typeof import('@/app/api/care-plans/[id]/diagnoses/route');
  let outcomesRoute: typeof import('@/app/api/care-plans/[id]/outcomes/route');
  let interventionsRoute: typeof import('@/app/api/care-plans/[id]/interventions/route');
  let evaluationsRoute: typeof import('@/app/api/care-plan-outcomes/[id]/evaluations/route');
  let recordsRoute: typeof import('@/app/api/care-plan-interventions/[id]/records/route');
  let taxonomyDiagnosesRoute: typeof import('@/app/api/taxonomy/diagnoses/route');
  let taxonomyOutcomesRoute: typeof import('@/app/api/taxonomy/outcomes/route');
  let taxonomyInterventionsRoute: typeof import('@/app/api/taxonomy/interventions/route');
  let linkedTermsRoute: typeof import('@/app/api/taxonomy/diagnoses/[code]/linked-terms/route');

  let patientId: string;
  let carePlanId: string;
  let outcomeId: string;
  let interventionId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    patientCarePlansRoute = await import(
      '@/app/api/patients/[id]/care-plans/route'
    );
    carePlanByIdRoute = await import('@/app/api/care-plans/[id]/route');
    diagnosesRoute = await import('@/app/api/care-plans/[id]/diagnoses/route');
    outcomesRoute = await import('@/app/api/care-plans/[id]/outcomes/route');
    interventionsRoute = await import(
      '@/app/api/care-plans/[id]/interventions/route'
    );
    evaluationsRoute = await import(
      '@/app/api/care-plan-outcomes/[id]/evaluations/route'
    );
    recordsRoute = await import(
      '@/app/api/care-plan-interventions/[id]/records/route'
    );
    taxonomyDiagnosesRoute = await import('@/app/api/taxonomy/diagnoses/route');
    taxonomyOutcomesRoute = await import('@/app/api/taxonomy/outcomes/route');
    taxonomyInterventionsRoute = await import(
      '@/app/api/taxonomy/interventions/route'
    );
    linkedTermsRoute = await import(
      '@/app/api/taxonomy/diagnoses/[code]/linked-terms/route'
    );

    const {
      nursingDiagnoses,
      nursingOutcomes,
      nursingInterventions,
      taxonomyLinkages,
    } = await getRepositories(systemScope());
    await nursingDiagnoses.save(
      NursingDiagnosis.create({
        code: '00046',
        label: 'Integridade da pele prejudicada',
        domain: 'Domínio 11',
        class: 'Classe 2',
        edition: 'NANDA-I 2021-2023',
      }),
    );
    await nursingOutcomes.save(
      NursingOutcome.create({
        code: '1101',
        label: 'Integridade tissular: pele e mucosas',
        domain: 'Saúde fisiológica',
        class: 'Integridade tissular',
        edition: 'NOC 6ª ed.',
        scaleAnchors,
      }),
    );
    await nursingInterventions.save(
      NursingIntervention.create({
        code: '3660',
        label: 'Cuidados com lesões',
        domain: 'Fisiológico: básico',
        class: 'Controle de pele/lesão',
        edition: 'NIC 7ª ed.',
      }),
    );
    await taxonomyLinkages.save(
      TaxonomyLinkage.create({
        diagnosisCode: '00046',
        role: 'outcome',
        targetCode: '1101',
      }),
    );
    await taxonomyLinkages.save(
      TaxonomyLinkage.create({
        diagnosisCode: '00046',
        role: 'intervention',
        targetCode: '3660',
      }),
    );

    const patientResponse = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Carla Nunes',
        email: 'carla.nunes@example.com',
        phone: '11988887777',
      }),
    );
    const patientBody = (await patientResponse.json()) as Envelope<{
      id: string;
    }>;
    patientId = patientBody.data.id;
  });

  describe('Catálogo de taxonomias', () => {
    it('Dado termo, Quando GET /api/taxonomy/diagnoses, Então retorna diagnósticos correspondentes', async () => {
      const response = await taxonomyDiagnosesRoute.GET(
        jsonRequest('/api/taxonomy/diagnoses?q=pele', 'GET'),
      );
      const body = (await response.json()) as Envelope<Array<{ code: string }>>;

      expect(response.status).toBe(200);
      expect(body.data.map((d) => d.code)).toContain('00046');
    });

    it('Dado termo, Quando GET /api/taxonomy/outcomes, Então retorna resultados correspondentes', async () => {
      const response = await taxonomyOutcomesRoute.GET(
        jsonRequest('/api/taxonomy/outcomes?q=tissular', 'GET'),
      );
      const body = (await response.json()) as Envelope<Array<{ code: string }>>;

      expect(body.data.map((o) => o.code)).toContain('1101');
    });

    it('Dado termo, Quando GET /api/taxonomy/interventions, Então retorna intervenções correspondentes', async () => {
      const response = await taxonomyInterventionsRoute.GET(
        jsonRequest('/api/taxonomy/interventions?q=lesões', 'GET'),
      );
      const body = (await response.json()) as Envelope<Array<{ code: string }>>;

      expect(body.data.map((i) => i.code)).toContain('3660');
    });

    it('Dado diagnóstico com ligações, Quando GET linked-terms, Então retorna resultado e intervenção sugeridos', async () => {
      const response = await linkedTermsRoute.GET(
        jsonRequest('/api/taxonomy/diagnoses/00046/linked-terms', 'GET'),
        { params: Promise.resolve({ code: '00046' }) },
      );
      const body = (await response.json()) as Envelope<{
        outcomes: Array<{ code: string }>;
        interventions: Array<{ code: string }>;
      }>;

      expect(body.data.outcomes.map((o) => o.code)).toEqual(['1101']);
      expect(body.data.interventions.map((i) => i.code)).toEqual(['3660']);
    });
  });

  it('Dado paciente, Quando POST /api/patients/:id/care-plans, Então abre plano ativo', async () => {
    const response = await patientCarePlansRoute.POST(
      jsonRequest(`/api/patients/${patientId}/care-plans`, 'POST', {}),
      context(patientId),
    );
    const body = (await response.json()) as Envelope<{
      id: string;
      status: string;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('active');
    carePlanId = body.data.id;
  });

  it('Dado paciente inexistente, Quando POST /api/patients/:id/care-plans, Então retorna 404', async () => {
    const response = await patientCarePlansRoute.POST(
      jsonRequest('/api/patients/ghost/care-plans', 'POST', {}),
      context('ghost'),
    );

    expect(response.status).toBe(404);
  });

  it('Dado plano do paciente, Quando GET /api/patients/:id/care-plans, Então lista o plano aberto', async () => {
    const response = await patientCarePlansRoute.GET(
      jsonRequest(`/api/patients/${patientId}/care-plans`, 'GET'),
      context(patientId),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.map((p) => p.id)).toContain(carePlanId);
  });

  it('Dado diagnóstico catalogado, Quando POST diagnoses, Então prescreve no formato PES', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '00046',
        type: 'real',
        relatedFactors: 'Umidade excessiva por exsudato',
        definingCharacteristics: 'Ruptura da epiderme',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<{ diagnosisCode: string }>;

    expect(response.status).toBe(200);
    expect(body.data.diagnosisCode).toBe('00046');
  });

  it('Dado diagnóstico de risco com evidência, Quando POST diagnoses, Então retorna 400', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '00046',
        type: 'risco',
        relatedFactors: 'Fator de risco',
        definingCharacteristics: 'Não deveria existir em diagnóstico de risco',
      }),
      context(carePlanId),
    );

    expect(response.status).toBe(400);
  });

  it('Dado diagnóstico de promoção da saúde com etiologia, Quando POST diagnoses, Então rejeita no schema com 400', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '00046',
        type: 'promocao-saude',
        relatedFactors: 'Não deveria existir em promoção da saúde',
        definingCharacteristics: 'Expressa desejo de aprender autocuidado',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/relatedFactors/);
  });

  it('Dado diagnóstico real com etiologia só de espaços, Quando POST diagnoses, Então rejeita no schema com 400', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '00046',
        type: 'real',
        relatedFactors: '   ',
        definingCharacteristics: 'Ruptura da epiderme',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/relatedFactors/);
  });

  it('Dado diagnóstico real sem etiologia, Quando POST diagnoses, Então rejeita no schema com 400', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '00046',
        type: 'real',
        definingCharacteristics: 'Ruptura da epiderme',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/relatedFactors/);
  });

  it('Dado código fora do catálogo, Quando POST diagnoses, Então retorna 404', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '99999',
        type: 'real',
        relatedFactors: 'x',
        definingCharacteristics: 'y',
      }),
      context(carePlanId),
    );

    expect(response.status).toBe(404);
  });

  it('Dado resultado catalogado e meta > basal, Quando POST outcomes, Então prescreve resultado', async () => {
    const response = await outcomesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/outcomes`, 'POST', {
        outcomeCode: '1101',
        baselineScore: 2,
        targetScore: 4,
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<{
      id: string;
      currentScore: number | null;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.currentScore).toBeNull();
    outcomeId = body.data.id;
  });

  it('Dado meta menor ou igual à basal, Quando POST outcomes, Então rejeita no schema com 400', async () => {
    const response = await outcomesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/outcomes`, 'POST', {
        outcomeCode: '1101',
        baselineScore: 3,
        targetScore: 3,
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Meta deve ser maior/i);
  });

  it('Dado intervenção catalogada, Quando POST interventions, Então prescreve intervenção', async () => {
    const response = await interventionsRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/interventions`, 'POST', {
        interventionCode: '3660',
        frequency: 'A cada troca de placa',
        priority: 'alta',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;

    expect(response.status).toBe(200);
    interventionId = body.data.id;
  });

  it('Dado intervenção prescrita, Quando POST records, Então registra execução', async () => {
    const response = await recordsRoute.POST(
      jsonRequest(
        `/api/care-plan-interventions/${interventionId}/records`,
        'POST',
        {
          professionalId: null,
          notes: 'Troca realizada sem intercorrências',
        },
      ),
      context(interventionId),
    );
    const body = (await response.json()) as Envelope<{
      interventionId: string;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.interventionId).toBe(interventionId);
  });

  it('Dado resultado prescrito, Quando POST evaluations com progresso parcial, Então atualiza o histórico', async () => {
    const response = await evaluationsRoute.POST(
      jsonRequest(`/api/care-plan-outcomes/${outcomeId}/evaluations`, 'POST', {
        score: 3,
      }),
      context(outcomeId),
    );
    const body = (await response.json()) as Envelope<{ score: number }>;

    expect(response.status).toBe(200);
    expect(body.data.score).toBe(3);
  });

  it('Dado plano com diagnóstico/resultado/intervenção, Quando GET /api/care-plans/:id, Então agrega tudo com progresso calculado', async () => {
    const response = await carePlanByIdRoute.GET(
      jsonRequest(`/api/care-plans/${carePlanId}`, 'GET'),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<{
      plan: { status: string };
      diagnoses: Array<{ diagnosisCode: string }>;
      outcomes: Array<{
        currentScore: number | null;
        attainment: number | null;
      }>;
      interventions: Array<{ records: Array<{ id: string }> }>;
    }>;

    expect(body.data.plan.status).toBe('active');
    expect(body.data.diagnoses).toHaveLength(1);
    expect(body.data.outcomes[0].currentScore).toBe(3);
    expect(body.data.outcomes[0].attainment).toBe(0.5);
    expect(body.data.interventions[0].records).toHaveLength(1);
  });

  it('Dado plano ativo, Quando PATCH resolve, Então status muda para resolved', async () => {
    const response = await carePlanByIdRoute.PATCH(
      jsonRequest(`/api/care-plans/${carePlanId}`, 'PATCH', {
        action: 'resolve',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<{ status: string }>;

    expect(body.data.status).toBe('resolved');
  });

  it('Dado plano resolvido, Quando POST diagnoses novamente, Então retorna 400', async () => {
    const response = await diagnosesRoute.POST(
      jsonRequest(`/api/care-plans/${carePlanId}/diagnoses`, 'POST', {
        diagnosisCode: '00046',
        type: 'promocao-saude',
        definingCharacteristics: 'Expressa desejo de aprender autocuidado',
      }),
      context(carePlanId),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/não está ativo/i);
  });
});
