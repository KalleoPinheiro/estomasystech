import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { describeFailure, fail } from '@/lib/api-response';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { renderPrescriptionFor } from '@/lib/server/prescription';

type RouteContext = {
  params: Promise<{ id: string; prescriptionId: string }>;
};

/**
 * Baixa em PDF um receituário já emitido (#956, ADR-116), desenhado do conteúdo
 * gravado na emissão: baixar de novo reproduz exatamente o emitido. Só lê.
 * Dado de saúde: nunca entra em cache compartilhado (`no-store`).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  try {
    const { id, prescriptionId } = await context.params;
    // R4 no handler (#186): Profissional sem vínculo com o paciente do plano = 404.
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlan',
      id,
      await getRepositories(sessionScope(guard.session)),
    );
    const pdf = await renderPrescriptionFor(guard.session, id, prescriptionId);
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
