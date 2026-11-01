import 'server-only';
import { listMajorityReviews } from '@/application/guardians/majority-review';
import { getRepositories } from '@/infrastructure/container';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import type { MajorityReviewDto } from '@/lib/dto';

/**
 * Aviso de maioridade (#372, ADR-032): pacientes que fizeram 18 anos e ainda
 * estão no portal só pelo responsável. Quem gerencia responsáveis vê e decide;
 * outro papel recebe `ForbiddenError`. Mesma resposta de
 * `GET /api/guardians/majority`.
 */
export async function listMajorityReviewsFor(
  session: Session,
): Promise<MajorityReviewDto[]> {
  assertCanManageGuardians(session);
  const repos = await getRepositories(sessionScope(session));
  return (await listMajorityReviews(repos)).map((item) => ({
    patientId: item.patient.id,
    fullName: item.patient.fullName,
    birthDate: item.patient.birthDate?.toISOString() ?? null,
    guardianName: item.guardianName,
    guardianRelationship: item.guardianRelationship,
    awaitingTransfer: item.awaitingTransfer,
    representativeConsentExpiresOn:
      item.representativeConsentExpiresOn?.toISOString() ?? null,
    representativeConsentExpired: item.representativeConsentExpired,
  }));
}
