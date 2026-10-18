import type { NextRequest } from 'next/server';
import { resolveConsentSigner } from '@/application/portal/portal-identity';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { consentPurposeFrom } from '@/lib/consent-documents';

/**
 * Revogação self-service do consentimento LGPD (art. 8º/18): registra evento
 * imutável de revogação — não apaga o aceite original (append-only, mesmo
 * padrão do POST de aceite). Idempotente por natureza: acionar mais de uma
 * vez em sequência só grava múltiplos registros de revogação, sem erro; o
 * status final continua "revogado". O representante legal revoga pelo menor
 * (#372, ADR-032); o responsável de adulto recebe `403`.
 */
export async function POST(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const services = await getRepositories(writeScope(auth.session));
    const { consentRecords, auditEvents } = services;
    const { patient, signer } = await resolveConsentSigner(
      services,
      auth.session,
    );

    const purpose = consentPurposeFrom(request.nextUrl);
    const record = ConsentRecord.revoke({
      patientId: patient.id,
      purpose,
      ipAddress: clientIp(request),
      signer,
    });
    await consentRecords.save(record);

    recordAudit(auditEvents, auth.session, {
      action: 'update',
      resourceType: 'consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `revogação de consentimento (${purpose})${signer ? ' · pelo representante legal' : ''}`,
    });
    return {
      accepted: false,
      revoked: true,
      revokedAt: record.acceptedAt.toISOString(),
    };
  });
}
