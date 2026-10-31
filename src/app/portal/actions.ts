'use server';

import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import {
  acceptPartnerShareConsent,
  revokePartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { OpenDataSubjectRequest } from '@/application/patients/data-subject-requests';
import { CancelOwnAppointment } from '@/application/portal/cancel-own-appointment';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  listRepresentablePatients,
  resolveConsentSigner,
  resolvePortalPatient,
} from '@/application/portal/portal-identity';
import {
  applyGuardianAccessRevocation,
  GUARDIAN_ACCESS_REVOCATION_DETAIL,
  GUARDIAN_ACCESS_REVOCATION_RESOURCE,
  notifyGuardianOfRevocation,
} from '@/application/portal/revoke-guardian-access';
import { ResolveWaitlistEntry } from '@/application/scheduling/waitlist';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { ActionResult } from '@/lib/action-result';
import {
  ACTING_PATIENT_COOKIE,
  actingPatientCookieOptions,
} from '@/lib/auth/acting-patient';
import { clientIpFromHeaders } from '@/lib/auth/client-ip';
import { portalActorNoun } from '@/lib/auth/portal-actor';
import { writeClinicId, writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { acceptedTemplates, CONSENT_DOCUMENTS } from '@/lib/consent-documents';
import { toDataSubjectRequestDto } from '@/lib/dto';
import { toPortalAppointmentDto } from '@/lib/dto/appointment';
import { toWaitlistEntryDto } from '@/lib/dto/waitlist';
import { controllerSnapshot } from '@/lib/legal-text';
import { PARTNER_SHARE_CONSENT as PARTNER_CONSENT } from '@/lib/partner-share-consent-text';
import {
  consentPurposeSchema,
  MINOR_ERASURE_AT_CLINIC_MESSAGE,
  openDataRequestSchema,
} from '@/lib/portal-input';
import { controllerOf } from '@/lib/server/data/portal';
import { defineAction } from '@/lib/server/define-action';
import { readSession, withActingPatient } from '@/lib/server/session';

/**
 * Atos de LGPD do portal como Server Action (#553, PR 2a, ADR-081 § 5): aceite
 * e revogação dos termos, consentimento do parceiro e pedido do titular. Cada
 * ação grava e audita na MESMA transação (ADR-075): sem trilha, o ato não
 * existe. A sessão do responsável ganha o paciente escolhido (cookie) e o IP
 * de evidência vem do cabeçalho do proxy confiável, nunca do corpo.
 */

const PORTAL_PATIENT_ACCESS = {
  kind: 'portal',
  roles: ['patient', 'guardian'],
} as const;

/** IP do aceite: a mesma derivação das rotas (`TRUSTED_PROXY_HOPS`), nunca o cliente. */
async function evidenceIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}

/**
 * Aceite digital: hash do texto-base + clínica e encarregado exibidos + data +
 * IP (evidência LGPD). O representante legal assina pelo menor e o registro
 * guarda o cadastro e o parentesco dele (#372, ADR-032).
 */
export const acceptConsent = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: consentPurposeSchema,
  handler: async ({ input, session, tx }) => {
    const identity = await withActingPatient(session);
    const document = CONSENT_DOCUMENTS[input.purpose];
    const { patient, signer } = await resolveConsentSigner(tx, identity);

    const existing = await tx.consentRecords.findByPatientId(patient.id);
    const status = ConsentRecord.resolveStatus(
      existing,
      acceptedTemplates(document),
      input.purpose,
      patient,
    );
    // Já aceito: só grava de novo quando o paciente, já adulto, assina em
    // nome próprio o que o representante aceitou por ele.
    const resignsOwnName = signer === null && !!status.current?.signer;
    if (status.accepted && status.current && !resignsOwnName) {
      return {
        accepted: true as const,
        acceptedAt: status.current.acceptedAt.toISOString(),
        recordId: null,
        patientId: patient.id,
        signed: false,
        textHash: null,
      };
    }

    // Sem controlador identificável (CNPJ, canal do encarregado) não há aceite:
    // o paciente não saberia a quem recorrer (LGPD, arts. 9º e 41).
    const controller = await controllerOf(tx.clinics, writeClinicId(session));
    const record = ConsentRecord.create({
      patientId: patient.id,
      consentText: signer ? document.representativeTemplate : document.template,
      textVersion: signer ? document.representativeVersion : document.version,
      purpose: input.purpose,
      controllerSnapshot: controllerSnapshot(controller),
      ipAddress: await evidenceIp(),
      signer,
    });
    await tx.consentRecords.save(record);
    return {
      accepted: true as const,
      acceptedAt: record.acceptedAt.toISOString(),
      recordId: record.id,
      patientId: patient.id,
      signed: signer !== null,
      textHash: record.textHash,
    };
  },
  audit: ({ input, result }) =>
    result.recordId
      ? {
          action: 'create',
          resourceType: 'consent',
          resourceId: result.recordId,
          patientId: result.patientId,
          detail: `${input.purpose} · hash ${result.textHash?.slice(0, 12)}…${result.signed ? ' · pelo representante legal' : ''}`,
        }
      : null,
});

