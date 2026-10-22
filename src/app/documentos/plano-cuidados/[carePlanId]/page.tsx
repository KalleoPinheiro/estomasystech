'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { type ReactNode, use } from 'react';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { CarePlanDetailDto, PatientDto, ProfessionalDto } from '@/lib/dto';
import {
  CARE_PLAN_DIAGNOSIS_TYPE_LABELS,
  CARE_PLAN_STATUS_LABELS,
  formatDate,
  INTERVENTION_PRIORITY_LABELS,
  outcomeStatusLabel,
  pesSentence,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { useDocumentIssuance } from '@/lib/use-document-issuance';

function guardLoading(
  clinic: ClinicInfoDto | null,
  detail: CarePlanDetailDto | null,
  error: string | null,
  issuance: { documentNumber: string; issuedAt: string } | null,
  issuanceError: string | null,
): ReactNode | null {
  if (error || issuanceError)
    return <ErrorAlert message={error ?? issuanceError ?? ''} />;
  if (!clinic || !detail) return <LoadingIndicator />;
  if (!isClinicInfoComplete(clinic)) {
    return (
      <ErrorAlert message="Clínica sem CNPJ ou responsável técnico cadastrados — cadastre em Configurações antes de emitir este documento." />
    );
  }
  // #94, DOC-01: sem emissão persistida ainda, não renderiza.
  if (!issuance) return <LoadingIndicator />;
  return null;
}

// #94, DOC-04: plano sem nenhum diagnóstico/resultado/intervenção é uma
// folha timbrada em branco pronta pra assinar — bloqueia antes do DocumentFrame.
function guardEmptyPlan(detail: CarePlanDetailDto): ReactNode | null {
  if (
    detail.diagnoses.length === 0 &&
    detail.outcomes.length === 0 &&
    detail.interventions.length === 0
  ) {
    return (
      <ErrorAlert message="Este plano de cuidados ainda não tem diagnóstico, resultado ou intervenção prescritos — não é possível emitir o documento vazio." />
    );
  }
  return null;
}

function guardBlock(
  clinic: ClinicInfoDto | null,
  detail: CarePlanDetailDto | null,
  error: string | null,
  issuance: { documentNumber: string; issuedAt: string } | null,
  issuanceError: string | null,
): ReactNode | null {
  const loadingGuard = guardLoading(
    clinic,
    detail,
    error,
    issuance,
    issuanceError,
  );
  if (loadingGuard) return loadingGuard;
  if (!detail) return null;
  return guardEmptyPlan(detail);
}

/**
 * Plano de cuidados (SAE) para impressão — diagnóstico (NANDA-I), resultado
 * esperado (NOC) com trilha basal→atual→meta, e intervenções (NIC) prescritas.
 */
export default function CarePlanDocumentPage({
  params,
}: {
  params: Promise<{ carePlanId: string }>;
}) {
  const { carePlanId } = use(params);
  const { data: clinic } = useApiQuery<ClinicInfoDto>('/api/clinic-info');
  const { data: detail, error } = useApiQuery<CarePlanDetailDto>(
    `/api/care-plans/${carePlanId}`,
  );
  // Só emite (e grava na auditoria) com a clínica apta a emitir: página bloqueada não é emissão (#468).
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'plano-cuidados',
    clinic && isClinicInfoComplete(clinic) ? carePlanId : null,
  );

  const guard = guardBlock(clinic, detail, error, issuance, issuanceError);
  if (guard) return guard;
  if (!clinic || !detail || !issuance) return null;

  return (
    <CarePlanDocumentContent
      clinic={clinic}
      detail={detail}
      documentNumber={issuance.documentNumber}
      issuedAt={issuance.issuedAt}
    />
  );
}

