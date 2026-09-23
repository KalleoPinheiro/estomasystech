import type { NextRequest } from 'next/server';
import { GetInvoicesSummary } from '@/application/billing/get-invoices-summary';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { invoices } = await getRepositories(sessionScope(guard.session));
    return new GetInvoicesSummary(invoices).execute();
  });
}
