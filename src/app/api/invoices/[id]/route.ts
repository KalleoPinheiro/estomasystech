import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toInvoiceDto } from '@/lib/dto';
import {
  applyInvoiceAction,
  INVOICE_AUDIT_DETAIL,
  invoiceActionSchema,
} from '@/lib/server/invoice-actions';

/** Fatura com recebimentos — base do recibo. */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { invoices, patients } = await getRepositories(
      sessionScope(guard.session),
    );
    const invoice = await invoices.findById(id);
    if (!invoice) {
      throw new NotFoundError('Fatura', id);
    }
    const patient = await patients.findById(invoice.patientId);
    return toInvoiceDto(invoice, patient?.fullName);
  });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = invoiceActionSchema.parse(await request.json());
    const { transactions, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    // Ler (com lock da linha), aplicar a regra e gravar na mesma transação:
    // duas ações simultâneas na mesma fatura viram fila, e a segunda vê o
    // saldo já atualizado — nunca recebimento em dobro (#192).
    const updated = await transactions.run((tx) =>
      applyInvoiceAction(tx.invoices, id, body),
    );
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'invoice',
      resourceId: updated.id,
      patientId: updated.patientId,
      detail: INVOICE_AUDIT_DETAIL[body.action],
    });
    return toInvoiceDto(updated);
  });
}
