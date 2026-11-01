import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { DocumentFrame } from '@/components/document-frame';
import { ErrorAlert } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import { formatCivilDate, formatDate, formatTime } from '@/lib/format';
import { getClinicInfoFor } from '@/lib/server/data/clinic-info';
import { getAttendanceDocumentData } from '@/lib/server/data/documents';
import { loadBlock } from '@/lib/server/data/load-block';
import { findDocumentIssuance } from '@/lib/server/document-issuance';
import { requireStaffPage } from '@/lib/server/session';

/**
 * Declaração de comparecimento no servidor (#546, ADR-082): o texto sai no HTML;
 * só a emissão (número e data) e o botão Imprimir são ilhas de cliente. Página
 * bloqueada (clínica incompleta, consulta não realizada) não monta a emissão
 * (#468).
 */
export default async function AttendanceDocumentPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  const session = await requireStaffPage({
    next: `/documentos/atestado/${appointmentId}`,
  });
  const [clinic, data] = await Promise.all([
    loadBlock(() => getClinicInfoFor(session)),
    loadBlock(() => getAttendanceDocumentData(session, appointmentId)),
  ]);
  if (data.error !== null) return <ErrorAlert message={data.error} />;
  if (clinic.error !== null) return <ErrorAlert message={clinic.error} />;

  const { appointment, patient } = data.data;
  if (!appointment) return <ErrorAlert message="Consulta não encontrada" />;
  if (!isClinicInfoComplete(clinic.data)) {
    return <ClinicInfoIncompleteAlert clinic={clinic.data} />;
  }
  if (appointment.status !== 'completed') {
    return (
      <ErrorAlert
        message={`Não é possível emitir declaração de comparecimento: consulta com status "${appointment.status}", não "realizada".`}
      />
    );
  }
  const issuance = await findDocumentIssuance(
    session,
    'atestado',
    appointmentId,
  );

  return (
    <DocumentFrame
      clinic={clinic.data}
      title="Declaração de Comparecimento"
      issue={{ documentType: 'atestado', resourceId: appointmentId }}
      documentNumber={issuance?.documentNumber}
      issuedAt={issuance?.issuedAt}
    >
      <p className="mb-4">
        Declaro, para os devidos fins, que{' '}
        <strong>{appointment.patientName ?? 'o(a) paciente'}</strong>
        {patient?.birthDate
          ? ` (nascido(a) em ${formatCivilDate(patient.birthDate)})`
          : ''}{' '}
        compareceu a atendimento de estomaterapia nesta clínica no dia{' '}
        <strong>{formatDate(appointment.startsAt)}</strong>, no período de{' '}
        <strong>{formatTime(appointment.startsAt)}</strong> às{' '}
        <strong>{formatTime(appointment.endsAt)}</strong>, para realização de:{' '}
        <strong>{appointment.procedure}</strong>.
      </p>
      <p>Por ser verdade, firmo a presente declaração.</p>
    </DocumentFrame>
  );
}
