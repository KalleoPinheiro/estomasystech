'use client';

import { Button, Card, CardContent, Hero } from '@still-void/ui/react';
import { useState } from 'react';
import { EmptyState } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { APPOINTMENT_STATUS_LABELS, formatDateTime } from '@/lib/format';
import type { PartnerPortalData } from '@/lib/server/data/portal';
import { ConditionProgress } from './condition-progress';

/**
 * Sem consentimento do paciente (#292): o parceiro vê só se ele foi atendido,
 * sem consultas, condições ou avaliações.
 */
function NotSharedPatientCard({
  fullName,
  attended,
}: {
  fullName: string;
  attended: boolean;
}) {
  return (
    <Card data-sharing="off">
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{fullName}</p>
          <StatusBadge
            status={attended ? 'completed' : 'pending'}
            label={attended ? 'Atendido(a)' : 'Sem atendimento realizado'}
          />
        </div>
        <p className="text-ink-3 text-xs">
          O paciente não autorizou o compartilhamento da evolução clínica com
          você.
        </p>
      </CardContent>
    </Card>
  );
}

/** CRM e especialidade só entram quando existem, sem separador solto. */
function partnerCredentials(partner: {
  crm?: string | null;
  specialty?: string | null;
}): string {
  const parts = [partner.crm, partner.specialty].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' · ')} — ` : '';
}

export function PartnerPortalView({ data }: { data: PartnerPortalData }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Hero
        className="pt-0 pb-2"
        eyebrow="Portal do parceiro"
        title={data.partner.fullName}
        description={`${partnerCredentials(data.partner)}acompanhamento dos pacientes que você indicou. A evolução clínica aparece só com a autorização do paciente e cobre os últimos 24 meses.`}
      />

      {data.referredPatients.length === 0 ? (
        <EmptyState
          icon="info"
          message="Nenhum paciente indicado por você até o momento."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.referredPatients.map(
            ({ patient, sharing, attended, appointments, conditions }) => {
              if (!sharing) {
                return (
                  <NotSharedPatientCard
                    key={patient.id}
                    fullName={patient.fullName}
                    attended={attended}
                  />
                );
              }
              const isOpen = expanded === patient.id;
              return (
                <Card key={patient.id}>
                  <CardContent className="p-4">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : patient.id)}
                      className="flex h-auto w-full items-center justify-between whitespace-normal px-0 py-0 text-left"
                    >
                      <div>
                        <p className="font-medium">{patient.fullName}</p>
                        <p className="text-ink-3 text-xs">
                          {appointments.length} consulta(s) ·{' '}
                          {conditions.length} condição(ões) em acompanhamento
                        </p>
                      </div>
                      <span className="font-medium text-accent-ink text-sm">
                        {isOpen ? 'Ocultar' : 'Ver evolução'}
                      </span>
                    </Button>

                    {isOpen && (
                      <div className="mt-4 flex flex-col gap-4 border-border border-t pt-4">
                        <div>
                          <h3 className="mb-2 font-semibold text-sm">
                            Consultas
                          </h3>
                          {appointments.length === 0 ? (
                            <EmptyState
                              icon="pending"
                              message="Nenhuma consulta."
                            />
                          ) : (
                            <ul className="divide-y divide-border text-sm">
                              {appointments.map((appointment) => (
                                <li
                                  key={appointment.id}
                                  className="flex items-center gap-3 py-2"
                                >
                                  <span className="flex-1">
                                    {formatDateTime(appointment.startsAt)} —{' '}
                                    {appointment.procedure}
                                  </span>
                                  <StatusBadge
                                    status={appointment.status}
                                    label={
                                      APPOINTMENT_STATUS_LABELS[
                                        appointment.status
                                      ] ?? appointment.status
                                    }
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <h3 className="mb-2 font-semibold text-sm">
                            Evolução clínica
                          </h3>
                          {conditions.length === 0 ? (
                            <EmptyState
                              icon="info"
                              message="Nenhuma condição registrada."
                            />
                          ) : (
                            <div className="flex flex-col gap-3">
                              {conditions.map((entry) => (
                                <ConditionProgress
                                  key={entry.condition.id}
                                  {...entry}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
