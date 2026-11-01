import 'server-only';
import { getPartnerShareConsent } from '@/application/partners/partner-share-consent';
import { getGuardianAccess } from '@/application/portal/get-guardian-access';
import { GetPartnerPortalData } from '@/application/portal/get-partner-portal-data';
import { GetPatientPortalData } from '@/application/portal/get-patient-portal-data';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  consentSignerFor,
  listRepresentablePatients,
  resolveConsentSigner,
  resolvePortalPartner,
  resolvePortalPatient,
} from '@/application/portal/portal-identity';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import type { ConsentPurpose } from '@/domain/consent/consent-record';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { cancellationPolicyOf } from '@/domain/scheduling/schedule-config';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { recordAudit } from '@/lib/audit';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import type { Session } from '@/lib/auth/session';
import { sessionScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { acceptedTemplates, CONSENT_DOCUMENTS } from '@/lib/consent-documents';
import {
  type DataSubjectRequestDto,
  type PartnerShareConsentDto,
  toConditionPhotoDto,
  toDataSubjectRequestDto,
  toFollowUpDto,
  toInvoiceDto,
  toPartnerDto,
  toPartnerShareConsentDto,
  toPortalAppointmentDto,
  toPortalAssessmentDto,
  toPortalConditionDto,
  toPortalPatientProfileDto,
  toReferredPatientSummaryDto,
} from '@/lib/dto';
import { controllerFromClinic, renderLegalText } from '@/lib/legal-text';
import {
  PARTNER_SHARE_CONSENT as PARTNER_CONSENT,
  PARTNER_SHARE_CONSENT_TEXT,
} from '@/lib/partner-share-consent-text';
import { loadBlock } from '@/lib/server/data/load-block';
import { waitlistWithNames } from '@/lib/waitlist-names';

/**
 * Dados do portal no servidor (#553, ADR-081). Cada função aqui é a MESMA
 * regra das rotas `GET /api/portal/*`, que passam a chamá-la, e a fonte da
 * página `/portal`: um só lugar monta o DTO (ADR-074 § 3). Sempre com o escopo
 * da sessão (regra 1) e sem cache compartilhado (ADR-069).
 */

function toGuardianAccessDto(
  access: Awaited<ReturnType<typeof getGuardianAccess>>,
) {
  return access
    ? {
        fullName: access.fullName,
        relationshipLabel: access.relationshipLabel,
        lastAccessAt: access.lastAccessAt?.toISOString() ?? null,
      }
    : null;
}

/** Portal do paciente (ou do menor, para o responsável). A leitura do titular é auditada (LGPD). */
export async function loadPatientPortal(session: PatientPortalSession) {
  // E-mail pode repetir entre empresas (MT-06): a busca e o resto ficam na
  // clínica da conta.
  const services = await getRepositories(sessionScope(session));
  const data = await new GetPatientPortalData(
    services.patients,
    services.appointments,
    services.conditions,
    services.assessments,
    services.invoices,
    services.followUps,
    services.conditionPhotos,
  ).execute({
    patientId: (await resolvePortalPatient(services, session)).id,
  });
  const isGuardian = session.role === 'guardian';

  recordAudit(services.auditEvents, session, {
    action: 'read',
    resourceType: 'portal-patient',
    resourceId: data.patient.id,
    patientId: data.patient.id,
  });
  return {
    patient: toPortalPatientProfileDto(data.patient),
    appointments: data.appointments.map(toPortalAppointmentDto),
    conditions: data.conditions.map(
      ({ condition, assessments: list, photos }) => ({
        condition: toPortalConditionDto(condition),
        assessments: list.map(toPortalAssessmentDto),
        photos: photos.map(toConditionPhotoDto),
      }),
    ),
    invoices: data.invoices.map((i) => toInvoiceDto(i)),
    followUps: data.followUps.map((f) => toFollowUpDto(f)),
    // Evidência (ADR-027): o responsável vê em nome de quem age; o paciente
    // vê quem pode agir em nome dele e quando foi o último acesso.
    actingFor: isGuardian
      ? { patientId: data.patient.id, fullName: data.patient.fullName }
      : null,
    guardianAccess: isGuardian
      ? null
      : toGuardianAccessDto(await getGuardianAccess(services, data.patient)),
    // Antecedência mínima para cancelar/remarcar pelo portal (política da clínica).
    changeNoticeHours: cancellationPolicyOf(await services.scheduleConfig.get())
      .noticeHours,
  };
}

export type PatientPortalData = Awaited<ReturnType<typeof loadPatientPortal>>;

/** Portal do parceiro: só o que o paciente autorizou compartilhar. */
export async function loadPartnerPortal(session: Session) {
  const services = await getRepositories(sessionScope(session));
  const data = await new GetPartnerPortalData(
    services.partners,
    services.patients,
    services.appointments,
    services.conditions,
    services.assessments,
    {
      repository: services.partnerShareConsents,
      consentText: PARTNER_SHARE_CONSENT_TEXT,
    },
  ).execute({
    partnerId: (await resolvePortalPartner(services, session)).id,
  });

  recordAudit(services.auditEvents, session, {
    action: 'read',
    resourceType: 'portal-partner',
    resourceId: data.partner.id,
    detail: `pacientes indicados: ${data.referredPatients.length}; com consentimento: ${data.referredPatients.filter((entry) => entry.sharing).length}`,
  });
  return {
    partner: toPartnerDto(data.partner),
    referredPatients: data.referredPatients.map((entry) => ({
      patient: toReferredPatientSummaryDto(entry.patient),
      sharing: entry.sharing,
      attended: entry.attended,
      appointments: entry.appointments.map(toPortalAppointmentDto),
      conditions: entry.conditions.map(({ condition, assessments: list }) => ({
        condition: toPortalConditionDto(condition),
        assessments: list.map(toPortalAssessmentDto),
      })),
    })),
  };
}

export type PartnerPortalData = Awaited<ReturnType<typeof loadPartnerPortal>>;

/**
 * Pacientes que o responsável pode representar (ADR-027) e o escolhido agora.
 * Só nome. Com um único paciente, ele já vale como escolhido.
 */
export async function loadRepresentedPatients(session: PatientPortalSession) {
  const services = await getRepositories(sessionScope(session));
  const patients = await listRepresentablePatients(services, session);
  const only = patients.length === 1 ? patients[0] : undefined;
  const selected =
    patients.find((p) => p.id === session.actingPatientId) ?? only ?? null;
  return {
    patients: patients.map((p) => ({ id: p.id, fullName: p.fullName })),
    selectedPatientId: selected?.id ?? null,
  };
}

/** Controlador (clínica + encarregado) que o paciente vê nos termos. */
export async function controllerOf(
  clinics: ClinicRepository,
  clinicId: string,
) {
  const clinic = await clinics.findById(clinicId);
  if (!clinic) throw new NotFoundError('Clínica', clinicId);
  return controllerFromClinic(clinic);
}

/**
 * Status do aceite a partir do resultado de `resolveStatus` — `acceptedAt` e
 * `textVersion` sempre do último ACEITE real, nunca da revogação (AC-70-2).
 */
function toConsentStatusDto(
  status: ReturnType<typeof ConsentRecord.resolveStatus>,
  purpose: string,
  consentText: string,
  canSign: boolean,
) {
  const current = status.current;
  const revokedAt =
    current?.kind === 'revoke' ? current.acceptedAt.toISOString() : null;
  return {
    purpose,
    consentText,
    accepted: status.accepted,
    revoked: revokedAt !== null,
    // Quem está logado pode assinar este termo (o representante só pelo menor; #372).
    canSign,
    acceptedAt: status.latestAccept?.acceptedAt.toISOString() ?? null,
    textVersion: status.latestAccept?.textVersion ?? null,
    // Parentesco de quem assinou pelo menor; nulo quando foi o próprio paciente.
    signedByRelationship: status.latestAccept?.signer?.relationship ?? null,
    // O aceite do representante venceu (90 dias após os 18; #375): aceite de novo.
    representativeExpired: status.representativeExpired ?? false,
    revokedAt,
  };
}

/** Texto vigente (com os dados da clínica) + status do aceite do paciente logado. */
export async function loadConsentStatus(
  session: PatientPortalSession,
  purpose: ConsentPurpose,
) {
  const document = CONSENT_DOCUMENTS[purpose];
  const services = await getRepositories(sessionScope(session));
  const patient = await resolvePortalPatient(services, session);
  const records = await services.consentRecords.findByPatientId(patient.id);
  const status = ConsentRecord.resolveStatus(
    records,
    acceptedTemplates(document),
    purpose,
    patient,
  );
  const canSign = await consentSignerFor(services, session, patient)
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof ForbiddenError) return false;
      throw error;
    });
  const controller = await controllerOf(
    services.clinics,
    writeClinicId(session),
  );
  return toConsentStatusDto(
    status,
    purpose,
    // O representante legal lê (e assina) o texto redigido em nome dele (#469).
    renderLegalText(
      canSign && session.role === 'guardian'
        ? document.representativeTemplate
        : document.template,
      controller,
    ),
    canSign,
  );
}

