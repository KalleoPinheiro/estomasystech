import type { NextRequest } from 'next/server';
import {
  CreateGuardian,
  ListGuardians,
} from '@/application/guardians/guardian-use-cases';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toGuardianDto } from '@/lib/dto';
import { guardianSchema } from '@/lib/guardian-schema';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const { guardians } = await getRepositories(sessionScope(guard.session));
    const search = request.nextUrl.searchParams.get('search') ?? undefined;
    return (await new ListGuardians(guardians).execute(search)).map(
      toGuardianDto,
    );
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const body = guardianSchema.parse(await request.json());
    const { guardians, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    const guardian = await new CreateGuardian(guardians).execute(body);
    await recordAuditNow(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'guardian',
      resourceId: guardian.id,
    });
    return toGuardianDto(guardian);
  });
}
