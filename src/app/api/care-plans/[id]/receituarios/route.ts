import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { PRESCRIPTION_FREE_TEXT_MAX } from '@/domain/clinical/nursing-prescription';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  issuePrescriptionFor,
  listPrescriptionsFor,
} from '@/lib/server/prescription';

type RouteContext = { params: Promise<{ id: string }> };

const issueSchema = z.object({
  freeText: z.string().max(PRESCRIPTION_FREE_TEXT_MAX).nullish(),
});

/**
 * Receituários emitidos do plano (#956, ADR-116). Família clínica
 * (`/api/care-plans`): Admin e Profissional vinculado; o Atendente recebe 403.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    // R4 no handler (#186): Profissional sem vínculo com o paciente do plano = 404.
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlan',
      id,
      await getRepositories(sessionScope(guard.session)),
    );
    return listPrescriptionsFor(guard.session, id);
  });
}

/** Emite: grava o conteúdo impresso com o número `RCT-` (conteúdo congelado). */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlan',
      id,
      await getRepositories(sessionScope(guard.session)),
    );
    const body = issueSchema.parse(await request.json());
    return issuePrescriptionFor(guard.session, id, body.freeText ?? null);
  });
}