export type ConsentStatusData = Awaited<ReturnType<typeof loadConsentStatus>>;

/** Pedidos do próprio paciente ainda na fila de espera. */
export async function loadMyWaitlist(session: PatientPortalSession) {
  const services = await getRepositories(sessionScope(session));
  const patient = await resolvePortalPatient(services, session);
  const entries = (await services.waitlist.findByPatient(patient.id)).filter(
    (entry) => entry.status === 'waiting',
  );
  return waitlistWithNames(services, entries);
}

/** Pedidos do titular (ou do representante do menor, #375), com a resposta da clínica (#293). */
export async function loadDataRequests(
  session: PatientPortalSession,
): Promise<DataSubjectRequestDto[]> {
  const repos = await getRepositories(sessionScope(session));
  const { patient } = await resolveConsentSigner(
    repos,
    session,
    ADULT_TITULAR_ONLY_MESSAGE,
  );
  const requests = await repos.dataSubjectRequests.findByPatient(patient.id);
  return requests.map((item) => toDataSubjectRequestDto(item));
}

/** Consentimento para o parceiro indicador (#292); `null` quando não há parceiro. */
export async function loadPartnerShareConsent(
  session: PatientPortalSession,
): Promise<PartnerShareConsentDto | null> {
  const services = await getRepositories(sessionScope(session));
  const { patient } = await resolveConsentSigner(
    services,
    session,
    ADULT_TITULAR_ONLY_MESSAGE,
  );
  const view = await getPartnerShareConsent(services, patient, PARTNER_CONSENT);
  return view ? toPartnerShareConsentDto(view, PARTNER_CONSENT) : null;
}

