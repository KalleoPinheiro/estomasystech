import type { NextRequest } from 'next/server';
import { AddConditionPhoto } from '@/application/clinical/add-condition-photo';
import { assertPatientPhotoQuota } from '@/application/portal/assert-photo-quota';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { MAX_PHOTO_BYTES } from '@/domain/clinical/condition-photo';
import { ConsentRecord } from '@/domain/consent/consent-record';
import {
  ConsentRequiredError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { portalActorNoun } from '@/lib/auth/portal-actor';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { CONSENT_TEXT } from '@/lib/consent-text';

/**
 * Monitoramento remoto (O4.2): paciente envia foto da própria condição ativa.
 * Mesmo pipeline do F6 (magic bytes, 5 MB, storage privado); entra na fila de
 * triagem da equipe como origem "patient".
 */
export async function POST(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const conditionId = form?.get('conditionId');
  if (
    !(file instanceof File) ||
    typeof conditionId !== 'string' ||
    !conditionId
  ) {
    return fail("Envie 'file' e 'conditionId' (multipart/form-data)", 400);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return fail('Imagem excede o limite de 5 MB', 400);
  }
  const note = form?.get('note');

  return handleRequest(async () => {
    const services = await getRepositories(writeScope(session));
    const {
      conditions,
      conditionPhotos,
      consentRecords,
      photoStorage,
      auditEvents,
    } = services;

    // Sem titular vinculado, a resposta é a mesma de condição alheia (404).
    const patient = await resolvePortalPatient(services, session).catch(
      () => null,
    );
    const condition = await conditions.findById(conditionId);
    // Escopo da sessão: só condição do próprio paciente, e ativa.
    if (!patient || !condition || condition.patientId !== patient.id) {
      throw new NotFoundError('Condição', conditionId);
    }
    if (condition.status !== 'active') {
      throw new ValidationError('Condição já resolvida — fale com a clínica');
    }

    // Gate de consentimento (COMP3-01): tratamento de imagem exige base legal
    // registrada — sem aceite vigente do termo atual, nada é gravado.
    const consents = await consentRecords.findByPatientId(patient.id);
    if (!ConsentRecord.resolveStatus(consents, CONSENT_TEXT).accepted) {
      throw new ConsentRequiredError(
        session.role === 'guardian'
          ? 'Consentimento pendente — o próprio paciente precisa aceitar o termo no portal antes do envio de fotos'
          : 'Consentimento pendente — aceite o termo de consentimento no portal antes de enviar fotos',
      );
    }

    // Cota diária (#213): checada depois do consentimento e antes de gravar.
    await assertPatientPhotoQuota(conditions, conditionPhotos, patient.id);

    const photo = await new AddConditionPhoto(
      conditionPhotos,
      conditions,
      photoStorage,
    ).execute({
      conditionId,
      data: new Uint8Array(await file.arrayBuffer()),
      origin: 'patient',
      patientNote: typeof note === 'string' && note ? note.slice(0, 500) : null,
    });

    recordAudit(auditEvents, session, {
      action: 'create',
      resourceType: 'photo',
      resourceId: photo.id,
      patientId: patient.id,
      detail: `envio remoto do ${portalActorNoun(session)}`,
    });
    return { id: photo.id, triageStatus: photo.triageStatus };
  });
}
