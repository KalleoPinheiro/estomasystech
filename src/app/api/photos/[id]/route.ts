import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { DeleteConditionPhoto } from '@/application/clinical/delete-condition-photo';
import { FollowUp } from '@/domain/followup/follow-up';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit, recordAuditNow } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

/** Serve o binário da foto — rota exclusiva do staff (proxy barra portais). */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const repos = await getRepositories(writeScope(guard.session));
  const accessible = await assertClinicalResourceAccessible(
    guard.session,
    'photo',
    id,
    repos,
  ).then(
    () => true,
    (error: unknown) => {
      if (error instanceof NotFoundError) return false;
      throw error;
    },
  );
  if (!accessible) {
    return fail('Foto não encontrada', 404);
  }

  const { conditionPhotos, photoStorage } = repos;
  const photo = await conditionPhotos.findById(id);
  const data = photo ? await photoStorage.read(photo.id) : null;
  if (!photo || !data) {
    return fail('Foto não encontrada', 404);
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': photo.contentType,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    await assertClinicalResourceAccessible(guard.session, 'photo', id, repos);
    const { conditionPhotos, photoStorage, conditions, auditEvents } = repos;

    const photo = await conditionPhotos.findById(id);
    const condition = photo
      ? await conditions.findById(photo.conditionId)
      : null;

    // Trilha ANTES do destrutivo (SEC1-21): sem transação entre storage e banco,
    // auditar depois arriscaria apagar o dado clínico e perder o registro. Auditar
    // antes pode registrar uma exclusão que falhou — falha preferível.
    await recordAuditNow(auditEvents, guard.session, {
      action: 'delete',
      resourceType: 'photo',
      resourceId: id,
      patientId: condition?.patientId ?? null,
      detail: 'correção de upload',
    });
    await new DeleteConditionPhoto(conditionPhotos, photoStorage).execute({
      id,
    });
    return { deleted: true };
  });
}

const triageSchema = z.object({ triage: z.enum(['reviewed', 'escalated']) });

/**
 * Triagem da foto do paciente (O4.2): "reviewed" mantém o plano;
 * "escalated" antecipa o retorno criando follow-up com vencimento imediato.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    await assertClinicalResourceAccessible(guard.session, 'photo', id, repos);
    const body = triageSchema.parse(await request.json());
    const { conditionPhotos, conditions, followUps, auditEvents } = repos;

    const photo = await conditionPhotos.findById(id);
    if (!photo) {
      throw new NotFoundError('Foto', id);
    }
    const condition = await conditions.findById(photo.conditionId);

    const triaged = photo.withTriage(body.triage);
    await conditionPhotos.save(triaged);

    if (body.triage === 'escalated' && condition) {
      await followUps.save(
        FollowUp.create({
          patientId: condition.patientId,
          appointmentId: null,
          dueDate: new Date(),
          reason: `Retorno antecipado: foto de ${condition.title} sinaliza atenção`,
        }),
      );
    }

    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'photo',
      resourceId: id,
      patientId: condition?.patientId ?? null,
      detail: `triagem: ${body.triage}`,
    });
    return { id, triageStatus: triaged.triageStatus };
  });
}
