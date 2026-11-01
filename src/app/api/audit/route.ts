import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { listAuditEventsFor } from '@/lib/server/data/audit';

const querySchema = z.object({
  patientId: z.string().max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  // O cursor sai da mesma leitura que monta a página; fica numa variável de
  // fora porque o `meta` só é montado depois de o action resolver.
  let nextCursor: string | null = null;

  return handleRequest(
    async () => {
      const params = request.nextUrl.searchParams;
      const query = querySchema.parse({
        patientId: params.get('patientId') ?? undefined,
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      });
      const page = await listAuditEventsFor(guard.session, {
        patientId: query.patientId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
        cursor: query.cursor,
      });
      nextCursor = page.nextCursor;
      return page.events;
    },
    () => ({ nextCursor }),
  );
}
