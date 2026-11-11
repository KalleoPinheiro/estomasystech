'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { PatientPicker } from '@/components/patient-picker';
import { SafeForm } from '@/components/safe-form';
import { unwrapAction } from '@/lib/action-result';
import { clinicDayEnd } from '@/lib/clinic-calendar';
import type { ProcedureDto } from '@/lib/dto';
import { sellPackage } from './billing-actions';

/**
 * Venda de pacote (O3.3): fatura única; sessões consomem saldo na conclusão. Os
 * procedimentos vêm do servidor junto com a tela, então o modal abre sem chamar
 * a API.
 */
export function PackageForm({
  procedures,
  onSaved,
}: {
  procedures: ProcedureDto[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [patientId, setPatientId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [sessions, setSessions] = useState('10');
  const [price, setPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeProcedures = procedures.filter((p) => p.active);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!patientId) {
      setError('Selecione o paciente');
      return;
    }
    setSaving(true);
    try {
      await unwrapAction(
        sellPackage({
          patientId,
          procedureId,
          totalSessions: Number(sessions),
          priceCents: Math.round(Number(price) * 100),
          // Validade opcional: fim do dia escolhido no fuso local da clínica —
          // forçar UTC encurtaria o último dia em fusos a oeste (UTC-3: 20:59).
          expiresAt: expiresAt ? clinicDayEnd(expiresAt).toISOString() : null,
        }),
      );
      toast({
        description: 'Pacote vendido',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao vender pacote');
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <PatientPicker
        label="Paciente *"
        value={patientId}
        onChange={setPatientId}
      />
      <label className="font-medium text-sm">
        Procedimento *
        <NativeSelect
          required
          value={procedureId}
          onChange={(e) => setProcedureId(e.target.value)}
          className="mt-1"
        >
          <option value="">Selecione…</option>
          {activeProcedures.map((procedure) => (
            <option key={procedure.id} value={procedure.id}>
              {procedure.name}
            </option>
          ))}
        </NativeSelect>
        {activeProcedures.length === 0 && (
          <span className="mt-1 block font-normal text-warning text-xs">
            Cadastre procedimentos no catálogo para vender pacotes.
          </span>
        )}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Sessões *
          <Input
            required
            type="number"
            min="1"
            max="100"
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Preço total (R$) *
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1"
          />
        </label>
      </div>
      <label className="font-medium text-sm">
        Validade
        <Input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="mt-1"
        />
        <span className="mt-1 block font-normal text-ink-3 text-xs">
          Opcional — sem data, o pacote não expira.
        </span>
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Vendendo…' : 'Vender pacote'}
      </Button>
    </SafeForm>
  );
}
