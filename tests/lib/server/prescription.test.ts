import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { PrescriptionDocument } from '@/lib/documents/prescription-pdf';
import { buildPatient, buildProfessional } from '../../support/builders';
import { ensureClinic } from '../../support/clinics';
import { validCnpj } from '../../support/cnpj';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Montagem do receituário (#956): o que entra no PDF sai só do plano, do
 * cadastro da empresa e da emissão auditada. O desenho é trocado por um espião
 * para conferir o documento inteiro que chega a ele.
 */

const rendered: PrescriptionDocument[] = [];
vi.mock('@/lib/documents/prescription-pdf', async (original) => {
  const actual =
    await original<typeof import('@/lib/documents/prescription-pdf')>();
  return {
    ...actual,
    renderPrescriptionPdf: async (doc: PrescriptionDocument) => {
      rendered.push(doc);
      return new Uint8Array([1, 2, 3]);
    },
  };
});

const CLINIC = 'clinica-receituario-montagem';
const BARE_CLINIC = 'clinica-receituario-sem-cadastro';
const CNPJ = validCnpj('556677880001');

const sessionOf = (clinicId: string): Session => ({
  expiresAtMs: Date.now() + 3_600_000,
  subject: 'admin@clinica.com',
  role: 'company_admin',
  clinicId,
  professionalId: null,
});

let build: typeof import('@/lib/server/prescription').buildPrescriptionPdfFor;

async function seedPlan(
  clinicId: string,
  options: { interventions?: number; professional?: 'saved' } = {},
) {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient({ fullName: 'Maria das Dores' });
  await repos.patients.save(patient);
  let professionalId: string | undefined;
  if (options.professional === 'saved') {
    const professional = buildProfessional({
      fullName: 'Enf. Ana Lima',
      registry: 'COREN-SP 123456',
    });
    await repos.professionals.save(professional);
    professionalId = professional.id;
  }
  const plan = CarePlan.create({ patientId: patient.id, professionalId });
  await repos.carePlans.save(plan);
  const frequencies = ['a cada troca de curativo', 'diária'];
  for (let i = 0; i < (options.interventions ?? 2); i += 1) {
    await repos.carePlanInterventions.save(
      CarePlanIntervention.create({
        carePlanId: plan.id,
        interventionCode: `99${i}`,
        frequency: frequencies[i] as string,
        priority: 'media',
      }),
    );
  }
  return plan.id;
}

beforeAll(async () => {
  build = (await import('@/lib/server/prescription')).buildPrescriptionPdfFor;
  await ensureClinic(CLINIC);
  await ensureClinic(BARE_CLINIC);
  const { clinics } = await getRepositories(clinicScope(CLINIC));
  const clinic = await clinics.findById(CLINIC);
  await clinics.update(
    (clinic as NonNullable<typeof clinic>).updateInfo({
      cnpj: CNPJ,
      address: 'Rua das Flores, 10',
      city: 'Campinas',
      professionalName: 'Resp. Técnica',
      professionalRegistry: 'COREN-SP 999999',
    }),
  );
});

beforeEach(() => {
  rendered.length = 0;
});

describe('Feature: montagem do receituário (#956)', () => {
  it('Dado plano com profissional e duas intervenções, Quando monta, Então o documento leva só o prescrito, o timbre e a emissão RCT', async () => {
    const planId = await seedPlan(CLINIC, { professional: 'saved' });

    const pdf = await build(sessionOf(CLINIC), planId);

    const doc = rendered[0] as PrescriptionDocument;
    expect(pdf.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(doc.documentNumber).toMatch(/^RCT-[0-9A-F]{8}$/);
    expect(pdf.fileName).toBe(`receituario-${doc.documentNumber}.pdf`);
    expect(doc).toEqual({
      issuer: {
        name: `Clínica ${CLINIC}`,
        document: { label: 'CNPJ', value: CNPJ },
        registry: null,
        address: 'Rua das Flores, 10',
      },
      patientName: 'Maria das Dores',
      items: expect.arrayContaining([
        { label: '990', frequency: 'a cada troca de curativo' },
        { label: '991', frequency: 'diária' },
      ]),
      issuedOn: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
      city: 'Campinas',
      documentNumber: doc.documentNumber,
      signer: { name: 'Enf. Ana Lima', registry: 'COREN-SP 123456' },
    });
    expect(doc.items).toHaveLength(2);

    const { auditEvents } = await getRepositories(clinicScope(CLINIC));
    const emissions = (
      await auditEvents.findAll({
        resourceType: 'receituario',
        resourceId: planId,
      })
    ).filter((event) => event.action === 'create');
    expect(emissions).toHaveLength(1);
  });

  it('Dado plano sem profissional, Quando monta, Então assina o responsável técnico', async () => {
    const planId = await seedPlan(CLINIC, { interventions: 1 });

    await build(sessionOf(CLINIC), planId);

    expect(rendered[0]?.signer).toEqual({
      name: 'Resp. Técnica',
      registry: 'COREN-SP 999999',
    });
  });

  it('Dado plano sem intervenção, Quando monta, Então recusa sem emitir nem desenhar', async () => {
    const planId = await seedPlan(CLINIC, { interventions: 0 });

    await expect(build(sessionOf(CLINIC), planId)).rejects.toThrow(
      'Este plano de cuidados ainda não tem intervenção prescrita: não é possível emitir o receituário vazio.',
    );
    expect(rendered).toHaveLength(0);
    const { auditEvents } = await getRepositories(clinicScope(CLINIC));
    expect(
      await auditEvents.findAll({
        resourceType: 'receituario',
        resourceId: planId,
      }),
    ).toHaveLength(0);
  });

  it('Dada empresa sem cadastro completo, Quando monta, Então recusa pedindo os dados cadastrais', async () => {
    const planId = await seedPlan(BARE_CLINIC, { interventions: 1 });

    await expect(build(sessionOf(BARE_CLINIC), planId)).rejects.toThrow(
      'Complete os dados cadastrais (CNPJ ou CPF, responsável técnico e registro) em Configurações antes de emitir o receituário.',
    );
    expect(rendered).toHaveLength(0);
  });
});
