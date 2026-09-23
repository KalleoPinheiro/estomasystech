import type { NextRequest } from 'next/server';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';

/**
 * Monta o payload de status a partir do resultado de `resolveStatus` —
 * `acceptedAt`/`textVersion` sempre do último ACEITE real, nunca da
 * revogação, mesmo quando o status atual é revogado (AC-70-2).
 */
function toConsentStatusDto(
  status: ReturnType<typeof ConsentRecord.resolveStatus>,
) {
  const revoked = status.current?.kind === 'revoke';
  return {
    consentText: CONSENT_TEXT,
    accepted: status.accepted,
    revoked,
    acceptedAt: status.latestAccept?.acceptedAt.toISOString() ?? null,
    textVersion: status.latestAccept?.textVersion ?? null,
    revokedAt: revoked
      ? (status.current?.acceptedAt.toISOString() ?? null)
      : null,
  };
}

/** Texto vigente + status do aceite do paciente logado. */
export async function GET(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const { patients, consentRecords } = await getRepositories(
      sessionScope(auth.session),
    );
    const patient = await patients.findByEmail(auth.session.subject);
    if (!patient) {
      throw new NotFoundError('Paciente', auth.session.subject);
    }
    const records = await consentRecords.findByPatientId(patient.id);
    const status = ConsentRecord.resolveStatus(records, CONSENT_TEXT);
    return toConsentStatusDto(status);
  });
}

/** Aceite digital: grava hash do texto exato + data + IP (evidência LGPD). */
export async function POST(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const { patients, consentRecords, auditEvents } = await getRepositories(
      writeScope(auth.session),
    );
    const patient = await patients.findByEmail(auth.session.subject);
    if (!patient?.isActive) {
      throw new NotFoundError('Paciente', auth.session.subject);
    }

    const existing = await consentRecords.findByPatientId(patient.id);
    const status = ConsentRecord.resolveStatus(existing, CONSENT_TEXT);
    if (status.accepted && status.current) {
      return {
        accepted: true,
        acceptedAt: status.current.acceptedAt.toISOString(),
      };
    }

    const record = ConsentRecord.create({
      patientId: patient.id,
      consentText: CONSENT_TEXT,
      textVersion: CONSENT_TEXT_VERSION,
      // Evidência do aceite: mesma derivação confiável usada no rate limit (SEC1-10..13).
      ipAddress: clientIp(request),
    });
    await consentRecords.save(record);

    recordAudit(auditEvents, auth.session, {
      action: 'create',
      resourceType: 'consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `hash ${record.textHash.slice(0, 12)}…`,
    });
    return { accepted: true, acceptedAt: record.acceptedAt.toISOString() };
  });
}
