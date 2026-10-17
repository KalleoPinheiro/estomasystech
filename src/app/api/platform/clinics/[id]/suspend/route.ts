import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SuspendClinic } from '@/application/platform/change-clinic-status';
import {
  CLINIC_SUSPENSION_NOTE_MAX,
  CLINIC_SUSPENSION_REASONS,
} from '@/domain/clinic/clinic';
import { forgetClinicSessionStatus } from '@/lib/auth/staff-revocation';
import { handleClinicStatus } from '../clinic-status-handler';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.enum(CLINIC_SUSPENSION_REASONS, {
    error: 'Motivo da suspensão é obrigatório',
  }),
  note: z.string().max(CLINIC_SUSPENSION_NOTE_MAX).nullish(),
});

/**
 * Suspende a clínica (B5, Journey 7): toda conta dela perde a sessão — neste
 * processo na hora, nos demais em ≤ 60 s (ADR-005) — e não consegue entrar; os
 * lembretes param. Nenhum dado é apagado. O corpo traz o motivo (lista fechada,
 * #251) e uma observação opcional; sem motivo, `400`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return handleClinicStatus(
    request,
    context,
    'suspend',
    async (services, id, actor) =>
      new SuspendClinic(services).execute(
        id,
        actor,
        bodySchema.parse(await request.json().catch(() => ({}))),
      ),
    forgetClinicSessionStatus,
  );
}