/**
 * Revogação do consentimento (LGPD art. 8º/18): registro imutável, o aceite
 * original fica no histórico. O representante legal revoga pelo menor; o
 * responsável de adulto recebe `403`.
 */
export const revokeConsent = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: consentPurposeSchema,
  handler: async ({ input, session, tx }) => {
    const { patient, signer } = await resolveConsentSigner(
      tx,
      await withActingPatient(session),
    );
    const record = ConsentRecord.revoke({
      patientId: patient.id,
      purpose: input.purpose,
      ipAddress: await evidenceIp(),
      signer,
    });
    await tx.consentRecords.save(record);
    return {
      accepted: false as const,
      revoked: true as const,
      revokedAt: record.acceptedAt.toISOString(),
      recordId: record.id,
      patientId: patient.id,
      signed: signer !== null,
    };
  },
  audit: ({ input, result }) => ({
    action: 'update',
    resourceType: 'consent',
    resourceId: result.recordId,
    patientId: result.patientId,
    detail: `revogação de consentimento (${input.purpose})${result.signed ? ' · pelo representante legal' : ''}`,
  }),
});

/** Aceite do compartilhamento com o parceiro indicador (#292, #375). */
export const acceptPartnerConsent = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: z.object({}),
  handler: async ({ session, tx }) => {
    const { patient, signer } = await resolveConsentSigner(
      tx,
      await withActingPatient(session),
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const { record, created } = await acceptPartnerShareConsent(
      tx,
      patient,
      PARTNER_CONSENT,
      await evidenceIp(),
      signer,
    );
    return {
      active: true as const,
      acceptedAt: record.recordedAt.toISOString(),
      created,
      recordId: record.id,
      partnerId: record.partnerId,
      textVersion: record.textVersion,
      patientId: patient.id,
      signed: signer !== null,
    };
  },
  audit: ({ result }) =>
    result.created
      ? {
          action: 'create',
          resourceType: 'partner-consent',
          resourceId: result.recordId,
          patientId: result.patientId,
          detail: `parceiro ${result.partnerId}; versão ${result.textVersion}${result.signed ? '; pelo representante legal' : ''}`,
        }
      : null,
});

/** Revogação do compartilhamento com o parceiro: registro novo, o aceite fica no histórico. */
export const revokePartnerConsent = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: z.object({}),
  handler: async ({ session, tx }) => {
    const { patient, signer } = await resolveConsentSigner(
      tx,
      await withActingPatient(session),
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const record = await revokePartnerShareConsent(
      tx,
      patient,
      'patient',
      await evidenceIp(),
      null,
      signer,
    );
    return {
      active: false as const,
      revokedAt: record.recordedAt.toISOString(),
      recordId: record.id,
      partnerId: record.partnerId,
      patientId: patient.id,
      signed: signer !== null,
    };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'partner-consent',
    resourceId: result.recordId,
    patientId: result.patientId,
    detail: `revogação pelo ${result.signed ? 'representante legal' : 'paciente'}; parceiro ${result.partnerId}`,
  }),
});

