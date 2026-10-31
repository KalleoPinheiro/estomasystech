import type { NextRequest } from 'next/server';
import { resolveConsentSigner } from '@/application/portal/portal-identity';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeClinicId, writeScope } from '@/lib/auth/tenant-scope';
import {
  acceptedTemplates,
  CONSENT_DOCUMENTS,
  consentPurposeFrom,
} from '@/lib/consent-documents';
import { controllerSnapshot } from '@/lib/legal-text';
import { controllerOf, loadConsentStatus } from '@/lib/server/data/portal';

/** Texto vigente (com os dados da clínica) + status do aceite do paciente logado. */
export async function GET(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(() =>
    loadConsentStatus(auth.session, consentPurposeFrom(request.nextUrl)),
  );
}

/**
 * Aceite digital: grava hash do texto-base + clínica e encarregado exibidos +
 * data + IP (evidência LGPD). O representante legal assina pelo menor e o
 * registro guarda o cadastro e o parentesco dele (#372, ADR-032).
 */
export async function POST(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const purpose = consentPurposeFrom(request.nextUrl);
    const document = CONSENT_DOCUMENTS[purpose];
    const services = await getRepositories(writeScope(auth.session));
    const { consentRecords, auditEvents, clinics } = services;
    const { patient, signer } = await resolveConsentSigner(
      services,
      auth.session,
    );

    const existing = await consentRecords.findByPatientId(patient.id);
    const status = ConsentRecord.resolveStatus(
      existing,
      acceptedTemplates(document),
      purpose,
      patient,
    );
    // Já aceito: só grava de novo quando o paciente, já adulto, assina em
    // nome próprio o que o representante aceitou por ele.
    const resignsOwnName = signer === null && !!status.current?.signer;
    if (status.accepted && status.current && !resignsOwnName) {
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
      consentText: signer ? document.representativeTemplate : document.template,
      textVersion: signer ? document.representativeVersion : document.version,
      purpose,
      controllerSnapshot: controllerSnapshot(controller),
      // Evidência do aceite: mesma derivação confiável usada no rate limit (SEC1-10..13).
      ipAddress: clientIp(request),
      signer,
    });
    await consentRecords.save(record);

    recordAudit(auditEvents, auth.session, {
      action: 'create',
      resourceType: 'consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `${purpose} · hash ${record.textHash.slice(0, 12)}…${signer ? ' · pelo representante legal' : ''}`,
    });
    return { accepted: true, acceptedAt: record.acceptedAt.toISOString() };
  });
}
