import 'server-only';
import { ADMIN_ONLY_MESSAGE } from '@/application/patients/data-subject-requests';
import type { DataRequestStatus } from '@/domain/patient/data-subject-request';
import { ForbiddenError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type DataSubjectRequestDto, toDataSubjectRequestDto } from '@/lib/dto';

/**
 * Fila de pedidos do titular da empresa da sessão (#293, LGPD art. 18) por
 * situação. Família `administrative`: só o Admin de Empresa (ADR-002); a
 * checagem se repete aqui porque a tela abre para toda a equipe e a fila é
 * dado de pessoa. Mesma resposta de `GET /api/data-requests`, que reaproveita
 * esta função, e fonte da tela de Pedidos do titular.
 */
export async function listDataRequestsFor(
  session: Session,
  status: DataRequestStatus,
): Promise<DataSubjectRequestDto[]> {
  if (session.role !== 'company_admin') {
    throw new ForbiddenError(ADMIN_ONLY_MESSAGE);
  }
  const { dataSubjectRequests, patients } = await getRepositories(
    sessionScope(session),
  );
  const requests = await dataSubjectRequests.listByStatus(status);
  const ids = [...new Set(requests.map((item) => item.patientId))];
  const names = new Map(
    (ids.length > 0 ? await patients.findByIds(ids) : []).map((p) => [
      p.id,
      p.fullName,
    ]),
  );
  return requests.map((item) =>
    toDataSubjectRequestDto(item, names.get(item.patientId)),
  );
}
