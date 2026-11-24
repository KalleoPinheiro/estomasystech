import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  PROPOSAL_MAX_SESSIONS,
  PROPOSAL_TEXT_MAX,
} from '@/domain/billing/plan-proposal';
import { describeFailure, fail } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { renderPlanProposalFor } from '@/lib/server/plan-proposal';

const text = z.string().max(PROPOSAL_TEXT_MAX).nullish();

const proposalSchema = z.object({
  patientId: z.string().min(1).max(100),
  procedureId: z.string().min(1).max(100),
  totalSessions: z.number().int().min(1).max(PROPOSAL_MAX_SESSIONS),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  reassessmentOn: z.string().max(10).nullish(),
  objective: z.string().min(1).max(PROPOSAL_TEXT_MAX),
  frequency: text,
  duration: text,
  modality: text,
  therapies: text,
  materials: text,
  payment: text,
  emergencyContact: text,
});

/**
 * Gera a proposta do plano de acompanhamento em PDF (#964). Família
 * administrativa (`/api/packages`): só o Admin, porque leva preço. Nada é
 * guardado além do evento de auditoria; dado do paciente, então `no-store`.
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  try {
    const body = proposalSchema.parse(await request.json());
    const pdf = await renderPlanProposalFor(guard.session, body);
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
