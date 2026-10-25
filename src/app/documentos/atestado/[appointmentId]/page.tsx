'use client';

import { type ReactNode, use } from 'react';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import type { AppointmentDto, PatientDto } from '@/lib/dto';
import { formatCivilDate, formatDate, formatTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import {
  type DocumentIssuance,
  useDocumentIssuance,
} from '@/lib/use-document-issuance';

function guardAppointment(
  clinic: ClinicInfoDto | null,
  clinicError: string | null,
  appointment: AppointmentDto | null,
  appointmentError: string | null,
  appointmentLoading: boolean,
): ReactNode | null {
  if (appointmentError || clinicError)
    return <ErrorAlert message={appointmentError ?? clinicError ?? ''} />;
  if (!clinic || appointmentLoading) return <LoadingIndicator />;
  if (!appointment) return <ErrorAlert message="Consulta não encontrada" />;
  if (!isClinicInfoComplete(clinic)) {
    return <ClinicInfoIncompleteAlert clinic={clinic} />;
  }
  if (appointment.status !== 'completed') {
    return (
      <ErrorAlert
        message={`Não é possível emitir declaração de comparecimento: consulta com status "${appointment.status}", não "realizada".`}
      />
    );
  }
  return null;
}

/** Guardas de bloqueio/carregamento — extraída para manter a complexidade da página no limite. */
function guardBlock(
  clinic: ClinicInfoDto | null,
  clinicError: string | null,
  appointment: AppointmentDto | null,
  appointmentError: string | null,
  appointmentLoading: boolean,
  issuance: DocumentIssuance | null,
  issuanceError: string | null,
): ReactNode | null {
  const appointmentGuard = guardAppointment(
    clinic,
    clinicError,
    appointment,
    appointmentError,
    appointmentLoading,
  );
  if (appointmentGuard) return appointmentGuard;
  if (issuanceError) return <ErrorAlert message={issuanceError} />;
  // #94, DOC-01: sem emissão persistida ainda, não renderiza — a data no
  // rodapé nunca pode ser `new Date()` do render.
  if (!issuance) return <LoadingIndicator />;
  return null;
}

export default function AttendanceDocumentPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = use(params);
  const { data: clinic, error: clinicError } =
    useApiQuery<ClinicInfoDto>('/api/clinic-info');
  const {
    data: appointment,
    error,
    isLoading: appointmentLoading,
  } = useApiQuery<AppointmentDto>(`/api/appointments/${appointmentId}`);
  const { data: patient } = useApiQuery<PatientDto>(
    appointment ? `/api/patients/${appointment.patientId}` : null,
  );
  // Só emite (e grava na auditoria) com a clínica apta e a consulta realizada:
  // página bloqueada não é emissão (#468).
  const canIssue =
    !!clinic &&
    isClinicInfoComplete(clinic) &&
    appointment?.status === 'completed';
  const { issuance, error: issuanceError } = useDocumentIssuance(
    'atestado',
    canIssue ? appointmentId : null,
  );

  const guard = guardBlock(
    clinic,
    clinicError,
    appointment,
    error,
    appointmentLoading,
    issuance,
    issuanceError,
  );
  if (guard) return guard;
  if (!clinic || !appointment || !issuance) return null;

  return (
    <DocumentFrame
      clinic={clinic}
      title="Declaração de Comparecimento"
      documentNumber={issuance.documentNumber}
      issuedAt={issuance.issuedAt}
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