function CarePlanDocumentContent({
  clinic,
  detail,
  documentNumber,
  issuedAt,
}: {
  clinic: ClinicInfoDto;
  detail: CarePlanDetailDto;
  documentNumber: string;
  issuedAt: string;
}) {
  const { data: patient, error: patientError } = useApiQuery<PatientDto>(
    `/api/patients/${detail.plan.patientId}`,
  );
  // #94, DOC-11: assinatura do responsável técnico QUE PRESCREVEU o plano, não
  // a assinatura genérica da clínica (que podia ser qualquer profissional).
  const { data: professional } = useApiQuery<ProfessionalDto>(
    detail.plan.professionalId
      ? `/api/professionals/${detail.plan.professionalId}`
      : null,
  );

  if (patientError) return <ErrorAlert message={patientError} />;
  if (!patient) return <LoadingIndicator />;

  return (
    <DocumentFrame
      clinic={clinic}
      title="Plano de Cuidados de Enfermagem (SAE)"
      documentNumber={documentNumber}
      issuedAt={issuedAt}
      signerOverride={
        professional
          ? { name: professional.fullName, registry: professional.registry }
          : undefined
      }
    >
      <p className="mb-1">
        <strong>Paciente:</strong> {patient.fullName}
      </p>
      <p className="mb-4">
        <strong>Aberto em:</strong> {formatDate(detail.plan.createdAt)} ·{' '}
        <strong>Situação:</strong> {CARE_PLAN_STATUS_LABELS[detail.plan.status]}
      </p>

      <h3 className="mb-2 font-semibold">
        Diagnósticos de enfermagem (NANDA-I)
      </h3>
      {detail.diagnoses.length === 0 ? (
        <p className="mb-4">Nenhum diagnóstico prescrito.</p>
      ) : (
        <ul className="mb-4 list-disc pl-5">
          {detail.diagnoses.map((diagnosis) => (
            <li key={diagnosis.id} className="mb-1">
              <strong>
                {diagnosis.diagnosisCode} (
                {CARE_PLAN_DIAGNOSIS_TYPE_LABELS[diagnosis.type]}):
              </strong>{' '}
              {pesSentence(diagnosis)}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 font-semibold">Resultados esperados (NOC)</h3>
      {detail.outcomes.length === 0 ? (
        <p className="mb-4">Nenhum resultado prescrito.</p>
      ) : (
        // SPEC_DEVIATION: override neutro de impressão (AD-006) — literal
        // border-black/text-black em vez de tokens --sv-*, para a folha
        // continuar em preto-sobre-branco na impressora P&B. O utilitário
        // vence layer(components), então o override é determinístico.
        <div className="mb-4 overflow-x-auto">
          <Table className="w-full border-collapse text-black text-xs">
            <TableHeader>
              <TableRow className="border-black border-b text-left">
                <TableHead className="py-1 pr-2 text-black">
                  Resultado
                </TableHead>
                <TableHead className="py-1 pr-2 text-black">
                  Basal (escala 1-5)
                </TableHead>
                <TableHead className="py-1 pr-2 text-black">
                  Atual (escala 1-5)
                </TableHead>
                <TableHead className="py-1 pr-2 text-black">
                  Meta (escala 1-5)
                </TableHead>
                <TableHead className="py-1 text-black">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.outcomes.map((outcome) => (
                <TableRow key={outcome.id} className="border-black/60 border-b">
                  <TableCell className="py-1 pr-2">
                    {outcome.outcomeCode} — {outcome.outcomeLabel}
                  </TableCell>
                  <TableCell className="py-1 pr-2">
                    {outcome.baselineScore}
                  </TableCell>
                  <TableCell className="py-1 pr-2">
                    {outcome.currentScore ?? '—'}
                  </TableCell>
                  <TableCell className="py-1 pr-2">
                    {outcome.targetScore}
                  </TableCell>
                  <TableCell className="py-1">
                    {outcomeStatusLabel(outcome)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h3 className="mb-2 font-semibold">Intervenções de enfermagem (NIC)</h3>
      {detail.interventions.length === 0 ? (
        <p>Nenhuma intervenção prescrita.</p>
      ) : (
        // SPEC_DEVIATION: override neutro de impressão (AD-006) — ver
        // comentário na tabela de resultados esperados (NOC) acima.
        <div className="overflow-x-auto">
          <Table className="w-full border-collapse text-black text-xs">
            <TableHeader>
              <TableRow className="border-black border-b text-left">
                <TableHead className="py-1 pr-2 text-black">
                  Intervenção
                </TableHead>
                <TableHead className="py-1 pr-2 text-black">
                  Frequência
                </TableHead>
                <TableHead className="py-1 pr-2 text-black">
                  Prioridade
                </TableHead>
                <TableHead className="py-1 text-black">Execuções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.interventions.map((intervention) => (
                <TableRow
                  key={intervention.id}
                  className="border-black/60 border-b"
                >
                  <TableCell className="py-1 pr-2">
                    {intervention.interventionCode} —{' '}
                    {intervention.interventionLabel}
                  </TableCell>
                  <TableCell className="py-1 pr-2">
                    {intervention.frequency}
                  </TableCell>
                  <TableCell className="py-1 pr-2">
                    {INTERVENTION_PRIORITY_LABELS[intervention.priority]}
                  </TableCell>
                  <TableCell className="py-1">
                    {intervention.records.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DocumentFrame>
  );
}
