import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { COMMISSION_TYPES } from '@/domain/professional/professional';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toProfessionalDto } from '@/lib/dto';
import { listProfessionalsFor } from '@/lib/server/data/professionals';
import { createProfessionalRecord } from '@/lib/server/professional-writes';

const professionalSchema = z.object({
  fullName: z.string().min(1).max(200),
  registry: z.string().max(100).nullish(),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionPct: z.number().int().min(0).max(100).nullish(),
  commissionFixedCents: z.number().int().min(0).max(10_000_000).nullish(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listProfessionalsFor(guard.session));
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = professionalSchema.parse(await request.json());
    const { professionals, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    const professional = await createProfessionalRecord(professionals, body);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'professional',
      resourceId: professional.id,
    });
    return toProfessionalDto(professional);
  });
}
