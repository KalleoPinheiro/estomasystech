'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import {
  findPatientOrThrow,
  getPartnerShareConsent,
  registerPaperPartnerShareConsent,
  revokePartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { clientIpFromHeader } from '@/lib/auth/client-ip';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import { toPartnerShareConsentDto } from '@/lib/dto';
import { PARTNER_SHARE_CONSENT } from '@/lib/partner-share-consent-text';
import { defineAction } from '@/lib/server/define-action';
import { authorizePatientAccess } from '@/lib/server/ficha-authorization';
import { canRoleAccess } from '@/lib/staff-pages';

/**
 * Consentimento do paciente para o parceiro que o indicou, na ficha (#292,
 * #310; #552, ADR-080). O registro e a trilha vão na MESMA transação.
 */

const PATIENT_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/patients', role),
);
/** Decisão de @KalleoPinheiro na #310: só o Admin de Empresa e o Atendente lançam o papel. */
const PAPER_ROLES = PATIENT_ROLES.filter(
  (role) => role === 'company_admin' || role === 'atendente',
);

const input = z.object({ patientId: z.string().min(1).max(100) });

async function requestIp(): Promise<string> {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS) || 1;
  return clientIpFromHeader((await headers()).get('x-forwarded-for'), hops);
}

/** Consentimento dado em papel, lançado pela equipe; idempotente com o texto vigente. */
export const registerPaperConsent = defineAction({
  access: { kind: 'staff', roles: PAPER_ROLES },
  input,
  handler: async ({ input, session, tx }) => {
    const patient = await findPatientOrThrow(tx.patients, input.patientId);
    const { record, created } = await registerPaperPartnerShareConsent(
      tx,
      patient,
      PARTNER_SHARE_CONSENT,
      session.subject,
      await requestIp(),
    );
    const view = await getPartnerShareConsent(
      tx,
      patient,
      PARTNER_SHARE_CONSENT,
    );
    return {
      created,
      recordId: record.id,
      partnerId: record.partnerId,
      textVersion: record.textVersion,
      consent: view
        ? toPartnerShareConsentDto(view, PARTNER_SHARE_CONSENT, {
            includeRecordedBy: true,
          })
        : null,
    };
  },
  audit: ({ input, result }) => ({
    action: result.created ? 'create' : 'update',
    resourceType: 'partner-consent',
    resourceId: result.recordId,
    patientId: input.patientId,
    detail: result.created
      ? `consentimento em papel lançado pela equipe; parceiro ${result.partnerId}; texto ${result.textVersion}`
      : `consentimento em papel já ativo; nada gravado; parceiro ${result.partnerId}`,
  }),
});

/** Revogação pela equipe (ex.: o paciente pediu na recepção); o aceite é sempre do paciente. */
export const revokePartnerConsent = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input,
  authorize: (context) =>
    authorizePatientAccess(context, context.input.patientId),
  handler: async ({ input, session, tx }) => {
    const patient = await findPatientOrThrow(tx.patients, input.patientId);
    const record = await revokePartnerShareConsent(
      tx,
      patient,
      'staff',
      await requestIp(),
      session.subject,
    );
    return {
      active: false as const,
      revokedAt: record.recordedAt.toISOString(),
      recordId: record.id,
      partnerId: record.partnerId,
    };
  },
  audit: ({ input, result }) => ({
    action: 'update',
    resourceType: 'partner-consent',
    resourceId: result.recordId,
    patientId: input.patientId,
    detail: `revogação pela equipe; parceiro ${result.partnerId}`,
  }),
});
