import type { NextRequest } from 'next/server';
import { AddConditionPhoto } from '@/application/clinical/add-condition-photo';
import { MAX_PHOTO_BYTES } from '@/domain/clinical/condition-photo';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toConditionPhotoDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { conditionPhotos, conditions, auditEvents } = await getRepositories(
      sessionScope(guard.session),
    );
    const [photos, condition] = await Promise.all([
      conditionPhotos.findByConditionId(id),
      conditions.findById(id),
    ]);
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'photos',
      resourceId: id,
      patientId: condition?.patientId ?? null,
    });
    return photos.map(toConditionPhotoDto);
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return fail("Envie o arquivo no campo 'file' (multipart/form-data)", 400);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return fail('Imagem excede o limite de 5 MB', 400);
  }
  const assessmentId = form?.get('assessmentId');

  return handleRequest(async () => {
    const { conditionPhotos, conditions, photoStorage, auditEvents } =
      await getRepositories(writeScope(guard.session));
    const photo = await new AddConditionPhoto(
      conditionPhotos,
      conditions,
      photoStorage,
    ).execute({
      conditionId: id,
      data: new Uint8Array(await file.arrayBuffer()),
      assessmentId:
        typeof assessmentId === 'string' && assessmentId ? assessmentId : null,
    });
    const condition = await conditions.findById(id);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'photo',
      resourceId: photo.id,
      patientId: condition?.patientId ?? null,
    });
    return toConditionPhotoDto(photo);
  });
}
