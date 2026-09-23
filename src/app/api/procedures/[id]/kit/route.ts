import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';

const kitSchema = z.object({
  items: z
    .array(
      z.object({
        supplyId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .max(50),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    // `procedure_supplies` não tem clinic_id: o escopo vem do procedimento —
    // kit só é visível se o procedimento pertence à empresa da sessão.
    const { procedureKits, procedures } = await getRepositories(
      sessionScope(guard.session),
    );
    if (!(await procedures.findById(id))) {
      throw new NotFoundError('Procedimento', id);
    }
    return { items: await procedureKits.getKit(id) };
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = kitSchema.parse(await request.json());
    const { procedureKits, procedures, supplies } = await getRepositories(
      writeScope(guard.session),
    );

    const procedure = await procedures.findById(id);
    if (!procedure) {
      throw new NotFoundError('Procedimento', id);
    }
    // Insumo de outra empresa não entra no kit (a baixa automática debitaria
    // o estoque dela ao concluir a consulta).
    const found = await Promise.all(
      body.items.map((item) => supplies.findById(item.supplyId)),
    );
    const missing = body.items.find((_, index) => !found[index]);
    if (missing) {
      throw new NotFoundError('Insumo', missing.supplyId);
    }

    await procedureKits.setKit(id, body.items);
    return { items: await procedureKits.getKit(id) };
  });
}
