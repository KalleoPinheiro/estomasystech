import { describe, expect, it, vi } from 'vitest';
import type { PatientDataExport } from '@/application/patients/load-patient-data-export';
import { Invoice } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { decodeAuditCursor } from '@/lib/audit-cursor';
import {
  assertClinicalResourceAccessible,
  type ClinicalResourceRepositories,
} from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import { toCarePlanDetailDto } from '@/lib/dto/care-plan';
import { toPartnerShareConsentDto } from '@/lib/dto/partner';
import { toPatientExportDto } from '@/lib/dto/patient-export';
import { encodeCursor } from '@/lib/pagination';
import { waitlistWithNames } from '@/lib/waitlist-names';

describe('Feature: Exportação dos dados do titular (LGPD art. 18, #293)', () => {
  it('Dado titular com consulta, fatura, pacote e termo, Quando exportar, Então cada item sai no JSON', () => {
    const patient = Patient.create({
      fullName: 'Maria da Silva',
      phone: '11999990000',
    });
    const start = new Date('2026-10-21T12:00:00Z');
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(start, new Date(start.getTime() + 3600_000)),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    });
    const invoice = Invoice.create({
      patientId: patient.id,
      description: 'Curativo',
      amount: Money.fromCents(15000),
    });
    const pkg = SessionPackage.create({
      patientId: patient.id,
      procedureId: 'proc-1',
      totalSessions: 5,
      priceCents: 50000,
    });
    const consent = ConsentRecord.create({
      patientId: patient.id,
      consentText: 'termo',
      textVersion: 'v1',
    });
    const data: PatientDataExport = {
      patient,
      guardian: null,
      anamnesis: null,
      evolutions: [],
      conditions: [],
      assessments: [],
      photos: [],
      appointments: [appointment],
      invoices: [invoice],
      consents: [consent],
      packages: [pkg],
    };

    const dto = toPatientExportDto(data);

    expect(dto.appointments).toHaveLength(1);
    expect(dto.invoices).toHaveLength(1);
    expect(dto.packages).toEqual([
      {
        id: pkg.id,
        procedureId: 'proc-1',
        totalSessions: 5,
        usedSessions: 0,
        priceCents: 50000,
      },
    ]);
    expect(dto.consents[0].signedByRelationship).toBeNull();
  });
});

describe('Feature: Plano de cuidados mostra o código quando o catálogo não tem o item', () => {
  it('Dado plano com itens fora do catálogo, Quando montar o detalhe, Então rótulos caem para os códigos e a escala fica vazia', () => {
    const plan = CarePlan.create({ patientId: 'pac-1' });
    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: plan.id,
      diagnosisCode: '00046',
      type: 'risco',
      relatedFactors: 'pressão prolongada',
    });
    const outcome = CarePlanOutcome.create({
      carePlanId: plan.id,
      outcomeCode: '1101',
      baselineScore: 2,
      targetScore: 4,
    });
    const intervention = CarePlanIntervention.create({
      carePlanId: plan.id,
      interventionCode: '3660',
      frequency: 'a cada troca',
      priority: 'alta',
    });

    const dto = toCarePlanDetailDto(
      {
        plan,
        diagnoses: [diagnosis],
        outcomes: [{ outcome, evaluations: [] }],
        interventions: [{ intervention, records: [] }],
      },
      { diagnoses: new Map(), outcomes: new Map(), interventions: new Map() },
    );

    expect(dto.diagnoses[0].diagnosisLabel).toBe('00046');
    expect(dto.outcomes[0].outcomeLabel).toBe('1101');
    expect(dto.outcomes[0].scaleAnchors).toEqual([]);
    expect(dto.interventions[0].interventionLabel).toBe('3660');
  });
});

describe('Feature: Consentimento com parceiro na ficha e no portal (#292)', () => {
  const consent = { text: 'texto', version: 'v1' };
  const partner = { fullName: 'Parceiro Ltda' } as never;

  it('Dado histórico vazio, Quando montar o DTO, Então não há aceite nem revogação', () => {
    const dto = toPartnerShareConsentDto(
      {
        partner,
        status: {
          active: false,
          current: null,
          latestAccept: null,
        },
      } as never,
      consent,
    );

    expect(dto.revoked).toBe(false);
    expect(dto.revokedAt).toBeNull();
    expect(dto.revokedBy).toBeNull();
  });

  it('Dado aceite seguido de revogação pela equipe, Quando montar o DTO, Então informa quando e quem revogou', () => {
    const accept = PartnerShareConsent.accept({
      patientId: 'pac-1',
      partnerId: 'par-1',
      consentText: 'texto',
      textVersion: 'v1',
    });
    const revoke = PartnerShareConsent.revoke({
      patientId: 'pac-1',
      partnerId: 'par-1',
      actor: 'staff',
      recordedBy: 'ana@clinica.com',
    });

    const dto = toPartnerShareConsentDto(
      {
        partner,
        status: { active: false, current: revoke, latestAccept: accept },
      } as never,
      consent,
    );

    expect(dto.revoked).toBe(true);
    expect(dto.revokedBy).toBe('staff');
    expect(dto.revokedAt).toBe(revoke.recordedAt.toISOString());
  });
});

describe('Feature: Cursor da trilha de auditoria (#322)', () => {
  it('Dado cursor com id mas sem data, Quando decodificar, Então volta à primeira página', () => {
    expect(decodeAuditCursor(encodeCursor({ id: 'evt-1' }))).toBeNull();
  });
});

describe('Feature: Fila de espera com nomes (sem N+1)', () => {
  it('Dado procedimento da fila que foi removido do catálogo, Quando montar, Então o nome do procedimento é nulo', async () => {
    const entry = WaitlistEntry.create({
      patientId: 'pac-1',
      procedureId: 'proc-removido',
      fromDate: '2026-11-01',
      toDate: '2026-11-10',
      source: 'staff',
    });
    const services = {
      patients: { findByIds: vi.fn(async () => []) },
      procedures: { findAll: vi.fn(async () => []) },
    };

    const [dto] = await waitlistWithNames(services as never, [entry]);

    expect(dto.procedureName).toBeNull();
  });
});

describe('Feature: Escopo do profissional em recurso clínico (R4)', () => {
  it('Dado falha do banco ao checar o vínculo, Quando o profissional abre o recurso, Então o erro real propaga (não vira 404)', async () => {
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'prof@x.com',
      role: 'profissional',
      clinicId: 'c-1',
      professionalId: 'prof-1',
    };
    const repos = {
      conditions: {
        findById: async () => ({ id: 'cond-1', patientId: 'pac-1' }),
      },
      professionalPatientLinks: {
        hasLink: async () => {
          throw new Error('banco fora do ar');
        },
      },
    } as unknown as ClinicalResourceRepositories;

    const attempt = assertClinicalResourceAccessible(
      session,
      'condition',
      'cond-1',
      repos,
    );

    await expect(attempt).rejects.toThrow('banco fora do ar');
    await expect(attempt).rejects.not.toBeInstanceOf(NotFoundError);
  });
});
