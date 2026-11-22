import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { NursingPrescription } from '@/domain/clinical/nursing-prescription';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { PrescriptionDocument } from '@/lib/documents/prescription-pdf';
import { buildPatient, buildProfessional } from '../../support/builders';
import { ensureClinic } from '../../support/clinics';
import { validCnpj } from '../../support/cnpj';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Receituário emitido e congelado (#956, ADR-116): emitir grava o que vai
 * impresso; baixar desenha do gravado, nunca do plano atual. O desenho é
 * trocado por um espião para conferir o documento inteiro que chega a ele.
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

const sessionOf = (
  clinicId: string,
  role: Session['role'] = 'company_admin',
): Session => ({
  expiresAtMs: Date.now() + 3_600_000,
  subject: 'admin@clinica.com',
  role,
  clinicId,
  professionalId: null,
});

let lib: typeof import('@/lib/server/prescription');

async function addIntervention(
  clinicId: string,
  carePlanId: string,
  code: string,
  frequency: string,
) {
  const repos = await getRepositories(clinicScope(clinicId));
  await repos.carePlanInterventions.save(
    CarePlanIntervention.create({
      carePlanId,
      interventionCode: code,
      frequency,
      priority: 'media',
    }),
  );
}

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
    await addIntervention(
      clinicId,
      plan.id,
      `99${i}`,
      frequencies[i] as string,
    );
  }
  return { planId: plan.id, patientId: patient.id };
}

const emissionsOf = async (resourceId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(CLINIC));
  return (
    await auditEvents.findAll({ resourceType: 'receituario', resourceId })
  ).filter((event) => event.action === 'create');
};

