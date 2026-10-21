import type { NextRequest } from 'next/server';
import { UpdateClinicInfo } from '@/application/platform/update-clinic-info';
import { getRepositories } from '@/infrastructure/container';
import { isPhotoStorageAvailable } from '@/infrastructure/storage/unavailable-photo-storage';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { clinicInfoChangesSchema } from '@/lib/clinic-info-schema';
import { clinicLogoUrl, toClinicRegistrationDto } from '@/lib/dto';

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
    const { clinics, photoStorage } = await getRepositories(
      clinicScope(clinicId),
    );
    const clinic = await clinics.findById(clinicId);
    if (!clinic) {
      throw new Error('Clínica não encontrada');
    }
    return {
      info: toClinicRegistrationDto(clinic),
      // Logo (#427): endereço e se o armazenamento aceita envio.
      identity: {
        logoUrl: clinicLogoUrl(clinic.logoKey),
        imageUploadAvailable: isPhotoStorageAvailable(photoStorage),
      },
    };
  });
}

export async function PUT(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  if (!canEditClinicInfo(guard.session.role)) {
    return fail('Apenas Admin de Empresa pode editar os dados da clínica', 403);
  }
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const body = clinicInfoChangesSchema.parse(await request.json());
    const { clinics, auditEvents } = await getRepositories(
      clinicScope(clinicId),
    );
    // Mesma regra da plataforma (B4): CNPJ canônico e único, contato válido.
    const updated = await new UpdateClinicInfo(clinics).execute(clinicId, body);
    if (!updated) {
      throw new Error('Clínica não encontrada');
    }
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-info',
      resourceId: clinicId,
    });
    return { info: toClinicRegistrationDto(updated) };
  });
}
