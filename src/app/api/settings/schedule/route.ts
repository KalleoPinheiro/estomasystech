import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  DEFAULT_SCHEDULE_CONFIG,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import {
  clinicScope,
  writeClinicId,
  writeScope,
} from '@/lib/auth/tenant-scope';

const configSchema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  minGapMinutes: z.number().int().min(15).max(120),
  lunchBreak: z
    .object({
      startMinute: z.number().int().min(0).max(1440),
      endMinute: z.number().int().min(0).max(1440),
    })
    .nullish(),
  cancellationPolicy: z
    .object({
      noticeHours: z.number().int().min(0).max(168),
      lateFeeCents: z.number().int().min(0).max(1_000_000),
    })
    .optional(),
});

/**
 * Grade, almoço e política/taxa de cancelamento tardio são do Admin de Empresa
 * (#215, AGE-RN-13). A família `administrative` já barra os outros papéis nas
 * duas camadas; esta checagem repete a regra no PUT (defesa em profundidade,
 * ADR-002), como em `/api/settings/clinic-info`. A agenda lê a grade por
 * `/api/schedule-config`.
 */
const canEditSchedule = (role: string | undefined): boolean =>
  role === 'company_admin';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { scheduleConfig } = await getRepositories(writeScope(guard.session));
    const config = await scheduleConfig.get();
    return {
      config: config ?? DEFAULT_SCHEDULE_CONFIG,
      isDefault: config === null,
    };
  });
}

export async function PUT(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  if (guard.session && !canEditSchedule(guard.session.role)) {
    return fail(
      'Apenas Admin de Empresa pode alterar a grade de horários',
      403,
    );
  }

  return handleRequest(async () => {
    const body = configSchema.parse(await request.json());
    const clinicId = writeClinicId(guard.session);
    const { scheduleConfig, auditEvents } = await getRepositories(
      clinicScope(clinicId),
    );
    // Campo ausente no corpo mantém o valor salvo (telas antigas não mandam
    // almoço nem política e não podem apagá-los sem querer).
    const current = await scheduleConfig.get();
    const validated = validateScheduleConfig({
      ...body,
      lunchBreak:
        body.lunchBreak === undefined
          ? (current?.lunchBreak ?? null)
          : body.lunchBreak,
      cancellationPolicy:
        body.cancellationPolicy ?? current?.cancellationPolicy,
    });
    await scheduleConfig.save(validated);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-schedule',
      resourceId: clinicId,
    });
    return { config: validated, isDefault: false };
  });
}
