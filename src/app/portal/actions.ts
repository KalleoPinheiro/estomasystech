'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import {
  acceptPartnerShareConsent,
  revokePartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { OpenDataSubjectRequest } from '@/application/patients/data-subject-requests';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  resolveConsentSigner,
} from '@/application/portal/portal-identity';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { ForbiddenError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { clientIpFromHeaders } from '@/lib/auth/client-ip';
import { writeClinicId } from '@/lib/auth/tenant-scope';
import { acceptedTemplates, CONSENT_DOCUMENTS } from '@/lib/consent-documents';
import { toDataSubjectRequestDto } from '@/lib/dto';
import { controllerSnapshot } from '@/lib/legal-text';
import { PARTNER_SHARE_CONSENT as PARTNER_CONSENT } from '@/lib/partner-share-consent-text';
import {
  consentPurposeSchema,
  MINOR_ERASURE_AT_CLINIC_MESSAGE,
  openDataRequestSchema,
} from '@/lib/portal-input';
import { controllerOf } from '@/lib/server/data/portal';
import { defineAction } from '@/lib/server/define-action';
import { withActingPatient } from '@/lib/server/session';

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
