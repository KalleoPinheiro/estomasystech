import { beforeAll, describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_INCOMPLETE_MESSAGE,
  EMPTY_PRESCRIPTION_MESSAGE,
} from '@/lib/server/prescription';
import { buildPatient, buildProfessional } from '../support/builders';
import {
  CLINIC_B_ID,
  ensureClinic,
  ensureTestClinics,
} from '../support/clinics';
import { validCnpj } from '../support/cnpj';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Receituário de enfermagem em PDF (#956): sai do plano de cuidados, no escopo
 * da empresa, com emissão auditada e idempotente, sem cache compartilhado.
 */

const CLINIC = 'clinica-receituario';
const INCOMPLETE_CLINIC = 'clinica-receituario-incompleta';

let route: typeof import('@/app/api/care-plans/[id]/receituario/route');

const context = (id: string) => ({ params: Promise.resolve({ id }) });

const download = (id: string, headers: Record<string, string>) =>
  route.GET(
    jsonRequest(`/api/care-plans/${id}/receituario`, 'GET', undefined, headers),
    context(id),
  );

async function seedPlan(
  clinicId: string,
  options: { interventions?: number; withProfessional?: boolean } = {},
): Promise<string> {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient({ fullName: 'Maria das Dores' });
  await repos.patients.save(patient);
  let professionalId: string | undefined;
  if (options.withProfessional) {
    const professional = buildProfessional({
      fullName: 'Enf. Ana Lima',
      registry: 'COREN-SP 123456',
    });
    await repos.professionals.save(professional);
    professionalId = professional.id;
  }
  const plan = CarePlan.create({ patientId: patient.id, professionalId });
  await repos.carePlans.save(plan);
  for (let i = 0; i < (options.interventions ?? 1); i += 1) {
    await repos.carePlanInterventions.save(
      CarePlanIntervention.create({
        carePlanId: plan.id,
        interventionCode: '3660',
        frequency: 'a cada troca de curativo',
        priority: 'alta',
      }),
    );
  }
  return plan.id;
}

const emissionsOf = async (clinicId: string, resourceId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  return (
    await auditEvents.findAll({ resourceType: 'receituario', resourceId })
  ).filter((event) => event.action === 'create');
};

beforeAll(async () => {
  route = await import('@/app/api/care-plans/[id]/receituario/route');
  await ensureTestClinics();
  await ensureClinic(CLINIC);
  await ensureClinic(INCOMPLETE_CLINIC);
  const { clinics } = await getRepositories(clinicScope(CLINIC));
  const clinic = await clinics.findById(CLINIC);
  await clinics.update(
    (clinic as NonNullable<typeof clinic>).updateInfo({
      cnpj: validCnpj('445566770001'),
      city: 'São Paulo',
      professionalName: 'Resp. Técnica',
      professionalRegistry: 'COREN-SP 999999',
    }),
  );
});

describe('Feature: Receituário de enfermagem em PDF (#956)', () => {
  it('Dado plano com intervenção, Quando o Admin baixa, Então recebe o PDF sem cache e a emissão é auditada uma vez', async () => {
    const planId = await seedPlan(CLINIC, { withProfessional: true });

    const first = await download(planId, adminCookieHeader(CLINIC));
    const bytes = new Uint8Array(await first.arrayBuffer());

    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/pdf');
    expect(first.headers.get('cache-control')).toContain('no-store');
    expect(first.headers.get('content-disposition')).toMatch(
      /^attachment; filename="receituario-RCT-[0-9A-F]{8}\.pdf"$/,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const again = await download(planId, adminCookieHeader(CLINIC));
    expect(again.headers.get('content-disposition')).toBe(
      first.headers.get('content-disposition'),
    );
    expect(await emissionsOf(CLINIC, planId)).toHaveLength(1);
  });

  it('Dado plano sem profissional, Quando baixa, Então assina o responsável técnico e gera o PDF', async () => {
    const planId = await seedPlan(CLINIC);

    const response = await download(planId, adminCookieHeader(CLINIC));

    expect(response.status).toBe(200);
  });

  it('Dado plano sem intervenção, Quando baixa, Então recusa com 400 e não emite', async () => {
    const planId = await seedPlan(CLINIC, { interventions: 0 });

    const response = await download(planId, adminCookieHeader(CLINIC));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(EMPTY_PRESCRIPTION_MESSAGE);
    expect(await emissionsOf(CLINIC, planId)).toHaveLength(0);
  });

  it('Dado clínica sem cadastro completo, Quando baixa, Então recusa com 400', async () => {
    const planId = await seedPlan(INCOMPLETE_CLINIC);

    const response = await download(
      planId,
      adminCookieHeader(INCOMPLETE_CLINIC),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(CLINIC_INCOMPLETE_MESSAGE);
  });

  it('Dado plano de outra empresa, Quando baixa, Então responde 404', async () => {
    const planId = await seedPlan(CLINIC);

    const response = await download(planId, adminCookieHeader(CLINIC_B_ID));

    expect(response.status).toBe(404);
    expect(await emissionsOf(CLINIC, planId)).toHaveLength(0);
  });

  it('Dado Atendente, Quando baixa, Então responde 403 (rota clínica)', async () => {
    const planId = await seedPlan(CLINIC);

    const response = await download(
      planId,
      cookieHeaderFor('atendente', undefined, CLINIC),
    );

    expect(response.status).toBe(403);
  });

  it('Dado Profissional sem vínculo com o paciente, Quando baixa, Então responde 404', async () => {
    const planId = await seedPlan(CLINIC);

    const response = await download(
      planId,
      cookieHeaderFor('profissional', undefined, CLINIC, 'prof-sem-vinculo'),
    );

    expect(response.status).toBe(404);
  });

  it('Dado requisição sem sessão, Quando baixa, Então responde 401', async () => {
    const response = await route.GET(
      jsonRequest('/api/care-plans/x/receituario', 'GET', undefined, {
        cookie: '',
      }),
      context('x'),
    );

    expect(response.status).toBe(401);
  });
});
