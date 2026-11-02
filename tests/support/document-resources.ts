import { CommissionPayout } from '@/domain/billing/commission-payout';
import { CarePlan } from '@/domain/clinical/care-plan';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { DocumentType } from '@/lib/server/document-issuance';
import { buildAppointment, buildPatient, buildProfessional } from './builders';

let slotIndex = 0;

/**
 * Semeia o recurso que o documento do tipo `type` exige (#674): a emissão
 * resolve o recurso no escopo da empresa antes de gravar. Devolve o
 * `resourceId` do recurso novo, da empresa `clinicId`.
 */
export async function seedDocumentResource(
  type: Exclude<DocumentType, 'recibo'>,
  clinicId: string,
): Promise<string> {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient();
  await repos.patients.save(patient);
  if (type === 'consentimento') return patient.id;

  const professional = buildProfessional();
  await repos.professionals.save(professional);
  slotIndex += 1;
  const start = new Date(Date.UTC(2028, 0, 1, 8) + slotIndex * 3_600_000);
  const appointment = buildAppointment({
    patientId: patient.id,
    professionalId: professional.id,
    slot: TimeSlot.create(start, new Date(start.getTime() + 1_800_000)),
  });
  if (type === 'atestado') {
    await repos.appointments.save(appointment);
    return appointment.id;
  }
  if (type === 'relatorio') {
    const condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: 'wound',
      title: 'Ferida sacral',
    });
    await repos.conditions.save(condition);
    return condition.id;
  }
  if (type === 'plano-cuidados') {
    const carePlan = CarePlan.create({ patientId: patient.id });
    await repos.carePlans.save(carePlan);
    return carePlan.id;
  }
  await repos.appointments.save(appointment);
  const payout = CommissionPayout.create({
    professionalId: professional.id,
    period: '2028-01',
    paidAt: new Date('2028-02-05T12:00:00'),
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
  await repos.commissionPayouts.save(payout);
  return payout.id;
}
