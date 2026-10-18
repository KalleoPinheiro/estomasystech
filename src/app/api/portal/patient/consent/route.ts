import type { NextRequest } from 'next/server';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import {
  requirePatientPortalSession,
  requirePortalSession,
} from '@/lib/auth/require-session';
import {
  sessionScope,
  writeClinicId,
  writeScope,
} from '@/lib/auth/tenant-scope';
import { CONSENT_DOCUMENTS, consentPurposeFrom } from '@/lib/consent-documents';
import {
  controllerFromClinic,
  controllerSnapshot,
  renderLegalText,
} from '@/lib/legal-text';

/** Controlador (clínica + encarregado) que o paciente vê nos termos. */
async function controllerOf(clinics: ClinicRepository, clinicId: string) {
  const clinic = await clinics.findById(clinicId);
  if (!clinic) throw new NotFoundError('Clínica', clinicId);
  return controllerFromClinic(clinic);
}

/**
 * Monta o payload de status a partir do resultado de `resolveStatus` —
 * `acceptedAt`/`textVersion` sempre do último ACEITE real, nunca da
 * revogação, mesmo quando o status atual é revogado (AC-70-2).
 */
function toConsentStatusDto(
  status: ReturnType<typeof ConsentRecord.resolveStatus>,
  purpose: string,
  consentText: string,
) {
  const revoked = status.current?.kind === 'revoke';
  return {
    purpose,
    consentText,
    accepted: status.accepted,
    revoked,
    acceptedAt: status.latestAccept?.acceptedAt.toISOString() ?? null,
    textVersion: status.latestAccept?.textVersion ?? null,
    revokedAt: revoked
      ? (status.current?.acceptedAt.toISOString() ?? null)
      : null,
  };
}

/** Texto vigente (com os dados da clínica) + status do aceite do paciente logado. */
export async function GET(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const purpose = consentPurposeFrom(request.nextUrl);
    const document = CONSENT_DOCUMENTS[purpose];
    const services = await getRepositories(sessionScope(auth.session));
    const { consentRecords, clinics } = services;
    const patient = await resolvePortalPatient(services, auth.session);
    const records = await consentRecords.findByPatientId(patient.id);
    const status = ConsentRecord.resolveStatus(
      records,
      document.template,
      purpose,
    );
    const controller = await controllerOf(clinics, writeClinicId(auth.session));
    return toConsentStatusDto(
      status,
      purpose,
      renderLegalText(document.template, controller),
    );
  });
}

/** Aceite digital: grava hash do texto-base + clínica e encarregado exibidos + data + IP (evidência LGPD). */
export async function POST(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const purpose = consentPurposeFrom(request.nextUrl);
    const document = CONSENT_DOCUMENTS[purpose];
    const services = await getRepositories(writeScope(auth.session));
    const { consentRecords, auditEvents, clinics } = services;
    const patient = await resolvePortalPatient(services, auth.session);

    const existing = await consentRecords.findByPatientId(patient.id);
    const status = ConsentRecord.resolveStatus(
      existing,
      document.template,
      purpose,
    );
    if (status.accepted && status.current) {
      return {
        accepted: true,
        acceptedAt: status.current.acceptedAt.toISOString(),
      };
    }

    // Sem controlador identificável (CNPJ, canal do encarregado) não há aceite:
    // o paciente não saberia a quem recorrer (LGPD, arts. 9º e 41).
    const controller = await controllerOf(clinics, writeClinicId(auth.session));
    const record = ConsentRecord.create({
      patientId: patient.id,
      consentText: document.template,
      textVersion: document.version,
      purpose,
      controllerSnapshot: controllerSnapshot(controller),
      // Evidência do aceite: mesma derivação confiável usada no rate limit (SEC1-10..13).
      ipAddress: clientIp(request),
    });
    await consentRecords.save(record);

    recordAudit(auditEvents, auth.session, {
      action: 'create',
      resourceType: 'consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `${purpose} · hash ${record.textHash.slice(0, 12)}…`,
    });
    return { accepted: true, acceptedAt: record.acceptedAt.toISOString() };
  });
}
