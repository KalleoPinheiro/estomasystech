import type { NextRequest } from 'next/server';
import { UpdateClinicInfo } from '@/application/platform/update-clinic-info';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicInfoChangesSchema } from '@/lib/clinic-info-schema';
import { toPlatformClinicDetailDto, toPlatformClinicDto } from '@/lib/dto';
import { loadPlatformClinic } from './platform-clinic';

type RouteContext = { params: Promise<{ id: string }> };

const CLINIC_NOT_FOUND = 'Clínica não encontrada';

/**
 * Cadastro de uma clínica visto pela plataforma (B4, #214), com o status do
 * canal de e-mail (C4, #267) — nunca o remetente, o erro nem a chave.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return handleRequest(async () => {
    const { services, clinic } = await loadPlatformClinic(id);
    return toPlatformClinicDetailDto(
      clinic,
      await services.clinicChannels.findStatus('email'),
    );
  });
}

/**
 * Edição do cadastro pelo super_admin (Journey 6): parcial, mesma regra da tela
 * de Configurações. O evento vai para a auditoria da clínica-alvo.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return handleRequest(async () => {
    const {
      services: { clinics, auditEvents },
    } = await loadPlatformClinic(id);
    const changes = clinicInfoChangesSchema.parse(await request.json());
    const updated = await new UpdateClinicInfo(clinics).execute(id, changes);
    if (!updated) throw new Error(CLINIC_NOT_FOUND);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-info',
      resourceId: id,
      clinicId: id,
    });
    return toPlatformClinicDto(updated);
  });
}
