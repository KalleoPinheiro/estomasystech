import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { toClinicInfoDto } from '@/lib/dto';

const infoSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cnpj: z.string().max(30).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().max(120).nullish(),
  professionalName: z.string().max(200).nullish(),
  professionalRegistry: z.string().max(60).nullish(),
});

/**
 * Só quem administra a empresa edita os dados cadastrais da clínica (#61). O
 * super_admin não entra aqui (ADR-007): a matriz de famílias já o barra, e esta
 * checagem repete a regra como defesa em profundidade.
 */
const canEditClinicInfo = (role: string | undefined): boolean =>
  role === 'company_admin';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const { clinics } = await getRepositories(clinicScope(clinicId));
    const clinic = await clinics.findById(clinicId);
    if (!clinic) {
      throw new Error('Clínica não encontrada');
    }
    return { info: toClinicInfoDto(clinic) };
  });
}

export async function PUT(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  if (!canEditClinicInfo(guard.session?.role)) {
    return fail('Apenas Admin de Empresa pode editar os dados da clínica', 403);
  }
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const body = infoSchema.parse(await request.json());
    const { clinics, auditEvents } = await getRepositories(
      clinicScope(clinicId),
    );
    const clinic = await clinics.findById(clinicId);
    if (!clinic) {
      throw new Error('Clínica não encontrada');
    }
    const updated = clinic.updateInfo(body);
    await clinics.update(updated);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-info',
      resourceId: clinicId,
    });
    return { info: toClinicInfoDto(updated) };
  });
}
