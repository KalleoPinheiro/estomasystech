import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { PlanProposalDocument } from '@/lib/documents/plan-proposal-pdf';
import {
  buildAppointment,
  buildPatient,
  buildProcedure,
} from '../../support/builders';
import { ensureClinic } from '../../support/clinics';
import { validCnpj } from '../../support/cnpj';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const rendered: PlanProposalDocument[] = [];
vi.mock('@/lib/documents/plan-proposal-pdf', () => ({
  renderPlanProposalPdf: async (doc: PlanProposalDocument) => {
    rendered.push(doc);
    return new Uint8Array([1, 2, 3]);
  },
}));

const CLINIC = 'clinica-proposta-plano';
const BARE_CLINIC = 'clinica-proposta-sem-cadastro';

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

const terms = {
  objective: 'Cicatrizar a lesão',
  totalSessions: 4,
  priceCents: 100_000,
};

let seq = 0;
let lib: typeof import('@/lib/server/plan-proposal');

const hoursFromNow = (hours: number) =>
  new Date(Date.now() + hours * 3_600_000);

async function seed(clinicId: string) {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient({ fullName: 'Maria das Dores' });
  await repos.patients.save(patient);
  seq += 1;
  const procedure = buildProcedure({
    name: seq === 1 ? 'Curativo' : `Curativo ${seq}`,
    priceCents: 30_000,
  });
  await repos.procedures.save(procedure);
  return { patientId: patient.id, procedureId: procedure.id, repos };
}

const emissionsOf = async (patientId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(CLINIC));
  return (
    await auditEvents.findAll({
      resourceType: 'proposta-plano',
      resourceId: patientId,
    })
  ).filter((event) => event.action === 'create');
};

beforeAll(async () => {
  lib = await import('@/lib/server/plan-proposal');
  await ensureClinic(CLINIC);
  await ensureClinic(BARE_CLINIC);
  const { clinics } = await getRepositories(clinicScope(CLINIC));
  const clinic = await clinics.findById(CLINIC);
  await clinics.update(
    (clinic as NonNullable<typeof clinic>).updateInfo({
      cnpj: validCnpj('667788990001'),
      city: 'Campinas',
      professionalName: 'Resp. Técnica',
      professionalRegistry: 'COREN-SP 999999',
    }),
  );
});

describe('Feature: gerar a proposta do plano (#964)', () => {
  it('monta o documento com preço avulso, próxima consulta e validade, e audita a emissão', async () => {
    const { patientId, procedureId, repos } = await seed(CLINIC);
    const later = buildAppointment({
      patientId,
      slot: TimeSlot.create(hoursFromNow(72), hoursFromNow(73)),
    });
    const sooner = buildAppointment({
      patientId,
      slot: TimeSlot.create(hoursFromNow(48), hoursFromNow(49)),
    });
    const cancelled = buildAppointment({
      patientId,
      slot: TimeSlot.create(hoursFromNow(24), hoursFromNow(25)),
    }).cancel();
    for (const appointment of [later, sooner, cancelled]) {
      await repos.appointments.save(appointment);
    }

    const pdf = await lib.renderPlanProposalFor(sessionOf(CLINIC), {
      ...terms,
      patientId,
      procedureId,
      reassessmentOn: '2026-12-20',
    });

    expect(pdf.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(pdf.fileName).toMatch(/^proposta-plano-\d{4}-\d{2}-\d{2}\.pdf$/);
    const doc = rendered.at(-1) as PlanProposalDocument;
    expect(doc).toMatchObject({
      city: 'Campinas',
      patientName: 'Maria das Dores',
      procedureName: 'Curativo',
      singlePriceCents: 30_000,
      reassessmentOn: '20/12/2026',
      signer: { name: 'Resp. Técnica', registry: 'COREN-SP 999999' },
    });
    expect(doc.terms.pricePerSessionCents).toBe(25_000);
    expect(doc.issuedOn).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(doc.validUntil).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(doc.validUntil).not.toBe(doc.issuedOn);
    expect(doc.nextAppointment).toContain(
      sooner.slot.start.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      }),
    );
    expect(await emissionsOf(patientId)).toHaveLength(1);
  });

  it('sem consulta futura nem reavaliação, as linhas ficam vazias', async () => {
    const { patientId, procedureId } = await seed(CLINIC);
    await lib.renderPlanProposalFor(sessionOf(CLINIC), {
      ...terms,
      patientId,
      procedureId,
    });
    const doc = rendered.at(-1) as PlanProposalDocument;
    expect(doc.nextAppointment).toBeNull();
    expect(doc.reassessmentOn).toBeNull();
  });

  it('só o Admin gera', async () => {
    const { patientId, procedureId } = await seed(CLINIC);
    for (const role of ['atendente', 'profissional'] as const) {
      await expect(
        lib.renderPlanProposalFor(sessionOf(CLINIC, role), {
          ...terms,
          patientId,
          procedureId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await emissionsOf(patientId)).toHaveLength(0);
  });

  it('exige cadastro da clínica completo', async () => {
    const { patientId, procedureId } = await seed(BARE_CLINIC);
    await expect(
      lib.renderPlanProposalFor(sessionOf(BARE_CLINIC), {
        ...terms,
        patientId,
        procedureId,
      }),
    ).rejects.toThrow(lib.PROPOSAL_CLINIC_INCOMPLETE_MESSAGE);
  });

  it('valida os termos antes de ler o banco', async () => {
    await expect(
      lib.renderPlanProposalFor(sessionOf(CLINIC), {
        ...terms,
        objective: '',
        patientId: 'x',
        procedureId: 'y',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('paciente ou procedimento de outra clínica responde não encontrado e nada é auditado', async () => {
    const other = await seed(BARE_CLINIC);
    const mine = await seed(CLINIC);
    await expect(
      lib.renderPlanProposalFor(sessionOf(CLINIC), {
        ...terms,
        patientId: other.patientId,
        procedureId: mine.procedureId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      lib.renderPlanProposalFor(sessionOf(CLINIC), {
        ...terms,
        patientId: mine.patientId,
        procedureId: other.procedureId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await emissionsOf(mine.patientId)).toHaveLength(0);
  });

  it('paciente anonimizado não recebe proposta', async () => {
    const { patientId, procedureId } = await seed(CLINIC);
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const { sql } = await import('drizzle-orm');
    await (await getDb()).execute(
      sql`UPDATE patients SET anonymized_at = now() WHERE id = ${patientId}`,
    );
    await expect(
      lib.renderPlanProposalFor(sessionOf(CLINIC), {
        ...terms,
        patientId,
        procedureId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
