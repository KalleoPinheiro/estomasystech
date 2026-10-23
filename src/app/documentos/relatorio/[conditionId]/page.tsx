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
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { HealingChart } from '@/components/healing-chart';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { AssessmentDto, ConditionDto, PatientDto } from '@/lib/dto';
import {
  CONDITION_KIND_LABELS,
  EXUDATE_LABELS,
  formatDate,
  STOMA_TYPE_LABELS,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { useDocumentIssuance } from '@/lib/use-document-issuance';
import { timeSummary } from '@/lib/wound-time-summary';

function guardLoading(
  clinic: ClinicInfoDto | null,
  condition: ConditionDto | null | undefined,
  assessments: AssessmentDto[] | null,
  error: string | null,
): ReactNode | null {
  if (error) return <ErrorAlert message={error} />;
  if (!clinic || condition === undefined || !assessments)
    return <LoadingIndicator />;
  if (!isClinicInfoComplete(clinic)) {
    return <ClinicInfoIncompleteAlert clinic={clinic} />;
  }
  if (condition === null)
    return <ErrorAlert message="Condição não encontrada" />;
  return null;
}

function guardBlock(
  clinic: ClinicInfoDto | null,
  condition: ConditionDto | null | undefined,
  assessments: AssessmentDto[] | null,
  error: string | null,
  issuance: { documentNumber: string; issuedAt: string } | null,
  issuanceError: string | null,
): ReactNode | null {
  const loadingGuard = guardLoading(clinic, condition, assessments, error);
  if (loadingGuard) return loadingGuard;
  if (!assessments) return null;
  // #94, DOC-05: relatório sem nenhuma avaliação registrada é uma folha
  // assinável vazia — bloqueia antes do DocumentFrame, mesma guarda do plano.
  if (assessments.length === 0) {
    return (
      <ErrorAlert message="Esta condição ainda não tem nenhuma avaliação registrada — não é possível emitir o relatório vazio." />
    );
  }
  if (issuanceError) return <ErrorAlert message={issuanceError} />;
  // #94, DOC-01: sem emissão persistida ainda, não renderiza.
  if (!issuance) return <LoadingIndicator />;
  return null;
}

/**
 * Relatório de evolução clínica para o médico parceiro — mesma minimização do
 * portal do parceiro: sem anamnese e sem qualquer dado financeiro.
 */
export default function PartnerReportPage({
  params,
}: {
  params: Promise<{ conditionId: string }>;
}) {
  const { conditionId } = use(params);
  const { data: clinic } = useApiQuery<ClinicInfoDto>('/api/clinic-info');
  const { data: condition, error } = useApiQuery<ConditionDto | null>(
    `/api/conditions/${conditionId}`,
  );
  const { data: assessments } = useApiQuery<AssessmentDto[]>(
    `/api/conditions/${conditionId}/assessments`,
  );
  // Só emite (e grava na auditoria) com a clínica apta a emitir: página bloqueada não é emissão (#468).
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'relatorio',
    clinic && isClinicInfoComplete(clinic) ? conditionId : null,
  );

  const guard = guardBlock(
    clinic,
    condition,
    assessments,
    error,
    issuance,
    issuanceError,
  );
  if (guard) return guard;
  if (!clinic || !condition || !assessments || !issuance) return null;

  return (
    <ReportContent
      clinic={clinic}
      condition={condition}
      assessments={assessments}
      documentNumber={issuance.documentNumber}
      issuedAt={issuance.issuedAt}
    />
  );
}

function ReportContent({
  clinic,
  condition,
  assessments,
  documentNumber,
  issuedAt,
}: {
  clinic: ClinicInfoDto;
  condition: ConditionDto;
  assessments: AssessmentDto[];
  documentNumber: string;
  issuedAt: string;
}) {
  const { data: patient, error: patientError } = useApiQuery<PatientDto>(
    `/api/patients/${condition.patientId}`,
  );
  const chronological = [...assessments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // #94, DOC-06: sem paciente resolvido ainda, não imprime "Paciente: —" —
  // espera a busca terminar, igual às outras guardas de carregamento.
  if (patientError) return <ErrorAlert message={patientError} />;
  if (!patient) return <LoadingIndicator />;

  return (
    <DocumentFrame
      clinic={clinic}
      title="Relatório de Evolução Clínica"
      documentNumber={documentNumber}
      issuedAt={issuedAt}
    >
      <p className="mb-1">
        <strong>Paciente:</strong> {patient.fullName}
      </p>
      <p className="mb-1">
        <strong>Condição:</strong> {condition.title} (
        {CONDITION_KIND_LABELS[condition.kind] ?? condition.kind}
        {condition.stomaType
          ? ` — ${STOMA_TYPE_LABELS[condition.stomaType] ?? condition.stomaType}`
          : ''}
        )
      </p>
      <p className="mb-4">
        <strong>Início do acompanhamento:</strong>{' '}
        {condition.startedAt
          ? formatDate(condition.startedAt)
          : formatDate(condition.createdAt)}{' '}
        · <strong>Situação:</strong>{' '}
        {condition.status === 'active' ? 'em acompanhamento' : 'resolvida'}
      </p>

      {chronological.length >= 2 && (
        // #94, DOC-07: gráfico monocromático — impressão neutra explícita,
        // não depende do tema estar fixo em claro pra ficar legível em P&B.
        <div className="mb-6 print:grayscale">
          <HealingChart assessments={assessments} />
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
                  {a.tissueType ?? '—'}
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