/**
 * Pedido de correção cadastral ou de eliminação/anonimização (LGPD art. 18).
 * Vai para a fila do Admin; nada muda no cadastro até a análise. O
 * representante do menor pede correção; a eliminação é só na clínica (#375).
 * O aviso aos Admins sai depois da resposta e nunca desfaz o pedido (#312).
 */
export const openDataRequest = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: openDataRequestSchema,
  handler: async ({ input, session, scope, tx }) => {
    // Quem pode pedir vem antes do conteúdo: responsável de adulto recebe 403.
    const { patient, signer } = await resolveConsentSigner(
      tx,
      await withActingPatient(session),
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    if (signer && input.kind === 'erasure') {
      throw new ForbiddenError(MINOR_ERASURE_AT_CLINIC_MESSAGE);
    }
    const outside = await getRepositories(scope);
    const created = await new OpenDataSubjectRequest(
      tx.dataSubjectRequests,
      tx.userAccounts,
      outside.email,
    ).prepare({ ...input, patientId: patient.id });
    await tx.dataSubjectRequests.save(created);
    // O aviso lê as contas e envia o e-mail fora da transação, já confirmada.
    after(() =>
      new OpenDataSubjectRequest(
        outside.dataSubjectRequests,
        outside.userAccounts,
        outside.email,
      ).notifyAdmins(created),
    );
    return {
      request: toDataSubjectRequestDto(created),
      patientId: patient.id,
      signed: signer !== null,
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'data_request',
    resourceId: result.request.id,
    patientId: result.patientId,
    detail: result.signed
      ? `${result.request.kind} · pelo representante legal`
      : result.request.kind,
  }),
});

/**
 * Efeito de fora do banco (calendário externo, e-mail, cookie) que só vale
 * depois que a transação CONFIRMOU: a ação interna grava e audita; se ela
 * falha, o efeito nunca roda (#553, PR 2b).
 */
function afterCommit<I, R>(
  action: (input: I) => Promise<ActionResult<R>>,
  effect: (done: { input: I; data: R }) => Promise<void>,
): (input: I) => Promise<ActionResult<R>> {
  return async (input) => {
    const result = await action(input);
    if (result.success) await effect({ input, data: result.data });
    return result;
  };
}

/** Escopo de escrita da sessão que acabou de executar a ação. */
async function committedScope() {
  const state = await readSession();
  if (state.status !== 'active') {
    throw new ForbiddenError('Não autenticado');
  }
  return { session: state.session, scope: writeScope(state.session) };
}

const appointmentIdSchema = z.object({
  appointmentId: z.string().min(1).max(100),
  reason: z.string().max(1000).nullish(),
});

const cancelAppointmentInner = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: appointmentIdSchema,
  handler: async ({ input, session, tx }) => {
    const patient = await resolvePortalPatient(
      tx,
      await withActingPatient(session),
    );
    const { appointment, changed } = await new CancelOwnAppointment(
      tx.patients,
      tx.appointments,
      tx.scheduleConfig,
    ).execute({
      patientId: patient.id,
      appointmentId: input.appointmentId,
      reason: input.reason ?? null,
    });
    return {
      appointment: toPortalAppointmentDto(appointment),
      patientId: patient.id,
      changed,
      actor: portalActorNoun(session),
    };
  },
  // Repetição idempotente (já cancelada pelo paciente) não grava nem audita.
  audit: ({ result }) =>
    result.changed
      ? {
          action: 'update',
          resourceType: 'appointment',
          resourceId: result.appointment.id,
          patientId: result.patientId,
          detail: `cancelada pelo ${result.actor} no portal`,
        }
      : null,
});

/**
 * Cancelamento da própria consulta, com a antecedência mínima da clínica. A
 * remoção no Google Calendar sai depois da confirmação, fora da transação.
 */
export const cancelAppointment = afterCommit(
  cancelAppointmentInner,
  async ({ data }) => {
    if (!data.changed) return;
    const { scope } = await committedScope();
    const services = await getRepositories(scope);
    const eventId = (await services.appointments.findById(data.appointment.id))
      ?.googleEventId;
    if (eventId) {
      scheduleCalendarSync(services, (sync) => sync.removed(eventId));
    }
  },
);

