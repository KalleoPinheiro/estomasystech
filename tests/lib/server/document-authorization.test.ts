import { beforeAll, describe, expect, it } from 'vitest';
import { CommissionPayout } from '@/domain/billing/commission-payout';
import { Invoice } from '@/domain/billing/invoice';
import { CarePlan } from '@/domain/clinical/care-plan';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope, writeScope } from '@/lib/auth/tenant-scope';
import { authorizeDocumentIssuance } from '@/lib/server/document-authorization';
import {
  DOCUMENT_TYPES,
  type DocumentType,
  issueDocumentFor,
} from '@/lib/server/document-issuance';
import {
  buildAppointment,
  buildPatient,
  buildProfessional,
} from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (
  role: Session['role'],
  clinicId: string,
  professionalId: string | null = null,
) =>
  ({
    role,
    subject: `${role}@clinica.com`,
    clinicId,
    professionalId,
  }) as unknown as Session;

interface Target {
  resourceId: string;
  invoiceId?: string;
}

let slotIndex = 0;

/** Um recurso de cada tipo de documento, todos do mesmo paciente da empresa A. */
async function seed(options: { linked: boolean }) {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const professional = buildProfessional();
  await repos.professionals.save(professional);
  const patient = buildPatient();
  await repos.patients.save(patient);
  if (options.linked) {
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
  }
  slotIndex += 1;
  const start = new Date(Date.UTC(2027, 0, 1, 8) + slotIndex * 3_600_000);
  const appointment = buildAppointment({
    patientId: patient.id,
    slot: TimeSlot.create(start, new Date(start.getTime() + 1_800_000)),
  });
  await repos.appointments.save(appointment);
  const condition = ClinicalCondition.create({
    patientId: patient.id,
    kind: 'wound',
    title: 'Ferida sacral',
  });
  await repos.conditions.save(condition);
  const carePlan = CarePlan.create({ patientId: patient.id });
  await repos.carePlans.save(carePlan);
  const invoice = Invoice.create({
    patientId: patient.id,
    description: 'Consulta',
    amount: Money.fromCents(25_000),
    appointmentId: appointment.id,
  });
  await repos.invoices.save(invoice);
  const own = CommissionPayout.create({
    professionalId: professional.id,
    period: '2027-01',
    paidAt: new Date('2027-02-05T12:00:00'),
    paymentMethod: 'pix',
    createdBy: 'admin@clinica.com',
    rule: { kind: 'percentage', pct: 40 },
    items: [
      {
        appointmentId: appointment.id,
        kind: 'session',
        procedure: 'Curativo',
        sessionDate: start,
        baseCents: 15_000,
        commissionCents: 6_000,
      },
    ],
  });
  await repos.commissionPayouts.save(own);

  const targets: Record<DocumentType, Target> = {
    atestado: { resourceId: appointment.id },
    consentimento: { resourceId: patient.id },
    'plano-cuidados': { resourceId: carePlan.id },
    relatorio: { resourceId: condition.id },
    recibo: { resourceId: 'pagamento-qualquer', invoiceId: invoice.id },
    repasse: { resourceId: own.id },
  };
  return { professional, targets };
}

const authorize = (
  who: Session,
  type: DocumentType,
  target: Target,
  clinicId: string = CLINIC_A_ID,
) => authorizeDocumentIssuance(who, clinicScope(clinicId), type, target);

const MISSING: Target = {
  resourceId: 'nao-existe',
  invoiceId: 'fatura-que-nao-existe',
};

const LABEL: Record<DocumentType, string> = {
  atestado: 'Consulta',
  consentimento: 'Paciente',
  'plano-cuidados': 'Plano de cuidados',
  relatorio: 'Condição',
  recibo: 'Fatura',
  repasse: 'Repasse',
};

beforeAll(async () => {
  await ensureTestClinics();
});

