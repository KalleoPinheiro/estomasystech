import type { ActionResult } from '@/lib/action-result';

/**
 * As Server Actions da ficha (#552, ADR-080) rodam no servidor; nos testes de
 * tela elas viram a mesma chamada que a rota `/api` recebia, contra o `fetch`
 * simulado de cada teste. Assim a tela é provada pelo comportamento (o que ela
 * pede, o que mostra no sucesso e na falha) e a gravação transacional com
 * auditoria é provada nos testes das ações (`tests/app/ficha-actions*.test.ts`).
 */
async function call<T = unknown>(
  url: string,
  method: string,
  body?: unknown,
): Promise<ActionResult<T>> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const envelope = (await response.json()) as {
    success: boolean;
    data: T;
    error: string | null;
  };
  return response.ok && envelope.success
    ? { success: true, data: envelope.data, error: null }
    : { success: false, data: null, error: envelope.error ?? 'Erro' };
}

type Id = { id: string };
type PatientId = { patientId: string };

export const cadastro = {
  saveAnamnesis: ({ patientId, body }: PatientId & { body: unknown }) =>
    call(`/api/patients/${patientId}/anamnesis`, 'PUT', body),
  linkPatientGuardian: ({
    patientId,
    guardianId,
  }: PatientId & { guardianId: string | null }) =>
    call(`/api/patients/${patientId}`, 'PUT', { guardianId }),
  createGuardian: (body: unknown) => call('/api/guardians', 'POST', body),
  updateGuardian: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/guardians/${id}`, 'PUT', body),
  deleteGuardian: ({ id }: Id) => call(`/api/guardians/${id}`, 'DELETE'),
};

export const prontuario = {
  createCondition: ({ patientId, body }: PatientId & { body: unknown }) =>
    call(`/api/patients/${patientId}/conditions`, 'POST', body),
  resolveCondition: ({ id }: Id) =>
    call(`/api/conditions/${id}`, 'PATCH', { action: 'resolve' }),
  addConditionAssessment: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/conditions/${id}/assessments`, 'POST', body),
  addEvolutionNote: ({ patientId, body }: PatientId & { body: unknown }) =>
    call(`/api/patients/${patientId}/evolutions`, 'POST', body),
};

export const planoCuidados = {
  openCarePlan: ({ patientId, body }: PatientId & { body: unknown }) =>
    call(`/api/patients/${patientId}/care-plans`, 'POST', body),
  resolveCarePlan: ({ id }: Id) =>
    call(`/api/care-plans/${id}`, 'PATCH', { action: 'resolve' }),
  addCarePlanDiagnosis: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/care-plans/${id}/diagnoses`, 'POST', body),
  prescribeCarePlanOutcome: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/care-plans/${id}/outcomes`, 'POST', body),
  prescribeCarePlanIntervention: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/care-plans/${id}/interventions`, 'POST', body),
  recordCarePlanIntervention: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/care-plan-interventions/${id}/records`, 'POST', body),
  evaluateCarePlanOutcome: ({ id, body }: Id & { body: unknown }) =>
    call(`/api/care-plan-outcomes/${id}/evaluations`, 'POST', body),
};

export const consentimento = {
  registerPaperConsent: ({ patientId }: PatientId) =>
    call(`/api/patients/${patientId}/partner-consent/paper`, 'POST'),
  revokePartnerConsent: ({ patientId }: PatientId) =>
    call(`/api/patients/${patientId}/partner-consent/revoke`, 'POST'),
};
