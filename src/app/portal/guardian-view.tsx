'use client';

import { Button, Card } from '@still-void/ui/react';
import { useState } from 'react';
import { EmptyState, ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import { PatientPortalView, type PatientPortalViewData } from './patient-view';
import { usePortalRefresh } from './use-portal-refresh';

interface RepresentedPatientsDto {
  patients: { id: string; fullName: string }[];
  selectedPatientId: string | null;
}

/**
 * Portal do responsável (ADR-027): escolhe o paciente que representa e passa a
 * ver o portal dele, sempre com o aviso "acessando em nome de". A escolha vai
 * ao servidor (cookie validado a cada requisição e gravado na trilha) e a tela
 * é relida no servidor, já com o paciente escolhido.
 */
export function GuardianPortalView({
  represented,
  portal,
  nowMs,
}: {
  represented: RepresentedPatientsDto;
  /** Só existe com paciente escolhido; lido no servidor junto com a lista. */
  portal: PatientPortalViewData | null;
  nowMs: number;
}) {
  const refresh = usePortalRefresh();
  const [actionError, setActionError] = useState<string | null>(null);

  const change = async (method: 'PUT' | 'DELETE', patientId?: string) => {
    try {
      await apiFetch('/api/portal/guardian/acting-for', {
        method,
        body: patientId ? JSON.stringify({ patientId }) : undefined,
      });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao escolher o paciente',
      );
    }
  };

  if (represented.patients.length === 0) {
    return (
      <EmptyState
        icon="info"
        message="Nenhum paciente está ligado ao seu acesso. Fale com a clínica."
      />
    );
  }

  if (!represented.selectedPatientId || !portal) {
    return (
      <Card as="section" className="flex flex-col gap-3 p-6">
        <h1 className="font-semibold text-lg">Em nome de quem você acessa?</h1>
        <p className="text-ink-3 text-sm">
          Escolha o paciente. Tudo que você fizer ficará registrado como ação do
          responsável.
        </p>
        {actionError && <ErrorAlert message={actionError} />}
        {represented.patients.map((patient) => (
          <Button
            key={patient.id}
            variant="secondary"
            onClick={() => change('PUT', patient.id)}
          >
            {patient.fullName}
          </Button>
        ))}
      </Card>
    );
  }

  return (
    <>
      {actionError && <ErrorAlert message={actionError} />}
      <PatientPortalView
        key={represented.selectedPatientId}
        {...portal}
        nowMs={nowMs}
        onSwitchPatient={
          represented.patients.length > 1 ? () => change('DELETE') : undefined
        }
      />
    </>
  );
}
