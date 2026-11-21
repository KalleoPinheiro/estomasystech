import { Alert, AlertDescription, Icon } from '@still-void/ui/react';
import Link from 'next/link';
import type { PatientDto } from '@/lib/dto';

/**
 * Cadastro rápido feito na nova consulta (#972): lembra a equipe de completar
 * o cadastro em Pacientes e de colher o termo de consentimento no atendimento.
 */
export function QuickRegistrationBanner({ patient }: { patient: PatientDto }) {
  if (!patient.registrationIncomplete) return null;
  return (
    <Alert
      variant="warning"
      className="mb-6"
      icon={<Icon name="alert-triangle" />}
      data-registration-incomplete
    >
      <AlertDescription>
        Cadastro rápido: complete os dados do paciente em Pacientes e colha o{' '}
        <Link
          href={`/documentos/consentimento/${patient.id}`}
          className="font-medium underline"
        >
          termo de consentimento
        </Link>{' '}
        neste 1º atendimento.
      </AlertDescription>
    </Alert>
  );
}
