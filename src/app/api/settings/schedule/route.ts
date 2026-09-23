import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  DEFAULT_SCHEDULE_CONFIG,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
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
});

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

  return handleRequest(async () => {
    const body = configSchema.parse(await request.json());
    const clinicId = writeClinicId(guard.session);
    const { scheduleConfig, auditEvents } = await getRepositories(
      clinicScope(clinicId),
    );
    const validated = validateScheduleConfig(body);
    await scheduleConfig.save(validated);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-schedule',
      resourceId: clinicId,
    });
    return { config: validated, isDefault: false };
  });
}
