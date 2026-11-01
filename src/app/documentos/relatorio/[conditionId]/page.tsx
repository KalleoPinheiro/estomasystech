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
import { HealingChart } from '@/components/healing-chart';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import {
  CONDITION_KIND_LABELS,
  EXUDATE_LABELS,
  formatDate,
  STOMA_TYPE_LABELS,
  tissueTypeLabel,
} from '@/lib/format';
import { getClinicInfoFor } from '@/lib/server/data/clinic-info';
import {
  getConditionDocumentData,
  listConditionAssessmentsFor,
} from '@/lib/server/data/documents';
import { loadBlock } from '@/lib/server/data/load-block';
import { getPatientRecord } from '@/lib/server/data/patient-record';
import { findDocumentIssuance } from '@/lib/server/document-issuance';
import { requireStaffPage } from '@/lib/server/session';
import { timeSummary } from '@/lib/wound-time-summary';

/**
 * Relatório de evolução clínica para o médico parceiro no servidor (#546,
 * ADR-082) — mesma minimização do portal do parceiro: sem anamnese e sem
 * qualquer dado financeiro. Sem avaliação registrada ou com clínica incompleta,
 * a página é bloqueada e não emite (#468, #94 DOC-05).
 */
export default async function PartnerReportPage({
  params,
}: {
  params: Promise<{ conditionId: string }>;
}) {
  const { conditionId } = await params;
  const session = await requireStaffPage({
    next: `/documentos/relatorio/${conditionId}`,
  });
  const [clinic, condition, assessments] = await Promise.all([
    loadBlock(() => getClinicInfoFor(session)),
    loadBlock(() => getConditionDocumentData(session, conditionId)),
    loadBlock(() => listConditionAssessmentsFor(session, conditionId)),
  ]);
  if (condition.error !== null) return <ErrorAlert message={condition.error} />;
  if (clinic.error !== null) return <ErrorAlert message={clinic.error} />;
  if (!isClinicInfoComplete(clinic.data)) {
    return <ClinicInfoIncompleteAlert clinic={clinic.data} />;
  }
  if (condition.data === null) {
    return <ErrorAlert message="Condição não encontrada" />;
  }
  if (assessments.error !== null) {
    return <ErrorAlert message={assessments.error} />;
  }
  // #94, DOC-05: relatório sem nenhuma avaliação registrada é uma folha
  // assinável vazia — bloqueia antes da moldura, mesma guarda do plano.
  if (assessments.data.length === 0) {
    return (
      <ErrorAlert message="Esta condição ainda não tem nenhuma avaliação registrada — não é possível emitir o relatório vazio." />
    );
  }
  const patient = await loadBlock(() =>
    getPatientRecord(
      session,
      (condition.data as { patientId: string }).patientId,
    ),
  );
  // #94, DOC-06: sem paciente resolvido, não imprime "Paciente: —".
  if (patient.error !== null) return <ErrorAlert message={patient.error} />;
  const issuance = await findDocumentIssuance(
    session,
    'relatorio',
    conditionId,
  );
  const chronological = [...assessments.data].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <DocumentFrame
      clinic={clinic.data}
      title="Relatório de Evolução Clínica"
      issue={{ documentType: 'relatorio', resourceId: conditionId }}
      documentNumber={issuance?.documentNumber}
      issuedAt={issuance?.issuedAt}
    >
      <p className="mb-1">
        <strong>Paciente:</strong> {patient.data.fullName}
      </p>
      <p className="mb-1">
        <strong>Condição:</strong> {condition.data.title} (
        {CONDITION_KIND_LABELS[condition.data.kind] ?? condition.data.kind}
        {condition.data.stomaType
          ? ` — ${STOMA_TYPE_LABELS[condition.data.stomaType] ?? condition.data.stomaType}`
          : ''}
        )
      </p>
      <p className="mb-4">
        <strong>Início do acompanhamento:</strong>{' '}
        {condition.data.startedAt
          ? formatDate(condition.data.startedAt)
          : formatDate(condition.data.createdAt)}{' '}
        · <strong>Situação:</strong>{' '}
        {condition.data.status === 'active' ? 'em acompanhamento' : 'resolvida'}
      </p>

      {chronological.length >= 2 && (
        // #94, DOC-07: gráfico monocromático — impressão neutra explícita,
        // não depende do tema estar fixo em claro pra ficar legível em P&B.
        <div className="mb-6 print:grayscale">
          <HealingChart assessments={assessments.data} />
        </div>
      )}

      <h3 className="mb-2 font-semibold">Avaliações registradas</h3>
      {/* SPEC_DEVIATION: override neutro de impressão (AD-006) — literal
          border-black/text-black em vez de tokens --sv-*, para a folha
          continuar em preto-sobre-branco na impressora P&B. O utilitário
          vence layer(components), então o override é determinístico. */}
      <div className="overflow-x-auto">
        <Table className="w-full border-collapse text-black text-xs print:text-[9px]">
          <TableHeader>
            <TableRow className="border-black border-b text-left">
              <TableHead className="py-1 pr-2 text-black">Data</TableHead>
              <TableHead className="py-1 pr-2 text-black">C×L×P (mm)</TableHead>
              <TableHead className="py-1 pr-2 text-black">Área (mm²)</TableHead>
              <TableHead className="py-1 pr-2 text-black">Tecido</TableHead>
              <TableHead className="py-1 pr-2 text-black">Exsudato</TableHead>
              <TableHead className="py-1 pr-2 text-black">
                Infecção / Bordas
              </TableHead>
              <TableHead className="py-1 text-black">Dor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chronological.map((a) => (
              <TableRow key={a.id} className="border-black/60 border-b">
                <TableCell className="py-1 pr-2">
                  {formatDate(a.createdAt)}
                </TableCell>
                <TableCell className="py-1 pr-2">
                  {a.lengthMm != null
                    ? `${a.lengthMm}×${a.widthMm ?? '—'}×${a.depthMm ?? '—'}`
                    : '—'}
                </TableCell>
                <TableCell className="py-1 pr-2">{a.areaMm2 ?? '—'}</TableCell>
                <TableCell className="py-1 pr-2">
                  {a.tissueType ? tissueTypeLabel(a.tissueType) : '—'}
                </TableCell>
                <TableCell className="py-1 pr-2">
                  {a.exudate ? (EXUDATE_LABELS[a.exudate] ?? a.exudate) : '—'}
                </TableCell>
                <TableCell className="py-1 pr-2">{timeSummary(a)}</TableCell>
                <TableCell className="py-1">
                  {a.painScale != null ? `${a.painScale}/10` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DocumentFrame>
  );
}
