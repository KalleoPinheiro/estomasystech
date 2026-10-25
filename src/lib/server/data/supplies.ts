import 'server-only';
import { ListSupplies } from '@/application/inventory/list-supplies';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type SupplyDto, toSupplyDto } from '@/lib/dto';

/** Insumos da empresa da sessão — a mesma resposta de `GET /api/supplies` e o estoque baixo da tela Hoje. */
export async function listSuppliesFor(session: Session): Promise<SupplyDto[]> {
  const { supplies } = await getRepositories(sessionScope(session));
  const result = await new ListSupplies(supplies).execute();
  return result.map(({ supply }) => toSupplyDto(supply));
}
