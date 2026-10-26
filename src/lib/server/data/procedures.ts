import 'server-only';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type ProcedureDto, toProcedureDto } from '@/lib/dto';

/** Catálogo da empresa da sessão — a mesma resposta de `GET /api/procedures` e as opções da venda de pacote. */
export async function listProceduresFor(
  session: Session,
): Promise<ProcedureDto[]> {
  const { procedures, procedureKits } = await getRepositories(
    sessionScope(session),
  );
  const [result, kitCounts] = await Promise.all([
    procedures.findAll(),
    procedureKits.countByProcedure(),
  ]);
  return result.map((procedure) =>
    toProcedureDto(procedure, kitCounts[procedure.id] ?? 0),
  );
}
