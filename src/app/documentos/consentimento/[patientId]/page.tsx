import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { DocumentFrame } from '@/components/document-frame';
import { ErrorAlert } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import { isMinorOn } from '@/domain/patient/majority';
import {
  CONSENT_REPRESENTATIVE_TEXT,
  CONSENT_REPRESENTATIVE_TEXT_VERSION,
} from '@/lib/consent-representative-text';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';
import { formatCivilDate } from '@/lib/format';
import {
  IMAGE_CONSENT_REPRESENTATIVE_TEXT,
  IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION,
} from '@/lib/image-consent-representative-text';
import {
  IMAGE_CONSENT_TEXT,
  IMAGE_CONSENT_TEXT_VERSION,
} from '@/lib/image-consent-text';
import { renderLegalText } from '@/lib/legal-text';
import {
  getClinicInfoFor,
  getLegalControllerFor,
} from '@/lib/server/data/clinic-info';
import { loadBlock } from '@/lib/server/data/load-block';
import { getPatientRecord } from '@/lib/server/data/patient-record';
import { findDocumentIssuance } from '@/lib/server/document-issuance';
import { requireStaffPage } from '@/lib/server/session';

/**
 * Termo de consentimento no servidor (#546, ADR-082): o texto legal sai no HTML;
 * só a emissão e o botão Imprimir são ilhas de cliente. Clínica incompleta
 * bloqueia a página e a emissão (#468).
 */
export default async function ConsentDocumentPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const session = await requireStaffPage({
    next: `/documentos/consentimento/${patientId}`,
  });
  const [clinic, patient, controller] = await Promise.all([
    loadBlock(() => getClinicInfoFor(session)),
    loadBlock(() => getPatientRecord(session, patientId)),
    // Clínica e encarregado que entram nos termos (#216): sem eles, `409`.
    loadBlock(() => getLegalControllerFor(session)),
  ]);
  if (patient.error !== null) return <ErrorAlert message={patient.error} />;
  if (controller.error !== null) {
    return <ErrorAlert message={controller.error} />;
  }
  if (clinic.error !== null) return <ErrorAlert message={clinic.error} />;
  if (!isClinicInfoComplete(clinic.data)) {
    return <ClinicInfoIncompleteAlert clinic={clinic.data} />;
  }
  const issuance = await findDocumentIssuance(
    session,
    'consentimento',
    patientId,
  );

  // Paciente menor com responsável cadastrado: o representante legal assina,
  // então o termo é o redigido em nome dele (#469, ADR-032).
  const patientData = patient.data;
  const guardian = patientData.guardian ?? null;
  const byRepresentative =
    guardian !== null &&
    isMinorOn(patientData.birthDate ? new Date(patientData.birthDate) : null);
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
      clinic={clinic.data}
      title="Termo de Consentimento Livre e Esclarecido"
      issue={{ documentType: 'consentimento', resourceId: patientId }}
      documentNumber={issuance?.documentNumber}
      issuedAt={issuance?.issuedAt}
      // #94, DOC-03: a data de emissão (rodapé) entra ANTES das duas
      // assinaturas — a data pertence ao ato de consentir.
      patientSignature={{
        name: patientData.fullName,
        roleLabel: 'Paciente ou responsável legal',
        legalGuardianLine: true,
        legalGuardian: patientData.guardian
          ? {
              name: patientData.guardian.fullName,
              relationshipLabel: patientData.guardian.relationshipLabel,
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
          e responsável legal de <strong>{patientData.fullName}</strong>
          {patientData.birthDate
            ? `, nascido(a) em ${formatCivilDate(patientData.birthDate)}`
            : ''}
          , li e concordo com o termo abaixo.
        </p>
      ) : (
        <p className="mb-4">
          Eu, <strong>{patientData.fullName}</strong>
          {patientData.birthDate
            ? `, nascido(a) em ${formatCivilDate(patientData.birthDate)}`
            : ''}
          , li e concordo com o termo abaixo.
        </p>
      )}
      <p className="mb-4 whitespace-pre-wrap">
        {renderLegalText(treatmentText, controller.data)}
      </p>

      {/* #94, DOC-09: autorização de imagem separada do consentimento do
          procedimento acima, com aceite próprio (#216, ADR-030). */}
      <div className="mt-8 border-black/30 border-t pt-4">
        <p className="mb-4 whitespace-pre-wrap">
          {renderLegalText(imageText, controller.data)}
        </p>
        <div className="mx-auto w-64 border-black border-t pt-1 text-center text-sm">
          {patientData.fullName}
          <span className="block text-xs">Autorização de uso de imagem</span>
        </div>
      </div>
    </DocumentFrame>
  );
}
