import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { describeFailure, fail } from '@/lib/api-response';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { buildPrescriptionPdfFor } from '@/lib/server/prescription';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Baixa o receituário de enfermagem do plano em PDF (#956). Rota da família
 * clínica (`/api/care-plans`): Admin e Profissional vinculado; o Atendente
 * recebe 403. Dado de saúde: nunca entra em cache compartilhado (`no-store`).
 * O GET emite o documento uma vez só (idempotente, ADR-082): baixar de novo
 * devolve o mesmo número e a mesma data.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await context.params;
    // R4 no handler (#186): Profissional sem vínculo com o paciente do plano = 404.
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlan',
      id,
      await getRepositories(sessionScope(guard.session)),
    );
    const pdf = await buildPrescriptionPdfFor(guard.session, id);
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
