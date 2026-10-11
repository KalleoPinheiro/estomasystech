import {
  PartnerShareConsent,
  type PartnerShareConsentActor,
  type PartnerShareConsentRepository,
  type PartnerShareConsentStatus,
} from '@/domain/consent/partner-share-consent';
import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';

export interface PartnerShareConsentDeps {
  partners: PartnerRepository;
  partnerShareConsents: PartnerShareConsentRepository;
}

export interface PartnerShareConsentText {
  text: string;
  version: string;
}

export interface PartnerShareConsentView {
  partner: Partner;
  status: PartnerShareConsentStatus;
}

/**
 * Parceiro a quem o consentimento se refere: o "Indicado por" atual do
 * paciente, ativo. Sem indicação (ou parceiro inativo) não há o que consentir.
 */
async function referringPartner(
  deps: PartnerShareConsentDeps,
  patient: Patient,
): Promise<Partner | null> {
  if (!patient.referredByPartnerId) {
    return null;
  }
  const partner = await deps.partners.findById(patient.referredByPartnerId);
  return partner?.isActive ? partner : null;
}

async function requireReferringPartner(
  deps: PartnerShareConsentDeps,
  patient: Patient,
): Promise<Partner> {
  const partner = await referringPartner(deps, patient);
  if (!partner) {
    throw new NotFoundError('Parceiro indicador', patient.id);
  }
  return partner;
}

/** Status do consentimento com o parceiro indicador; `null` sem indicação. */
export async function getPartnerShareConsent(
  deps: PartnerShareConsentDeps,
  patient: Patient,
  consent: PartnerShareConsentText,
): Promise<PartnerShareConsentView | null> {
  const partner = await referringPartner(deps, patient);
  if (!partner) {
    return null;
  }
  const records = await deps.partnerShareConsents.findByPatientId(patient.id);
  return {
    partner,
    status: PartnerShareConsent.resolveStatus(
      records,
      partner.id,
      consent.text,
    ),
  };
}

/**
 * Aceite pelo próprio paciente (portal). Idempotente: com consentimento já
 * ativo para o texto vigente, devolve o aceite existente sem gravar outro.
 */
export async function acceptPartnerShareConsent(
  deps: PartnerShareConsentDeps,
  patient: Patient,
  consent: PartnerShareConsentText,
  ipAddress: string | null,
): Promise<{ record: PartnerShareConsent; created: boolean }> {
  const partner = await requireReferringPartner(deps, patient);
  const records = await deps.partnerShareConsents.findByPatientId(patient.id);
  const status = PartnerShareConsent.resolveStatus(
    records,
    partner.id,
    consent.text,
  );
  if (status.active && status.current) {
    return { record: status.current, created: false };
  }
  const record = PartnerShareConsent.accept({
    patientId: patient.id,
    partnerId: partner.id,
    consentText: consent.text,
    textVersion: consent.version,
    ipAddress,
  });
  await deps.partnerShareConsents.save(record);
  return { record, created: true };
}

/**
 * Revogação pelo paciente (portal) ou pela equipe (ficha). Grava um registro
 * novo; o aceite original fica no histórico.
 */
export async function revokePartnerShareConsent(
  deps: PartnerShareConsentDeps,
  patient: Patient,
  actor: PartnerShareConsentActor,
  ipAddress: string | null,
): Promise<PartnerShareConsent> {
  const partner = await requireReferringPartner(deps, patient);
  const record = PartnerShareConsent.revoke({
    patientId: patient.id,
    partnerId: partner.id,
    actor,
    ipAddress,
  });
  await deps.partnerShareConsents.save(record);
  return record;
}

/** Paciente da ficha (escopo da empresa pelo repositório); 404 se não existe. */
export async function findPatientOrThrow(
  patients: PatientRepository,
  id: string,
): Promise<Patient> {
  const patient = await patients.findById(id);
  if (!patient) {
    throw new NotFoundError('Paciente', id);
  }
  return patient;
}