describe.each(DOCUMENT_TYPES)(
  'Feature: R4 na emissão do documento «%s» (#636, ADR-089)',
  (type) => {
    it('Dado Profissional vinculado ao recurso, Quando emite, Então a emissão segue (sem erro)', async () => {
      const { professional, targets } = await seed({ linked: true });

      await expect(
        authorize(
          session('profissional', CLINIC_A_ID, professional.id),
          type,
          targets[type],
        ),
      ).resolves.toBeUndefined();
    });

    it('Dado Profissional sem vínculo com o recurso, Quando emite, Então 403', async () => {
      const { targets } = await seed({ linked: false });
      const stranger = buildProfessional();

      const err = await authorize(
        session('profissional', CLINIC_A_ID, stranger.id),
        type,
        targets[type],
      ).catch((e) => e);

      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('Dado Profissional sem professionalId na sessão, Quando emite, Então 403', async () => {
      const { targets } = await seed({ linked: true });

      const err = await authorize(
        session('profissional', CLINIC_A_ID, null),
        type,
        targets[type],
      ).catch((e) => e);

      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('Dado recurso inexistente, Quando o Profissional emite, Então 404 sem vazar o id', async () => {
      const err = await authorize(
        session('profissional', CLINIC_A_ID, 'qualquer'),
        type,
        MISSING,
      ).catch((e) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.entity).toBe(LABEL[type]);
      expect(err.message).not.toContain('nao-existe');
    });

    it('Dado recurso de outra empresa, Quando o Profissional da empresa B emite, Então 404', async () => {
      const { professional, targets } = await seed({ linked: true });

      const err = await authorize(
        session('profissional', CLINIC_B_ID, professional.id),
        type,
        targets[type],
        CLINIC_B_ID,
      ).catch((e) => e);

      expect(err).toBeInstanceOf(NotFoundError);
    });

    it.each(['company_admin', 'atendente'] as const)(
      'Dado %s, Quando emite, Então a regra do vínculo não se aplica (sem mudança)',
      async (role) => {
        const { targets } = await seed({ linked: false });

        await expect(
          authorize(session(role, CLINIC_A_ID), type, targets[type]),
        ).resolves.toBeUndefined();
      },
    );
  },
);

describe('Feature: casos particulares da R4 na emissão (#636)', () => {
  it('Dado repasse de outro profissional, Quando o Profissional emite, Então 403 (próprio repasse só)', async () => {
    const { targets } = await seed({ linked: true });
    const other = buildProfessional();

    const err = await authorize(
      session('profissional', CLINIC_A_ID, other.id),
      'repasse',
      targets.repasse,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toBe(
      'Profissional só pode emitir o próprio comprovante de repasse',
    );
  });

  it('Dado recibo sem fatura, Quando o Profissional emite, Então a guarda cede e a emissão responde 400', async () => {
    const { professional } = await seed({ linked: true });
    const who = session('profissional', CLINIC_A_ID, professional.id);

    await expect(
      authorize(who, 'recibo', { resourceId: 'pagamento' }),
    ).resolves.toBeUndefined();
  });

  it('Dado Profissional sem vínculo, Quando a emissão é negada, Então nada é gravado (sem evento de emissão)', async () => {
    const { targets } = await seed({ linked: false });
    const who = session('profissional', CLINIC_A_ID, buildProfessional().id);
    const { resourceId } = targets.atestado;

    await expect(
      issueDocumentFor(who, { documentType: 'atestado', resourceId }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const { auditEvents } = await getRepositories(writeScope(who));
    expect(await auditEvents.findAll({ resourceId })).toHaveLength(0);
  });

  it('Dado Profissional vinculado, Quando emite o atestado duas vezes, Então grava uma só emissão e devolve o mesmo número', async () => {
    const { professional, targets } = await seed({ linked: true });
    const who = session('profissional', CLINIC_A_ID, professional.id);
    const { resourceId } = targets.atestado;

    const first = await issueDocumentFor(who, {
      documentType: 'atestado',
      resourceId,
    });
    const again = await issueDocumentFor(who, {
      documentType: 'atestado',
      resourceId,
    });

    expect(again).toEqual(first);
    const { auditEvents } = await getRepositories(writeScope(who));
    expect(await auditEvents.findAll({ resourceId })).toHaveLength(1);
  });
});
