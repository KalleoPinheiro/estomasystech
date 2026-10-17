import type { NextRequest } from 'next/server';
import { ResolveReceipt } from '@/application/billing/resolve-receipt';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeClinicId } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

/**
 * Pagador e prestador do recibo, com o CPF/CNPJ completos (#326, FIN-RN-15).
 * É o único ponto que devolve o CPF inteiro, e cada leitura é auditada (sem o
 * número no registro). Falta de CPF ou CNPJ responde `400` com a orientação.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id, paymentId } = await context.params;
    const { invoices, patients, clinics, auditEvents } = await getRepositories(
      sessionScope(guard.session),
    );
    const parties = await new ResolveReceipt(
      invoices,
      patients,
      clinics,
    ).execute({
      invoiceId: id,
      paymentId,
      clinicId: writeClinicId(guard.session),
    });
    const invoice = await invoices.findById(id);
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'recibo',
      resourceId: paymentId,
      patientId: invoice?.patientId ?? null,
      detail: 'CPF no recibo',
    });
    return parties;
  });
}
