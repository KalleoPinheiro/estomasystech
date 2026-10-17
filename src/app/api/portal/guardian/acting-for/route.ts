import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { listRepresentablePatients } from '@/application/portal/portal-identity';
import { AuditEvent } from '@/domain/audit/audit-event';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest, ok } from '@/lib/api-response';
import {
  ACTING_PATIENT_COOKIE,
  actingPatientCookieOptions,
} from '@/lib/auth/acting-patient';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

const bodySchema = z.object({ patientId: z.string().min(1).max(100) });

/** Escolhe em nome de quem o responsável age (ADR-027); grava a escolha na trilha. */
export async function PUT(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let chosen: string | null = null;
  const response = await handleRequest(async () => {
    const body = bodySchema.parse(await request.json());
    const services = await getRepositories(writeScope(session));
    const patients = await listRepresentablePatients(services, session);
    if (!patients.some((p) => p.id === body.patientId)) {
      throw new NotFoundError('Paciente', body.patientId);
    }
    await services.auditEvents.save(
      AuditEvent.create({
        clinicId: session.clinicId,
        actorRole: 'guardian',
        actorId: session.subject,
        action: 'update',
        resourceType: 'guardian-acting-for',
        resourceId: body.patientId,
        patientId: body.patientId,
        detail: 'responsável passou a agir em nome do paciente',
      }),
    );
    chosen = body.patientId;
    return { patientId: body.patientId };
  });
  if (chosen) {
    response.cookies.set(
      ACTING_PATIENT_COOKIE,
      chosen,
      actingPatientCookieOptions(),
    );
  }
  return response;
}

/** Deixa de agir em nome do paciente atual (troca de paciente ou saída). */
export async function DELETE(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;

  const response = ok({ patientId: null });
  response.cookies.delete(ACTING_PATIENT_COOKIE);
  return response;
}
