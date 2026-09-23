import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { Procedure } from '@/domain/catalog/procedure';
import { ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toProcedureDto } from '@/lib/dto';

const procedureSchema = z.object({
  name: z.string().min(1).max(200),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  durationMinutes: z.number().int().min(1).max(480),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { procedures, procedureKits } = await getRepositories(
      sessionScope(guard.session),
    );
    const [result, kitCounts] = await Promise.all([
      procedures.findAll(),
      procedureKits.countByProcedure(),
    ]);
    return result.map((procedure) =>
      toProcedureDto(procedure, kitCounts[procedure.id] ?? 0),
    );
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = procedureSchema.parse(await request.json());
    const { procedures } = await getRepositories(writeScope(guard.session));

    const existing = await procedures.findByName(body.name);
    if (existing) {
      throw new ValidationError(
        `Já existe procedimento com o nome "${existing.name}"`,
      );
    }

    const procedure = Procedure.create(body);
    await procedures.save(procedure);
    return toProcedureDto(procedure);
  });
}
