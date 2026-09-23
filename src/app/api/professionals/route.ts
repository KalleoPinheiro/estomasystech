import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { Professional } from '@/domain/professional/professional';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toProfessionalDto } from '@/lib/dto';

const professionalSchema = z.object({
  fullName: z.string().min(1).max(200),
  registry: z.string().max(100).nullish(),
  commissionPct: z.number().int().min(0).max(100).nullish(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { professionals } = await getRepositories(
      sessionScope(guard.session),
    );
    const result = await professionals.findAll();
    return result.map(toProfessionalDto);
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = professionalSchema.parse(await request.json());
    const { professionals, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    const professional = Professional.create({
      fullName: body.fullName,
      registry: body.registry ?? null,
      commissionPct: body.commissionPct ?? null,
    });
    await professionals.save(professional);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'professional',
      resourceId: professional.id,
    });
    return toProfessionalDto(professional);
  });
}
