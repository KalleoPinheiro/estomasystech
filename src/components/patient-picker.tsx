'use client';

import { Button, Input } from '@still-void/ui/react';
import { useEffect, useId, useState } from 'react';
import type { PatientDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH_LENGTH = 2;
/** Resultados por busca — a lista é para escolher, não para navegar. */
export const PATIENT_PICKER_LIMIT = 20;

interface PatientPickerProps {
  /** Id do paciente selecionado ('' = nenhum). */
  value: string;
  onChange: (patientId: string) => void;
  label?: string;
  /** Inclui pacientes inativos nos resultados (ex.: filtro da auditoria). */
  includeInactive?: boolean;
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value]);
  return debounced;
}

/**
 * Nome do selecionado: o da escolha na busca, ou — quando a tela já abre com
 * um paciente (lista de espera, recall) — lido da ficha.
 */
function SelectedPatient({
  patientId,
  knownName,
  onClear,
}: {
  patientId: string;
  knownName: string | null;
  onClear: () => void;
}) {
  const { data } = useApiQuery<PatientDto>(
    knownName ? null : `/api/patients/${encodeURIComponent(patientId)}`,
  );
  return (
    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <span data-patient-picker-selected className="min-w-0 truncate">
        {knownName ?? data?.fullName ?? 'Paciente selecionado'}
      </span>
      <Button type="button" size="sm" variant="link" onClick={onClear}>
        Trocar
      </Button>
    </div>
  );
}

function SearchResults({
  term,
  includeInactive,
  onPick,
}: {
  term: string;
  includeInactive: boolean;
  onPick: (patient: PatientDto) => void;
}) {
  const url =
    term.length >= MIN_SEARCH_LENGTH
      ? `/api/patients?search=${encodeURIComponent(term)}&limit=${PATIENT_PICKER_LIMIT}`
      : null;
  const { data, error, isLoading } = useApiQuery<PatientDto[]>(url);
  if (url === null) {
    return (
      <p className="mt-1 text-ink-3 text-xs">
        Digite ao menos {MIN_SEARCH_LENGTH} letras do nome, e-mail ou telefone.
      </p>
    );
  }
  if (error) return <p className="mt-1 text-danger text-xs">{error}</p>;
  if (isLoading || !data) {
    return <p className="mt-1 text-ink-3 text-xs">Buscando…</p>;
  }
  const results = includeInactive ? data : data.filter((p) => p.active);
  if (results.length === 0) {
    return (
      <p className="mt-1 text-ink-3 text-xs">Nenhum paciente encontrado.</p>
    );
  }
  return (
    <ul
      aria-label="Pacientes encontrados"
      className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border"
    >
      {results.map((patient) => (
        <li key={patient.id}>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-left"
            onClick={() => onPick(patient)}
          >
            {patient.fullName}
            {!patient.active && ' (inativo)'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Seleção de paciente por busca assíncrona (#197). As telas antes chamavam
 * `/api/patients` sem cursor e usavam a 1ª página (100 em ordem alfabética)
 * como lista completa: a partir do 101º paciente não dava para agendar nem
 * faturar. A busca usa o índice trigram de nome/e-mail/telefone.
 */
export function PatientPicker({
  value,
  onChange,
  label = 'Paciente',
  includeInactive = false,
}: PatientPickerProps) {
  const inputId = useId();
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<PatientDto | null>(null);
  const debounced = useDebounced(term.trim());

  if (value) {
    return (
      <div className="font-medium text-sm">
        {label}
        <SelectedPatient
          patientId={value}
          knownName={picked?.id === value ? picked.fullName : null}
          onClear={() => onChange('')}
        />
      </div>
    );
  }

  return (
    <div className="font-medium text-sm">
      <label htmlFor={inputId}>{label}</label>
      <Input
        id={inputId}
        type="search"
        autoComplete="off"
        placeholder="Buscar por nome, e-mail ou telefone"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="mt-1"
      />
      <SearchResults
        term={debounced}
        includeInactive={includeInactive}
        onPick={(patient) => {
          setTerm('');
          setPicked(patient);
          onChange(patient.id);
        }}
      />
    </div>
  );
}
