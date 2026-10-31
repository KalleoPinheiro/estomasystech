import 'server-only';
import { GetAnamnesis } from '@/application/clinical/get-anamnesis';
import { ListCarePlansByPatient } from '@/application/clinical/list-care-plans-by-patient';
import { ListConditions } from '@/application/clinical/list-conditions';
import { ListEvolutionNotes } from '@/application/clinical/list-evolution-notes';
import {
  findPatientOrThrow,
  getPartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { GetPatient } from '@/application/patients/get-patient';
import type { SessionPackage } from '@/domain/billing/package';
import { getRepositories } from '@/infrastructure/container';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  type AnamnesisDto,
  type CarePlanDto,
  type ConditionDto,
  type EvolutionNoteDto,
  type PackageBalanceDto,
  type PartnerShareConsentDto,
  type PatientDto,
  toAnamnesisDto,
  toCarePlanDto,
  toConditionDto,
  toEvolutionNoteDto,
  toPackageBalanceDto,
  toPartnerShareConsentDto,
  toPatientDto,
} from '@/lib/dto';
import { PARTNER_SHARE_CONSENT } from '@/lib/partner-share-consent-text';

/**
 * Leituras da ficha do paciente no servidor (#552, ADR-080). Cada função é a
 * mesma resposta da rota `GET /api/patients/[id]/…` (que passa a chamá-la):
 * escopo de empresa por `sessionScope`, R4 do Profissional (sem vínculo =
 * 404) e a leitura do prontuário auditada, porque o acesso a dado de saúde é
 * evento LGPD. Nada vai para cache compartilhado (ADR-069).
 */

export async function getPatientRecord(
  session: Session,
  id: string,
): Promise<PatientDto> {
  const { patients, guardians, auditEvents, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    professionalPatientLinks,
  );
  const patient = await new GetPatient(patients).execute({ id });
  const clinicId = await patients.findClinicIdById(patient.id);
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'patient',
    resourceId: patient.id,
    patientId: patient.id,
    clinicId,
  });
  const guardian = patient.guardianId
    ? await guardians.findById(patient.guardianId)
    : null;
  return toPatientDto(patient, guardian);
}

export async function getPatientAnamnesis(
  session: Session,
  id: string,
): Promise<AnamnesisDto | null> {
  const { anamneses, auditEvents, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    professionalPatientLinks,
  );
  const anamnesis = await new GetAnamnesis(anamneses).execute({
    patientId: id,
  });
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'anamnesis',
    resourceId: id,
    patientId: id,
  });
  return anamnesis ? toAnamnesisDto(anamnesis) : null;
}

export async function listPatientConditions(
  session: Session,
  id: string,
): Promise<ConditionDto[]> {
  const { conditions, auditEvents, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    professionalPatientLinks,
  );
  const result = await new ListConditions(conditions).execute({
    patientId: id,
  });
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'conditions',
    resourceId: id,
    patientId: id,
  });
  return result.map(toConditionDto);
}

export async function listPatientEvolutions(
  session: Session,
  id: string,
): Promise<EvolutionNoteDto[]> {
  const { evolutions, auditEvents, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    professionalPatientLinks,
  );
  const notes = await new ListEvolutionNotes(evolutions).execute({
    patientId: id,
  });
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'evolutions',
    resourceId: id,
    patientId: id,
  });
  return notes.map(toEvolutionNoteDto);
}

export async function listPatientCarePlans(
  session: Session,
  id: string,
): Promise<CarePlanDto[]> {
  const { carePlans, auditEvents, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    professionalPatientLinks,
  );
  const result = await new ListCarePlansByPatient(carePlans).execute({
    patientId: id,
  });
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'care_plans',
    resourceId: id,
    patientId: id,
  });
  return result.map(toCarePlanDto);
}

/**
 * Saldo de pacotes do paciente para o prontuário (AD-027, #296): nome e
 * sessões, **sem preço**. Família `clinical` (Admin e Profissional) com o
 * vínculo R4; quem precisa do valor usa {@link listPatientPackagesWithPrice}.
 */
export async function listPatientPackageBalances(
  session: Session,
  id: string,
): Promise<PackageBalanceDto[]> {
  const { sessionPackages, procedures, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    professionalPatientLinks,
  );
  const packages = await sessionPackages.findByPatientId(id);
  const catalog = await procedures.findAll();
  const nameById = new Map(catalog.map((p) => [p.id, p.name]));
  return packages.map((pkg) =>
    toPackageBalanceDto(pkg, nameById.get(pkg.procedureId)),
  );
}

export const toPackageWithPriceDto = (
  pkg: SessionPackage,
  procedureName?: string,
) => ({
  id: pkg.id,
  patientId: pkg.patientId,
  procedureId: pkg.procedureId,
  procedureName,
  totalSessions: pkg.totalSessions,
  usedSessions: pkg.usedSessions,
  remainingSessions: pkg.remainingSessions,
  priceCents: pkg.priceCents,
  expiresAt: pkg.expiresAt?.toISOString() ?? null,
  active: pkg.isActive,
  createdAt: pkg.createdAt.toISOString(),
});

/** Pacotes com valor do paciente — a mesma resposta de `GET /api/packages?patientId=`. */
export async function listPatientPackagesWithPrice(
  session: Session,
  patientId: string,
) {
  const { sessionPackages, procedures } = await getRepositories(
    sessionScope(session),
  );
  const packages = await sessionPackages.findByPatientId(patientId);
  const catalog = await procedures.findAll();
  const nameById = new Map(catalog.map((p) => [p.id, p.name]));
  return packages.map((pkg) =>
    toPackageWithPriceDto(pkg, nameById.get(pkg.procedureId)),
  );
}

/**
 * Consentimento do paciente para o parceiro que o indicou (#292); `null` sem
 * parceiro indicador ativo.
 */
export async function getPatientPartnerConsent(
  session: Session,
  id: string,
): Promise<PartnerShareConsentDto | null> {
  const services = await getRepositories(sessionScope(session));
  await assertPatientAccessibleToProfessional(
    session,
    id,
    services.professionalPatientLinks,
  );
  const patient = await findPatientOrThrow(services.patients, id);
  const view = await getPartnerShareConsent(
    services,
    patient,
    PARTNER_SHARE_CONSENT,
  );
  return view
    ? toPartnerShareConsentDto(view, PARTNER_SHARE_CONSENT, {
        includeRecordedBy: true,
      })
    : null;
}