beforeAll(async () => {
  lib = await import('@/lib/server/prescription');
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

describe('Feature: receituário emitido e congelado (#956, ADR-116)', () => {
  it('Dado plano com profissional, Quando emite com observações e baixa, Então o PDF leva o gravado, o timbre e o número RCT', async () => {
    const { planId, patientId } = await seedPlan(CLINIC, {
      professional: 'saved',
    });

    const issued = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      '  Manter a pele seca.  ',
    );
    const pdf = await lib.renderPrescriptionFor(
      sessionOf(CLINIC),
      planId,
      issued.id,
    );

    const doc = rendered[0] as PrescriptionDocument;
    expect(issued.documentNumber).toMatch(/^RCT-[0-9A-F]{8}$/);
    expect(issued.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pdf).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: `receituario-${issued.documentNumber}.pdf`,
    });
    expect(doc).toEqual({
      issuer: {
        name: `Clínica ${CLINIC}`,
        document: { label: 'CNPJ', value: CNPJ },
        registry: null,
        address: 'Rua das Flores, 10',
      },
      city: 'Campinas',
      patientName: 'Maria das Dores',
      items: expect.arrayContaining([
        { label: '990', frequency: 'a cada troca de curativo' },
        { label: '991', frequency: 'diária' },
      ]),
      freeText: 'Manter a pele seca.',
      signer: { name: 'Enf. Ana Lima', registry: 'COREN-SP 123456' },
      issuedOn: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/),
      documentNumber: issued.documentNumber,
    });
    expect(doc.items).toHaveLength(2);

    const [emission, ...others] = await emissionsOf(issued.id);
    expect(others).toHaveLength(0);
    expect(emission).toMatchObject({
      actorId: 'admin@clinica.com',
      actorRole: 'company_admin',
      patientId,
      detail: 'emissão de documento',
    });
  });

  it('Dado receituário emitido, Quando emite de novo sem mudar nada, Então devolve o mesmo número e não audita outra vez', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });

    const first = await lib.issuePrescriptionFor(sessionOf(CLINIC), planId, '');
    const again = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      null,
    );

    expect(again).toEqual(first);
    expect(await lib.listPrescriptionsFor(sessionOf(CLINIC), planId)).toEqual([
      first,
    ]);
    expect(await emissionsOf(first.id)).toHaveLength(1);
  });

  it('Dado plano alterado depois da emissão, Quando emite, Então sai outro número e o antigo continua desenhando o conteúdo de antes', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });
    const before = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      null,
    );
    await addIntervention(CLINIC, planId, '777', 'semanal');

    const after = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      null,
    );
    await lib.renderPrescriptionFor(sessionOf(CLINIC), planId, before.id);

    expect(after.documentNumber).not.toBe(before.documentNumber);
    expect(rendered[0]?.items).toEqual([
      { label: '990', frequency: 'a cada troca de curativo' },
    ]);
    expect(rendered[0]?.documentNumber).toBe(before.documentNumber);
    const listed = await lib.listPrescriptionsFor(sessionOf(CLINIC), planId);
    expect(listed.map((item) => item.id).sort()).toEqual(
      [before.id, after.id].sort(),
    );
  });

  it('Dadas observações diferentes, Quando emite, Então é outro receituário', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });

    const first = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      'A',
    );
    const second = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      'B',
    );

    expect(second.id).not.toBe(first.id);
  });

  it('Dado plano sem profissional, Quando emite, Então assina o responsável técnico', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });

    const issued = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      planId,
      null,
    );
    await lib.renderPrescriptionFor(sessionOf(CLINIC), planId, issued.id);

    expect(rendered[0]?.signer).toEqual({
      name: 'Resp. Técnica',
      registry: 'COREN-SP 999999',
    });
    expect(rendered[0]?.freeText).toBeNull();
  });

  it('Dado Atendente, Quando emite, Então 403 sem gravar', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });

    const attempt = lib.issuePrescriptionFor(
      sessionOf(CLINIC, 'atendente'),
      planId,
      null,
    );

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(
      'Receituário é emitido só por Admin ou Profissional',
    );
    expect(await lib.listPrescriptionsFor(sessionOf(CLINIC), planId)).toEqual(
      [],
    );
  });

  it('Dado plano sem intervenção, Quando emite, Então recusa sem gravar', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 0 });

    await expect(
      lib.issuePrescriptionFor(sessionOf(CLINIC), planId, null),
    ).rejects.toThrow(
      'Este plano de cuidados ainda não tem intervenção prescrita: não é possível emitir o receituário vazio.',
    );
    expect(await lib.listPrescriptionsFor(sessionOf(CLINIC), planId)).toEqual(
      [],
    );
  });

  it('Dada empresa sem cadastro completo, Quando emite, Então recusa pedindo os dados cadastrais', async () => {
    const { planId } = await seedPlan(BARE_CLINIC, { interventions: 1 });

    await expect(
      lib.issuePrescriptionFor(sessionOf(BARE_CLINIC), planId, null),
    ).rejects.toThrow(
      'Complete os dados cadastrais (CNPJ ou CPF, responsável técnico e registro) em Configurações antes de emitir o receituário.',
    );
  });

  it('Dado receituário de outro plano, Quando baixa por este plano, Então não encontra', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });
    const other = await seedPlan(CLINIC, { interventions: 1 });
    const issued = await lib.issuePrescriptionFor(
      sessionOf(CLINIC),
      other.planId,
      null,
    );

    const attempt = lib.renderPrescriptionFor(
      sessionOf(CLINIC),
      planId,
      issued.id,
    );

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({ entity: 'Receituário' });
    await expect(
      lib.renderPrescriptionFor(sessionOf(CLINIC), planId, 'inexistente'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(rendered).toHaveLength(0);
  });

  it('Dado plano de outra empresa, Quando lista, Então não encontra (não uma lista vazia)', async () => {
    const { planId } = await seedPlan(CLINIC, { interventions: 1 });

    const attempt = lib.listPrescriptionsFor(sessionOf(BARE_CLINIC), planId);

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({
      entity: 'Plano de cuidados',
    });
  });

  it('Dado receituário anonimizado pela retenção, Quando baixa, Então recusa dizendo que o conteúdo saiu', async () => {
    const { planId, patientId } = await seedPlan(CLINIC, { interventions: 1 });
    const repos = await getRepositories(clinicScope(CLINIC));
    const anonymized = NursingPrescription.restore({
      id: 'rct-anonimizado-1',
      carePlanId: planId,
      patientId,
      issuedBy: 'admin@clinica.com',
      issuedAt: new Date('2026-01-10T12:00:00Z'),
      content: null,
    });
    await repos.nursingPrescriptions.save(anonymized);

    await expect(
      lib.renderPrescriptionFor(sessionOf(CLINIC), planId, anonymized.id),
    ).rejects.toThrow(
      'O conteúdo deste receituário foi removido pela retenção de dados.',
    );
    expect(rendered).toHaveLength(0);
  });
  it('Dado paciente anonimizado pela retenção durante a emissão, Quando grava, Então recusa com 404 e não guarda o nome', async () => {
    const { planId, patientId } = await seedPlan(CLINIC);
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const { sql } = await import('drizzle-orm');
    const db = await getDb();
    await db.execute(
      sql`UPDATE patients SET anonymized_at = now() WHERE id = ${patientId}`,
    );

    await expect(
      lib.issuePrescriptionFor(sessionOf(CLINIC), planId, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    const { nursingPrescriptions } = await getRepositories(clinicScope(CLINIC));
    expect(await nursingPrescriptions.findByCarePlanId(planId)).toHaveLength(0);
  });
});
