import type { NextRequest } from 'next/server';
import {
  DeleteGuardian,
  GetGuardian,
  UpdateGuardian,
} from '@/application/guardians/guardian-use-cases';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toGuardianDto } from '@/lib/dto';
import { guardianSchema } from '../schema';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const { id } = await context.params;
    const { guardians, patients } = await getRepositories(
      sessionScope(guard.session),
    );
    const found = await new GetGuardian(guardians, patients).execute(id);
    return {
      ...toGuardianDto(found.guardian),
      patients: found.patients.map((p) => ({ id: p.id, fullName: p.fullName })),
    };
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const { id } = await context.params;
    const body = guardianSchema.partial().parse(await request.json());
    const { guardians, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    const guardian = await new UpdateGuardian(guardians).execute({
      id,
      ...body,
    });
    // Só os nomes dos campos: a trilha nunca leva o contato (ADR-014).
    await recordAuditNow(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'guardian',
      resourceId: guardian.id,
      detail: `campos: ${Object.keys(body).join(', ') || '—'}`,
    });
    return toGuardianDto(guardian);
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const { id } = await context.params;
    const { guardians, patients, userAccounts, auditEvents } =
      await getRepositories(writeScope(guard.session));
    await new DeleteGuardian(guardians, patients, userAccounts).execute(id);
    await recordAuditNow(auditEvents, guard.session, {
      action: 'delete',
      resourceType: 'guardian',
      resourceId: id,
    });
    return { id };
  });
}
