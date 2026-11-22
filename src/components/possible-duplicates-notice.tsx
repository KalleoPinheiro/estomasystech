'use client';

import { Alert, AlertDescription, Button } from '@still-void/ui/react';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { PatientDto } from '@/lib/dto';
import { formatCivilDate } from '@/lib/format';

export interface DuplicateLookupValues {
  fullName: string;
  phone: string;
  /** AAAA-MM-DD ou vazio. */
  birthDate: string;
}

export type DuplicateLookup = (
  values: DuplicateLookupValues,
) => Promise<PatientDto[]>;

/**
 * Corpo da conferência: só os três campos que comparam, já aparados. Os dados
 * pessoais vão no corpo, nunca numa URL (#992).
 */
export function duplicateLookupBody(values: DuplicateLookupValues) {
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    birthDate: values.birthDate || null,
  };
}

/** Conferência pela rota, usada pelo cadastro rápido da nova consulta. */
export const lookupPossibleDuplicatesViaApi: DuplicateLookup = async (
  values,
) => {
  const found = await apiFetch<PatientDto[]>('/api/patients/duplicates', {
    method: 'POST',
    body: JSON.stringify(duplicateLookupBody(values)),
  });
  return Array.isArray(found) ? found : [];
};

/**
 * Estado da conferência num formulário de cadastro. `pending` diz se ainda
 * falta conferir estes valores; `reset` volta a pedir a conferência (campo
 * alterado); `check` confere e devolve `true` quando o aviso deve aparecer.
 * Desligada (`enabled` falso), nunca avisa.
 */
export function useDuplicateCheck(enabled: boolean, lookup: DuplicateLookup) {
  const [duplicates, setDuplicates] = useState<PatientDto[] | null>(
    enabled ? null : [],
  );
  return {
    duplicates: duplicates ?? [],
    reset: () => {
      if (enabled) setDuplicates(null);
    },
    /** `true` quando há repetidos ainda não vistos: o cadastro espera a escolha. */
    check: async (values: DuplicateLookupValues): Promise<boolean> => {
      if (duplicates !== null) return false;
      // O aviso é só um conselho: se a conferência falhar, o cadastro segue
      // como antes em vez de travar a recepção.
      const found = await lookup(values).catch(() => []);
      setDuplicates(found);
      return found.length > 0;
    },
  };
}

function UseAction({
  patient,
  onUse,
  hrefFor,
  busy,
}: {
  patient: PatientDto;
  onUse?: (patient: PatientDto) => void;
  hrefFor?: (patient: PatientDto) => string;
  busy: boolean;
}) {
  if (hrefFor) {
    return (
      <Link
        href={hrefFor(patient)}
        className="font-semibold text-accent-ink text-sm hover:underline"
      >
        Usar este paciente
      </Link>
    );
  }
  if (!onUse) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => onUse(patient)}
      disabled={busy}
    >
      Usar este paciente
    </Button>
  );
}

function describe(patient: PatientDto): string {
  const parts = [patient.fullName];
  if (patient.birthDate) {
    parts.push(`nasc. ${formatCivilDate(patient.birthDate)}`);
  }
  parts.push(`cel. final ${patient.phone.slice(-4)}`);
  return `${parts.join(' · ')}${patient.active ? '' : ' (inativo)'}`;
}

interface PossibleDuplicatesNoticeProps {
  duplicates: PatientDto[];
  /** Usa o paciente na própria tela (ex.: seleciona na nova consulta). */
  onUse?: (patient: PatientDto) => void;
  /** Ou leva à ficha dele (cadastro em `/pacientes`). */
  hrefFor?: (patient: PatientDto) => string;
  onCreateAnyway: () => void;
  busy?: boolean;
  /** A nova consulta não agenda paciente inativo: lá ele aparece sem o botão. */
  canUse?: (patient: PatientDto) => boolean;
}

/** Aviso com quem já está cadastrado: usar um deles ou cadastrar mesmo assim (#992). */
export function PossibleDuplicatesNotice({
  duplicates,
  onUse,
  hrefFor,
  onCreateAnyway,
  busy = false,
  canUse = () => true,
}: PossibleDuplicatesNoticeProps) {
  return (
    <Alert variant="warning" data-possible-duplicates>
      <AlertDescription>
        <span className="block font-medium">
          Este paciente pode já estar cadastrado.
        </span>
        <span className="block text-sm">
          Confira antes de criar outro cadastro. Homônimos e familiares que
          dividem o celular podem ser pessoas diferentes.
        </span>
        <ul
          aria-label="Possíveis cadastros repetidos"
          className="mt-2 grid gap-2"
        >
          {duplicates.map((patient) => (
            <li
              key={patient.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm">{describe(patient)}</span>
              <UseAction
                patient={patient}
                onUse={canUse(patient) ? onUse : undefined}
                hrefFor={hrefFor}
                busy={busy}
              />
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={onCreateAnyway}
          disabled={busy}
        >
          Cadastrar mesmo assim
        </Button>
      </AlertDescription>
    </Alert>
  );
}
