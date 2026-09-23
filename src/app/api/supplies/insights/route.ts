import type { NextRequest } from 'next/server';
import { GetSupplyInsights } from '@/application/inventory/get-supply-insights';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { supplies, stockMovements, supplyBatches } = await getRepositories(
      sessionScope(guard.session),
    );
    const insights = await new GetSupplyInsights(
      supplies,
      stockMovements,
      supplyBatches,
    ).execute();
    return {
      bySupply: insights.bySupply,
      expiringBatches: insights.expiringBatches.map((batch) => ({
        ...batch,
        expiresAt: batch.expiresAt.toISOString(),
      })),
    };
  });
}
