import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SellSessionPackage } from '@/application/billing/sell-session-package';
import type { SessionPackage } from '@/domain/billing/package';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';

const createSchema = z.object({
  patientId: z.string().min(1),
  procedureId: z.string().min(1),
  totalSessions: z.number().int().min(1).max(100),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  /** Validade opcional (COMP3-07). */
  expiresAt: z.iso.datetime().nullish(),
});

const toPackageDto = (pkg: SessionPackage, procedureName?: string) => ({
  id: pkg.id,
  patientId: pkg.patientId,
  procedureId: pkg.procedureId,
  procedureName,
  totalSessions: pkg.totalSessions,
  usedSessions: pkg.usedSessions,
  remainingSessions: pkg.remainingSessions,
  priceCents: pkg.priceCents,
  expiresAt: pkg.expiresAt?.toISOString() ?? null,
  active: pkg.isActive,
  createdAt: pkg.createdAt.toISOString(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const patientId = request.nextUrl.searchParams.get('patientId');
    if (!patientId) {
      return [];
    }
    const { sessionPackages, procedures } = await getRepositories(
      sessionScope(guard.session),
    );
    const packages = await sessionPackages.findByPatientId(patientId);
    const catalog = await procedures.findAll();
    const nameById = new Map(catalog.map((p) => [p.id, p.name]));
    return packages.map((pkg) =>
      toPackageDto(pkg, nameById.get(pkg.procedureId)),
    );
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    const { patients, procedures, transactions } = await getRepositories(
      writeScope(guard.session),
    );
    const sold = await new SellSessionPackage(
      patients,
      procedures,
      transactions,
    ).execute({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
    return toPackageDto(sold.package, sold.procedureName);
  });
}
