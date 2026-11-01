import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toProcedureDto } from '@/lib/dto';
import { listProceduresFor } from '@/lib/server/data/procedures';
import { createProcedureRecord } from '@/lib/server/procedure-writes';

const procedureSchema = z.object({
  name: z.string().min(1).max(200),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  durationMinutes: z.number().int().min(1).max(480),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listProceduresFor(guard.session));
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = procedureSchema.parse(await request.json());
    const { procedures } = await getRepositories(writeScope(guard.session));
    const procedure = await createProcedureRecord(procedures, body);
    return toProcedureDto(procedure);
  });
}
