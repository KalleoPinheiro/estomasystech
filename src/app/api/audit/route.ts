import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { nextAuditCursor } from '@/lib/audit-cursor';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toAuditEventDto } from '@/lib/dto';

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

  // `limit` sai do action para o buildMeta (mesmo padrão de /api/invoices).
  let limit = 0;

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
      limit = query.limit;

      // Repositório escopado pela empresa da sessão (B6): eventos de plataforma
      // e de outras empresas nunca chegam aqui.
      const { auditEvents, patients } = await getRepositories(
        sessionScope(guard.session),
      );
      const events = await auditEvents.findAll(
        {
          patientId: query.patientId,
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
        },
        { limit: query.limit, cursor: query.cursor },
      );
      // Nome do paciente em lote, no escopo da sessão (#197): antes a tela
      // cruzava com a 1ª página de /api/patients e mostrava o id dos demais.
      const ids = [
        ...new Set(events.flatMap((e) => (e.patientId ? [e.patientId] : []))),
      ];
      const names = new Map(
        (ids.length > 0 ? await patients.findByIds(ids) : []).map((p) => [
          p.id,
          p.fullName,
        ]),
      );
      return events.map((event) =>
        toAuditEventDto(
          event,
          event.patientId ? (names.get(event.patientId) ?? null) : null,
        ),
      );
    },
    (result) => ({ nextCursor: nextAuditCursor(result, limit) }),
  );
}
