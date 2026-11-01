import 'server-only';
import { NotFoundError } from '@/domain/shared/errors';
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

/** Itens do kit do procedimento — a mesma resposta de `GET /api/procedures/:id/kit`. */
export async function getProcedureKitFor(
  session: Session,
  procedureId: string,
): Promise<{ items: Array<{ supplyId: string; quantity: number }> }> {
  // `procedure_supplies` não tem clinic_id: o escopo vem do procedimento — kit
  // só é visível se o procedimento pertence à empresa da sessão.
  const { procedureKits, procedures } = await getRepositories(
    sessionScope(session),
  );
  if (!(await procedures.findById(procedureId))) {
    throw new NotFoundError('Procedimento', procedureId);
  }
  return { items: await procedureKits.getKit(procedureId) };
}
