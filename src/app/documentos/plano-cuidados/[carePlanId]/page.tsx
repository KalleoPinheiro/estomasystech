import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { DocumentFrame } from '@/components/document-frame';
import { ErrorAlert } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import {
  CARE_PLAN_DIAGNOSIS_TYPE_LABELS,
  CARE_PLAN_STATUS_LABELS,
  formatDate,
  INTERVENTION_PRIORITY_LABELS,
  outcomeStatusLabel,
  pesSentence,
} from '@/lib/format';
import { getCarePlanDetailFor } from '@/lib/server/data/care-plan';
import { getClinicInfoFor } from '@/lib/server/data/clinic-info';
import { getPrescribingProfessionalFor } from '@/lib/server/data/documents';
import { loadBlock } from '@/lib/server/data/load-block';
import { getPatientRecord } from '@/lib/server/data/patient-record';
import { findDocumentIssuance } from '@/lib/server/document-issuance';
import { requireStaffPage } from '@/lib/server/session';

/**
 * Plano de cuidados (SAE) para impressão no servidor (#546, ADR-082) —
 * diagnóstico (NANDA-I), resultado esperado (NOC) com trilha basal→atual→meta, e
 * intervenções (NIC) prescritas. Plano vazio e clínica incompleta bloqueiam a
 * página e a emissão (#468, #94 DOC-04).
 */
export default async function CarePlanDocumentPage({
  params,
}: {
  params: Promise<{ carePlanId: string }>;
}) {
  const { carePlanId } = await params;
  const session = await requireStaffPage({
    next: `/documentos/plano-cuidados/${carePlanId}`,
  });
  const [clinic, detail] = await Promise.all([
    loadBlock(() => getClinicInfoFor(session)),
    loadBlock(() => getCarePlanDetailFor(session, carePlanId)),
  ]);
  if (detail.error !== null) return <ErrorAlert message={detail.error} />;
  if (clinic.error !== null) return <ErrorAlert message={clinic.error} />;
  if (!isClinicInfoComplete(clinic.data)) {
    return <ClinicInfoIncompleteAlert clinic={clinic.data} />;
  }
  // #94, DOC-04: plano sem nenhum diagnóstico/resultado/intervenção é uma
  // folha timbrada em branco pronta pra assinar — bloqueia antes da moldura.
  if (
    detail.data.diagnoses.length === 0 &&
    detail.data.outcomes.length === 0 &&
    detail.data.interventions.length === 0
  ) {
    return (
      <ErrorAlert message="Este plano de cuidados ainda não tem diagnóstico, resultado ou intervenção prescritos — não é possível emitir o documento vazio." />
    );
  }
  const professionalId = detail.data.plan.professionalId;
  const [patient, professional] = await Promise.all([
    loadBlock(() => getPatientRecord(session, detail.data.plan.patientId)),
    // #94, DOC-11: assina quem prescreveu o plano; sem ele, a assinatura da clínica.
    professionalId
      ? loadBlock(() => getPrescribingProfessionalFor(session, professionalId))
      : null,
  ]);
  if (patient.error !== null) return <ErrorAlert message={patient.error} />;
  const signer = professional?.data ?? null;
  const issuance = await findDocumentIssuance(
    session,
    'plano-cuidados',
    carePlanId,
  );

  return (
    <DocumentFrame
      clinic={clinic.data}
      title="Plano de Cuidados de Enfermagem (SAE)"
      issue={{ documentType: 'plano-cuidados', resourceId: carePlanId }}
      documentNumber={issuance?.documentNumber}
      issuedAt={issuance?.issuedAt}
      signerOverride={
        signer
          ? { name: signer.fullName, registry: signer.registry }
          : undefined
      }
    >
      <p className="mb-1">
        <strong>Paciente:</strong> {patient.data.fullName}
      </p>
      <p className="mb-4">
        <strong>Aberto em:</strong> {formatDate(detail.data.plan.createdAt)} ·{' '}
        <strong>Situação:</strong>{' '}
        {CARE_PLAN_STATUS_LABELS[detail.data.plan.status]}
      </p>

      <h3 className="mb-2 font-semibold">
        Diagnósticos de enfermagem (NANDA-I)
      </h3>
      {detail.data.diagnoses.length === 0 ? (
        <p className="mb-4">Nenhum diagnóstico prescrito.</p>
      ) : (
        <ul className="mb-4 list-disc pl-5">
          {detail.data.diagnoses.map((diagnosis) => (
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
      {detail.data.outcomes.length === 0 ? (
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
              {detail.data.outcomes.map((outcome) => (
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
      {detail.data.interventions.length === 0 ? (
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
              {detail.data.interventions.map((intervention) => (
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
