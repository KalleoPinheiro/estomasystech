import type { NextRequest } from 'next/server';
import { ManageClinicLogo } from '@/application/identity/manage-identity-image';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { clinicLogoUrl } from '@/lib/dto';
import { identityImageResponse } from '@/lib/identity-image-response';
import {
  IDENTITY_UPLOAD_RATE_LIMIT,
  readIdentityUpload,
  storageUnavailable,
  tooManyUploads,
} from '@/lib/identity-upload';

/**
 * Envio e remoção da logo: família `administrative` (só o Admin de Empresa, ADR-002).
 * A checagem de papel fica na camada 1 (proxy) e na guarda por família.
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);
  if (!(await IDENTITY_UPLOAD_RATE_LIMIT.allow(`logo:${clinicId}`))) {
    return tooManyUploads();
  }
  const upload = await readIdentityUpload(request);
  if (!upload.ok) return upload.response;

  const repos = await getRepositories(clinicScope(clinicId));
  const unavailable = storageUnavailable(repos.photoStorage);
  if (unavailable) return unavailable;

  return handleRequest(async () => {
    const { clinics, photoStorage, imageProcessor, auditEvents } = repos;
    const key = await new ManageClinicLogo(
      clinics,
      photoStorage,
      imageProcessor,
    ).set(clinicId, upload.data);
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-logo',
      resourceId: clinicId,
      detail: 'logo enviada',
    });
    return { logoUrl: clinicLogoUrl(key) };
  });
}

export async function DELETE(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const { clinics, photoStorage, imageProcessor, auditEvents } =
      await getRepositories(clinicScope(clinicId));
    await new ManageClinicLogo(clinics, photoStorage, imageProcessor).remove(
      clinicId,
    );
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'clinic-logo',
      resourceId: clinicId,
      detail: 'logo removida',
    });
    return { logoUrl: null };
  });
}
