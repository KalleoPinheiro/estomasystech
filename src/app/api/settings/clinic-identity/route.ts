import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { UpdateClinicTheme } from '@/application/clinic/update-clinic-theme';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';

// A lista fechada é regra do domínio (`parseClinicTheme`); aqui só o formato.
const themeBodySchema = z.object({
  mode: z.unknown().optional(),
  accent: z.unknown().optional(),
});

/**
 * Tema da clínica (#426): família `administrative` (só o Admin de Empresa,
 * ADR-002); o proxy e a guarda por família conferem o papel. A leitura vai em
 * `GET /api/settings/clinic-info` (`identity.theme`).
 */
export async function PUT(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const body = themeBodySchema.parse(await request.json());
    const { clinics, auditEvents } = await getRepositories(
      clinicScope(clinicId),
    );
    const theme = await new UpdateClinicTheme(clinics).execute(clinicId, body);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-theme',
      resourceId: clinicId,
      detail: `modo ${theme.mode}, cor ${theme.accent}`,
    });
    return { theme };
  });
}
