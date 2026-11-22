import type { NextRequest } from 'next/server';
import { describeFailure, fail } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { renderPortalPrescription } from '@/lib/server/portal-prescriptions';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PDF de um receituário do paciente da sessão (#956, ADR-116), exatamente como
 * emitido. Dado de saúde: nunca entra em cache compartilhado (`no-store`).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await context.params;
    const pdf = await renderPortalPrescription(guard.session, id);
    return new Response(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.fileName}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const { message, status } = describeFailure(error);
    return fail(message, status);
  }
}
