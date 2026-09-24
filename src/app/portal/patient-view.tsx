'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Hero,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type {
  FollowUpDto,
  InvoiceDto,
  PortalAppointmentDto,
  PortalPatientProfileDto,
} from '@/lib/dto';
import {
  APPOINTMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  INVOICE_STATUS_LABELS,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { ChangeAppointment } from './change-appointment';
import {
  ConditionProgress,
  type ConditionWithAssessmentsDto,
} from './condition-progress';
import {
  ConsentCard,
  type ConsentStatusDto,
  PatientPhotoUpload,
} from './consent-card';
import { ScheduleReturn } from './schedule-return';
import { MyWaitlist } from './waitlist';

interface PatientPortalDto {
  patient: PortalPatientProfileDto;
  appointments: PortalAppointmentDto[];
  conditions: ConditionWithAssessmentsDto[];
  invoices: InvoiceDto[];
  followUps: FollowUpDto[];
  /** Antecedência mínima para cancelar/remarcar (política da clínica). */
  changeNoticeHours?: number;
}

// Momento de carregamento da página — suficiente para separar futuras × passadas.
const PAGE_LOAD_MS = Date.now();

export function PatientPortalView() {
  const { toast } = useToast();
  const { data, error, refresh } = useApiQuery<PatientPortalDto>(
    '/api/portal/patient',
  );
  // Fonte única do consentimento na tela: o card de aceite e o envio de foto
  // (COMP3-01) leem o mesmo status — cópias separadas divergiam após o aceite,
  // porque useApiQuery guarda estado por componente, sem cache compartilhado.
  const { data: consent, refresh: refreshConsent } =
    useApiQuery<ConsentStatusDto>('/api/portal/patient/consent');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [waitlistVersion, setWaitlistVersion] = useState(0);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;

  const confirmAppointment = async (appointment: PortalAppointmentDto) => {
    try {
      await apiFetch(
        `/api/portal/patient/appointments/${appointment.id}/confirm`,
        {
          method: 'POST',
        },
      );
      setConfirmError(null);
      toast({ description: 'Presença confirmada', variant: 'success' });
      refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao confirmar presença';
      setConfirmError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  const upcoming = data.appointments.filter(
    (a) =>
      new Date(a.startsAt).getTime() >= PAGE_LOAD_MS &&
      (a.status === 'scheduled' || a.status === 'confirmed'),
  );
  // PORT-09: consulta cancelada pela clínica com data ainda futura fica
  // separada — antes só aparecia enterrada em "Histórico", abaixo da
  // evolução clínica, e o paciente podia aparecer presencialmente no dia
  // errado.
  // Cancelamento feito pelo próprio paciente no portal não é alerta: ele já
  // sabe, e a consulta vai para o histórico como cancelada.
  const cancelledUpcoming = data.appointments.filter(
    (a) =>
      new Date(a.startsAt).getTime() >= PAGE_LOAD_MS &&
      a.status === 'cancelled' &&
      a.cancelledBy !== 'patient',
  );
  const past = data.appointments.filter(
    (a) => !upcoming.includes(a) && !cancelledUpcoming.includes(a),
  );

  return (
    <div className="flex flex-col gap-6">
      <Hero
        className="pt-0 pb-2"
        eyebrow="Portal do paciente"
        title={`Olá, ${data.patient.fullName.split(' ')[0]}!`}
        description="Acompanhe aqui suas consultas e sua evolução clínica."
      />

      <ConsentCard status={consent} onAccepted={refreshConsent} />

      <CancelledAppointmentsAlert appointments={cancelledUpcoming} />

      <Section title="Próximas consultas">
        {confirmError && <ErrorAlert message={confirmError} />}
        {upcoming.length === 0 ? (
          <EmptyState
            icon="pending"
            message="Nenhuma consulta agendada. Entre em contato com a clínica para agendar."
          />
        ) : (
          <AppointmentList
            appointments={upcoming}
            onConfirm={(appointment) => void confirmAppointment(appointment)}
            renderActions={(appointment) => (
              <ChangeAppointment
                appointment={appointment}
                nowMs={PAGE_LOAD_MS}
                noticeHours={data.changeNoticeHours}
                onChanged={refresh}
              />
            )}
          />
        )}
      </Section>

      {data.followUps.length > 0 && (
        <Section title="Retornos recomendados">
          <ul className="flex flex-col gap-2 text-sm">
            {data.followUps.map((followUp) => (
              <li
                key={followUp.id}
                className="rounded-lg border border-warning-soft bg-warning-soft px-3 py-2"
              >
                {followUp.reason} — até{' '}
                <strong>{formatDate(followUp.dueDate)}</strong>
                <ScheduleReturn
                  followUpId={followUp.id}
                  onScheduled={refresh}
                  onWaitlistJoined={() => setWaitlistVersion((v) => v + 1)}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <MyWaitlist version={waitlistVersion} />

      <Section title="Minha evolução clínica">
        {data.conditions.length === 0 ? (
          <EmptyState
            icon="info"
            message="Nenhuma condição em acompanhamento."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {data.conditions.map((entry) => (
              <div key={entry.condition.id}>
                <ConditionProgress
                  {...entry}
                  photoUrlBase="/api/portal/patient/photos"
                />
                {entry.condition.status === 'active' && (
                  <PatientPhotoUpload
                    conditionId={entry.condition.id}
                    consentPending={consent !== null && !consent.accepted}
                    onSent={refresh}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Histórico de consultas">
        {past.length === 0 ? (
          <EmptyState icon="info" message="Sem consultas anteriores." />
        ) : (
          <AppointmentList appointments={past} />
        )}
      </Section>

      <Section title="Minhas faturas">
        <InvoicesList invoices={data.invoices} />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

// PORT-09: consulta cancelada pela clínica com data ainda futura fica
// destacada — antes só aparecia enterrada em "Histórico", abaixo da evolução
// clínica, e o paciente podia aparecer presencialmente no dia errado.
function CancelledAppointmentsAlert({
  appointments,
}: {
  appointments: PortalAppointmentDto[];
}) {
  if (appointments.length === 0) return null;
  return (
    <Alert variant="warning">
      <AlertDescription>
        <strong>
          {appointments.length === 1
            ? 'Uma consulta sua foi cancelada pela clínica:'
            : 'Consultas suas foram canceladas pela clínica:'}
        </strong>
        <ul className="mt-1 list-inside list-disc">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              {formatDateTime(appointment.startsAt)} — {appointment.procedure}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function InvoicesList({ invoices }: { invoices: InvoiceDto[] }) {
  if (invoices.length === 0) {
    return <EmptyState icon="check-circle" message="Nenhuma fatura." />;
  }
  return (
    <>
      <Card>
        <ul className="divide-y divide-border text-sm">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate">{invoice.description}</p>
                <p className="text-ink-3 text-xs">
                  {formatDate(invoice.issuedAt)}
                </p>
              </div>
              <span className="text-right font-medium">
                {formatCurrency(invoice.netAmountCents ?? invoice.amountCents)}
                {invoice.status === 'pending' && invoice.paidCents > 0 && (
                  <span className="block font-normal text-ink-3 text-xs">
                    pago {formatCurrency(invoice.paidCents)} · falta{' '}
                    {formatCurrency(invoice.balanceCents)}
                  </span>
                )}
              </span>
              <StatusBadge
                status={invoice.status}
                label={INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
              />
            </li>
          ))}
        </ul>
      </Card>
      {/* PORT-13: legenda mínima — sem gateway de pagamento no sistema hoje
          (ver Assumptions do spec). */}
      <p className="mt-2 text-ink-3 text-xs">
        Pagamento realizado presencialmente na clínica.
      </p>
    </>
  );
}

interface AppointmentListProps {
  appointments: PortalAppointmentDto[];
  onConfirm?: (appointment: PortalAppointmentDto) => void;
  /** Ações extras abaixo de cada consulta (cancelar/remarcar nas futuras). */
  renderActions?: (appointment: PortalAppointmentDto) => React.ReactNode;
}

function AppointmentList({
  appointments,
  onConfirm,
  renderActions,
}: AppointmentListProps) {
  return (
    <Card>
      <ul className="divide-y divide-border text-sm">
        {appointments.map((appointment) => (
          <li key={appointment.id} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium" data-appointment-when>
                  {formatDateTime(appointment.startsAt)}
                </p>
                <p className="truncate text-ink-3">{appointment.procedure}</p>
              </div>
              <StatusBadge
                status={appointment.status}
                label={
                  APPOINTMENT_STATUS_LABELS[appointment.status] ??
                  appointment.status
                }
              />
            </div>
            {onConfirm && appointment.status === 'scheduled' && (
              <Button
                type="button"
                size="sm"
                onClick={() => onConfirm(appointment)}
                variant="accent"
                className="self-start"
              >
                Confirmar presença
              </Button>
            )}
            {renderActions?.(appointment)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
