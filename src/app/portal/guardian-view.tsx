'use client';

import { Button, Card } from '@still-void/ui/react';
import { useState } from 'react';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import { useApiQuery } from '@/lib/use-api-query';
import { PatientPortalView } from './patient-view';

interface RepresentedPatientsDto {
  patients: { id: string; fullName: string }[];
  selectedPatientId: string | null;
}

/**
 * Portal do responsável (ADR-027): escolhe o paciente que representa e passa a
 * ver o portal dele, sempre com o aviso "acessando em nome de". A escolha vai
 * ao servidor (cookie validado a cada requisição e gravado na trilha).
 */
export function GuardianPortalView() {
  const { data, error, refresh } = useApiQuery<RepresentedPatientsDto>(
    '/api/portal/guardian/patients',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  // `key` refaz a leitura do portal do paciente ao trocar de paciente.
  const [version, setVersion] = useState(0);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;

  const change = async (method: 'PUT' | 'DELETE', patientId?: string) => {
    try {
      await apiFetch('/api/portal/guardian/acting-for', {
        method,
        body: patientId ? JSON.stringify({ patientId }) : undefined,
      });
      setActionError(null);
      setVersion((v) => v + 1);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao escolher o paciente',
      );
    }
  };

  if (data.patients.length === 0) {
    return (
      <EmptyState
        icon="info"
        message="Nenhum paciente está ligado ao seu acesso. Fale com a clínica."
      />
    );
  }

  if (!data.selectedPatientId) {
    return (
      <Card as="section" className="flex flex-col gap-3 p-6">
        <h1 className="font-semibold text-lg">Em nome de quem você acessa?</h1>
        <p className="text-ink-3 text-sm">
          Escolha o paciente. Tudo que você fizer ficará registrado como ação do
          responsável.
        </p>
        {actionError && <ErrorAlert message={actionError} />}
        {data.patients.map((patient) => (
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
        key={`${data.selectedPatientId}-${version}`}
        onSwitchPatient={
          data.patients.length > 1 ? () => change('DELETE') : undefined
        }
      />
    </>
  );
}
