'use client';

import { type ReactNode, use } from 'react';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import { isMinorOn } from '@/domain/patient/majority';
import {
  CONSENT_REPRESENTATIVE_TEXT,
  CONSENT_REPRESENTATIVE_TEXT_VERSION,
} from '@/lib/consent-representative-text';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';
import type { PatientDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';
import {
  IMAGE_CONSENT_REPRESENTATIVE_TEXT,
  IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION,
} from '@/lib/image-consent-representative-text';
import {
  IMAGE_CONSENT_TEXT,
  IMAGE_CONSENT_TEXT_VERSION,
} from '@/lib/image-consent-text';
import { type LegalController, renderLegalText } from '@/lib/legal-text';
import { useApiQuery } from '@/lib/use-api-query';
import {
  type DocumentIssuance,
  useDocumentIssuance,
} from '@/lib/use-document-issuance';

function guardBlock(
  clinic: ClinicInfoDto | null,
  patient: PatientDto | null,
  controller: LegalController | null,
  error: string | null,
  issuance: DocumentIssuance | null,
  issuanceError: string | null,
): ReactNode | null {
  if (error || issuanceError)
    return <ErrorAlert message={error ?? issuanceError ?? ''} />;
  if (!clinic || !patient || !controller) return <LoadingIndicator />;
  if (!isClinicInfoComplete(clinic)) {
    return <ClinicInfoIncompleteAlert clinic={clinic} />;
  }
  // #94, DOC-01: sem emissão persistida ainda, não renderiza.
  if (!issuance) return <LoadingIndicator />;
  return null;
}

export default function ConsentDocumentPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  const { data: clinic } = useApiQuery<ClinicInfoDto>('/api/clinic-info');
  const { data: patient, error } = useApiQuery<PatientDto>(
    `/api/patients/${patientId}`,
  );
  // Clínica e encarregado que entram nos termos (#216): sem eles, `409`.
  const { data: controller, error: controllerError } =
    useApiQuery<LegalController>('/api/clinic-info/legal-controller');
  // Só emite (e grava na auditoria) com a clínica apta a emitir: página bloqueada não é emissão (#468).
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'consentimento',
    clinic && isClinicInfoComplete(clinic) ? patientId : null,
  );

  const guard = guardBlock(
    clinic,
    patient,
    controller,
    error ?? controllerError,
    issuance,
    issuanceError,
  );
  if (guard) return guard;
  if (!clinic || !patient || !controller || !issuance) return null;

  // Paciente menor com responsável cadastrado: o representante legal assina,
  // então o termo é o redigido em nome dele (#469, ADR-032).
  const guardian = patient.guardian ?? null;
  const byRepresentative =
    guardian !== null &&
    isMinorOn(patient.birthDate ? new Date(patient.birthDate) : null);
  const treatmentText = byRepresentative
    ? CONSENT_REPRESENTATIVE_TEXT
    : CONSENT_TEXT;
  const imageText = byRepresentative
    ? IMAGE_CONSENT_REPRESENTATIVE_TEXT
    : IMAGE_CONSENT_TEXT;
  const treatmentVersion = byRepresentative
    ? CONSENT_REPRESENTATIVE_TEXT_VERSION
    : CONSENT_TEXT_VERSION;
  const imageVersion = byRepresentative
    ? IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION
    : IMAGE_CONSENT_TEXT_VERSION;

  return (
    <DocumentFrame
      clinic={clinic}
      title="Termo de Consentimento Livre e Esclarecido"
      documentNumber={issuance.documentNumber}
      issuedAt={issuance.issuedAt}
      // #94, DOC-03: a data de emissão (rodapé) agora entra ANTES das duas
      // assinaturas — antes a assinatura da paciente vinha primeiro, quebrando
      // a semântica de um TCLE (a data pertence ao ato de consentir).
      patientSignature={{
        name: patient.fullName,
        roleLabel: 'Paciente ou responsável legal',
        legalGuardianLine: true,
        legalGuardian: patient.guardian
          ? {
              name: patient.guardian.fullName,
              relationshipLabel: patient.guardian.relationshipLabel,
            }
          : undefined,
      }}
      footerNote={
        <>
          <p>
            Versões dos termos: tratamento {treatmentVersion}, imagem{' '}
            {imageVersion}.
          </p>
          <p>
            Documento emitido em duas vias — uma para a clínica, uma para o(a)
            paciente.
          </p>
        </>
      }
    >
      {byRepresentative && guardian ? (
        <p className="mb-4">
          Eu, <strong>{guardian.fullName}</strong>, {guardian.relationshipLabel}{' '}
          e responsável legal de <strong>{patient.fullName}</strong>
          {patient.birthDate
            ? `, nascido(a) em ${formatDate(patient.birthDate)}`
            : ''}
          , li e concordo com o termo abaixo.
        </p>
      ) : (
        <p className="mb-4">
          Eu, <strong>{patient.fullName}</strong>
          {patient.birthDate
            ? `, nascido(a) em ${formatDate(patient.birthDate)}`
            : ''}
          , li e concordo com o termo abaixo.
        </p>
      )}
      <p className="mb-4 whitespace-pre-wrap">
        {renderLegalText(treatmentText, controller)}
      </p>

      {/* #94, DOC-09: autorização de imagem separada do consentimento do
          procedimento acima, com aceite próprio (#216, ADR-030). */}
      <div className="mt-8 border-black/30 border-t pt-4">
        <p className="mb-4 whitespace-pre-wrap">
          {renderLegalText(imageText, controller)}
        </p>
        <div className="mx-auto w-64 border-black border-t pt-1 text-center text-sm">
          {patient.fullName}
          <span className="block text-xs">Autorização de uso de imagem</span>
        </div>
      </div>
    </DocumentFrame>
  );
}
