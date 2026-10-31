import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SellSessionPackage } from '@/application/billing/sell-session-package';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import {
  listPatientPackagesWithPrice,
  toPackageWithPriceDto,
} from '@/lib/server/data/patient-record';

const createSchema = z.object({
  patientId: z.string().min(1),
  procedureId: z.string().min(1),
  totalSessions: z.number().int().min(1).max(100),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  /** Validade opcional (COMP3-07). */
  expiresAt: z.iso.datetime().nullish(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const patientId = request.nextUrl.searchParams.get('patientId');
    if (!patientId) {
      return [];
    }
    return listPatientPackagesWithPrice(guard.session, patientId);
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
    return toPackageWithPriceDto(sold.package, sold.procedureName);
  });
}