/** Paciente sai da lista de espera (só a própria entrada; de outro paciente é 404). */
export const leaveWaitlist = defineAction({
  access: PORTAL_PATIENT_ACCESS,
  input: z.object({ id: z.string().min(1).max(100) }),
  handler: async ({ input, session, tx }) => {
    const patient = await resolvePortalPatient(
      tx,
      await withActingPatient(session),
    );
    const entry = await new ResolveWaitlistEntry(tx.waitlist).execute(
      input.id,
      'removed',
      { patientId: patient.id },
    );
    return {
      entry: toWaitlistEntryDto(entry),
      actor: portalActorNoun(session),
    };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'waitlist-entry',
    resourceId: result.entry.id,
    patientId: result.entry.patientId,
    detail: `saiu da lista pelo portal (${result.actor})`,
  }),
});

const revokeGuardianAccessInner = defineAction({
  // Só o paciente: o responsável não revoga a própria autorização (ADR-028).
  access: { kind: 'portal', roles: ['patient'] },
  input: z.object({}),
  handler: async ({ session, tx }) => {
    const patient = await resolvePortalPatient(
      tx,
      await withActingPatient(session),
    );
    await applyGuardianAccessRevocation(tx, patient);
    return { revoked: true as const, patientId: patient.id };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: GUARDIAN_ACCESS_REVOCATION_RESOURCE,
    resourceId: result.patientId,
    patientId: result.patientId,
    detail: GUARDIAN_ACCESS_REVOCATION_DETAIL,
  }),
});

/**
 * O paciente encerra o acesso do responsável (ADR-028). O aviso por e-mail ao
 * responsável sai depois da confirmação (`after()`) e nunca desfaz a revogação.
 */
export const revokeGuardianAccess = afterCommit(
  revokeGuardianAccessInner,
  async ({ data }) => {
    const { session, scope } = await committedScope();
    const services = await getRepositories(scope);
    const patient = await services.patients.findById(data.patientId);
    if (!patient?.guardianId) return;
    const guardianId = patient.guardianId;
    after(() =>
      notifyGuardianOfRevocation(
        {
          auditEvents: services.auditEvents,
          guardians: services.guardians,
          email: services.email,
        },
        patient,
        guardianId,
        { subject: session.subject, clinicId: session.clinicId },
      ),
    );
  },
);

const actingForInner = defineAction({
  access: { kind: 'portal', roles: ['guardian'] },
  input: z.object({ patientId: z.string().min(1).max(100) }),
  handler: async ({ input, session, tx }) => {
    const patients = await listRepresentablePatients(tx, session);
    if (!patients.some((p) => p.id === input.patientId)) {
      throw new NotFoundError('Paciente', input.patientId);
    }
    return { patientId: input.patientId };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'guardian-acting-for',
    resourceId: result.patientId,
    patientId: result.patientId,
    detail: 'responsável passou a agir em nome do paciente',
  }),
});

/**
 * Escolhe em nome de quem o responsável age (ADR-027): valida o vínculo, grava
 * a escolha na trilha e SÓ DEPOIS da confirmação grava o cookie. O `refresh()`
 * da ação já renderiza a tela com o cookie novo.
 */
export const actForPatient = afterCommit(actingForInner, async ({ data }) => {
  (await cookies()).set(
    ACTING_PATIENT_COOKIE,
    data.patientId,
    actingPatientCookieOptions(),
  );
});

const stopActingInner = defineAction({
  access: { kind: 'portal', roles: ['guardian'] },
  input: z.object({}),
  handler: async () => ({ patientId: null }),
  audit: false,
});

/** Deixa de agir em nome do paciente atual (troca de paciente ou saída). */
export const stopActingForPatient = afterCommit(stopActingInner, async () => {
  (await cookies()).set(ACTING_PATIENT_COOKIE, '', {
    ...actingPatientCookieOptions(),
    maxAge: 0,
  });
});