/**
 * Tudo que a tela do paciente (ou do menor, para o responsável) mostra, lido em
 * paralelo no servidor. Cada bloco auxiliar falha sozinho: o termo que não
 * carrega some em vez de derrubar a tela. Os pedidos do titular e o
 * consentimento do parceiro só existem para quem decide (o responsável de
 * adulto não vê esses blocos), então nem são lidos para ele.
 */
export async function loadPatientPortalView(session: PatientPortalSession) {
  const [data, consent, imageConsent, waitlist] = await Promise.all([
    loadPatientPortal(session),
    loadBlock(() => loadConsentStatus(session, 'treatment')),
    loadBlock(() => loadConsentStatus(session, 'image')),
    loadBlock(() => loadMyWaitlist(session)),
  ]);
  const canDecide = !data.actingFor || consent.data?.canSign === true;
  const [dataRequests, partnerConsent] = canDecide
    ? await Promise.all([
        loadBlock(() => loadDataRequests(session)),
        loadBlock(() => loadPartnerShareConsent(session)),
      ])
    : [null, null];
  return {
    data,
    consent: consent.data,
    imageConsent: imageConsent.data,
    waitlist: waitlist.data ?? [],
    dataRequests: dataRequests?.data ?? null,
    partnerConsent: partnerConsent?.data ?? null,
  };
}
