import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { nextAuditCursor } from '@/lib/audit-cursor';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toPlatformAuditEventDto } from '@/lib/dto';

const querySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

/**
 * Trilha de plataforma (B6, #210): eventos sem empresa e ações do super_admin,
 * inclusive as feitas numa clínica (que aparecem também na trilha dela). Só o
 * super_admin chega aqui (família `platform`); a sessão dele não tem empresa,
 * então `sessionScope` é o escopo de sistema que a trilha exige.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  // `limit` sai do action para o buildMeta (mesmo padrão de /api/invoices).
  let limit = 0;

  return handleRequest(
    async () => {
      const params = request.nextUrl.searchParams;
      const query = querySchema.parse({
        from: params.get('from') ?? undefined,
        to: params.get('to') ?? undefined,
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      });
      limit = query.limit;

      const { auditEvents, clinics } = await getRepositories(
        sessionScope(guard.session),
      );
      const events = await auditEvents.findPlatformTrail(
        {
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
        },
        { limit: query.limit, cursor: query.cursor },
      );
      const names = new Map(
        (await clinics.findAll()).map((clinic) => [clinic.id, clinic.name]),
      );
      return events.map((event) =>
        toPlatformAuditEventDto(
          event,
          event.clinicId ? (names.get(event.clinicId) ?? null) : null,
        ),
      );
    },
    (result) => ({ nextCursor: nextAuditCursor(result, limit) }),
  );
}
