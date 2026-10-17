'use client';

import { type ReactNode, use } from 'react';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { PatientDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import {
  type DocumentIssuance,
  useDocumentIssuance,
} from '@/lib/use-document-issuance';

// #94, DOC-10: sem versionamento de conteúdo no banco (fora de escopo — exigiria
// migração), mas registrar qual versão do texto foi assinada resolve a pergunta
// central de um litígio ("qual termo a paciente leu").
const CONSENT_TEMPLATE_VERSION = 'v1-2026-09';

function guardBlock(
  clinic: ClinicInfoDto | null,
  patient: PatientDto | null,
  error: string | null,
  issuance: DocumentIssuance | null,
  issuanceError: string | null,
): ReactNode | null {
  if (error || issuanceError)
    return <ErrorAlert message={error ?? issuanceError ?? ''} />;
  if (!clinic || !patient) return <LoadingIndicator />;
  if (!isClinicInfoComplete(clinic)) {
    return (
      <ErrorAlert message="Clínica sem CNPJ ou responsável técnico cadastrados — cadastre em Configurações antes de emitir este documento." />
    );
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
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'consentimento',
    patientId,
  );

  const guard = guardBlock(clinic, patient, error, issuance, issuanceError);
  if (guard) return guard;
  if (!clinic || !patient || !issuance) return null;

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
          <p>Versão do termo: {CONSENT_TEMPLATE_VERSION}.</p>
          <p>
            Documento emitido em duas vias — uma para a clínica, uma para o(a)
            paciente.
          </p>
        </>
      }
    >
      <p className="mb-4">
        Eu, <strong>{patient.fullName}</strong>
        {patient.birthDate
          ? `, nascido(a) em ${formatDate(patient.birthDate)}`
          : ''}
        , declaro que fui informado(a), de forma clara e compreensível, sobre a
        natureza, os objetivos, os riscos e os benefícios dos procedimentos de
        estomaterapia propostos, incluindo cuidados com estomias, tratamento de
        feridas e orientações correlatas.
      </p>
      <p className="mb-4">
        Declaro ainda que tive oportunidade de esclarecer todas as minhas
        dúvidas e que estou ciente de que posso revogar este consentimento a
        qualquer momento, sem prejuízo do meu atendimento.
      </p>

      {/* #94, DOC-09: autorização de imagem separada do consentimento do
          procedimento acima — LGPD exige consentimento específico e revogável
          independentemente para uso de imagem, com aceite próprio. */}
      <div className="mt-8 border-black/30 border-t pt-4">
        <p className="mb-4">
          Autorizo, em separado, o registro fotográfico da evolução clínica
          exclusivamente para fins de acompanhamento terapêutico e documentação
          em prontuário, nos termos da Lei Geral de Proteção de Dados (Lei nº
          13.709/2018). Esta autorização é independente do consentimento acima e
          pode ser revogada a qualquer momento sem afetar o restante do
          tratamento.
        </p>
        <div className="mx-auto w-64 border-black border-t pt-1 text-center text-sm">
          {patient.fullName}
          <span className="block text-xs">Autorização de uso de imagem</span>
        </div>
      </div>
    </DocumentFrame>
  );
}
