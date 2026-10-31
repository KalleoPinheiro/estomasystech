'use client';

import { Button, Card, Input, NativeSelect } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { Modal } from '@/components/modal';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIPS,
} from '@/domain/guardian/guardian';
import {
  formatBrazilianPhone,
  parseBrazilianPhone,
} from '@/domain/shared/phone';
import { unwrapAction } from '@/lib/action-result';
import { GUARDIAN_MANAGER_ROLES } from '@/lib/auth/guardian-access';
import type { GuardianDto, PatientDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import type { GuardianBody } from '@/lib/guardian-schema';
import { useStaffIdentity } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';
import {
  createGuardian,
  deleteGuardian,
  linkPatientGuardian,
  updateGuardian,
} from './actions/cadastro';

/** Só Admin de Empresa e Atendente gerenciam responsáveis (#329); a API repete a regra. */
function useCanManageGuardians(): boolean {
  const identity = useStaffIdentity();
  if (identity === null) return true;
  if (identity.loading) return false;
  return (
    identity.role === null || GUARDIAN_MANAGER_ROLES.includes(identity.role)
  );
}

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

interface GuardianFormValues {
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
}

function GuardianFormModal({
  guardian,
  onClose,
  onSubmit,
}: {
  guardian: GuardianDto | null;
  onClose: () => void;
  onSubmit: (values: GuardianFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<GuardianFormValues>({
    fullName: guardian?.fullName ?? '',
    relationship: guardian?.relationship ?? 'mae',
    phone: guardian?.phone ?? '',
    email: guardian?.email ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (field: keyof GuardianFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const phoneCheck = parseBrazilianPhone(values.phone);
    if (!phoneCheck.ok) {
      setError(phoneCheck.reason);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(errorMessage(err, 'Erro ao salvar responsável'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={guardian ? 'Editar responsável' : 'Novo responsável'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error && <ErrorAlert message={error} />}
        <label className="font-medium text-sm">
          Nome completo *
          <Input
            required
            value={values.fullName}
            onChange={(e) => set('fullName')(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Parentesco *
          <NativeSelect
            value={values.relationship}
            onChange={(e) => set('relationship')(e.target.value)}
            className="mt-1"
          >
            {GUARDIAN_RELATIONSHIPS.map((key) => (
              <option key={key} value={key}>
                {GUARDIAN_RELATIONSHIP_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="font-medium text-sm">
          Telefone *
          <Input
            required
            type="tel"
            inputMode="tel"
            placeholder="(11) 99999-0000"
            value={values.phone}
            onChange={(e) => set('phone')(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Email (opcional)
          <Input
            type="email"
            value={values.email}
            onChange={(e) => set('email')(e.target.value)}
            className="mt-1"
          />
          <span className="mt-1 block font-normal text-ink-3 text-xs">
            Recebe os lembretes quando o paciente não tem email. Não dá acesso
            ao portal.
          </span>
        </label>
        <Button type="submit" disabled={saving} variant="accent">
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </Modal>
  );
}

function GuardianPickerModal({
  onClose,
  onPick,
  onCreate,
}: {
  onClose: () => void;
  onPick: (guardianId: string) => Promise<void>;
  onCreate: () => void;
}) {
  const { data: guardians } = useApiQuery<GuardianDto[]>('/api/guardians');
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setSaving(true);
    setError(null);
    try {
      await onPick(selected);
    } catch (err) {
      setError(errorMessage(err, 'Erro ao vincular responsável'));
      setSaving(false);
    }
  };

  return (
    <Modal title="Vincular responsável" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <ErrorAlert message={error} />}
        <label className="font-medium text-sm">
          Responsável já cadastrado
          <NativeSelect
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1"
          >
            <option value="">Escolha…</option>
            {(guardians ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.fullName} — {g.relationshipLabel}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          type="button"
          variant="accent"
          disabled={!selected || saving}
          onClick={() => void pick()}
        >
          {saving ? 'Vinculando…' : 'Vincular'}
        </Button>
        <Button type="button" variant="outline" onClick={onCreate}>
          Cadastrar novo responsável
        </Button>
      </div>
    </Modal>
  );
}

function GuardianSummary({
  guardian,
  portalRevokedAt,
}: {
  guardian: GuardianDto;
  portalRevokedAt: string | null;
}) {
  return (
    <p className="text-sm">
      <strong>{guardian.fullName}</strong> — {guardian.relationshipLabel}
      <span className="block text-ink-2">
        {formatBrazilianPhone(guardian.phone)}
        {guardian.email ? ` · ${guardian.email}` : ''}
      </span>
      {portalRevokedAt && (
        <span className="block text-ink-2">
          O paciente encerrou o acesso deste responsável ao portal em{' '}
          {formatDateTime(portalRevokedAt)}. Para conceder de novo, desvincule e
          vincule o responsável.
        </span>
      )}
    </p>
  );
}

type Dialog = 'none' | 'pick' | 'create' | 'edit';

/**
 * Responsável legal ou cuidador do paciente (#329). Reutilizável entre os
 * pacientes da empresa; a recepção e o Admin cadastram, editam, trocam,
 * desvinculam e excluem. O Profissional só vê.
 */
export function GuardianPanel({
  patient,
  onChanged,
}: {
  patient: PatientDto;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const canManage = useCanManageGuardians();
  const [dialog, setDialog] = useState<Dialog>('none');
  const [error, setError] = useState<string | null>(null);
  const guardian = patient.guardian ?? null;

  if (!guardian && !canManage) return null;

  const done = (description: string) => {
    setDialog('none');
    setError(null);
    toast({ description, variant: 'success' });
    onChanged();
  };
  const link = (guardianId: string | null) =>
    unwrapAction(linkPatientGuardian({ patientId: patient.id, guardianId }));
  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    try {
      await action();
      done(success);
    } catch (err) {
      setError(errorMessage(err, 'Erro ao atualizar responsável'));
      // A exclusão desvincula antes de tentar apagar: a ficha reflete o vínculo.
      onChanged();
    }
  };
  const saveGuardian = async (values: GuardianFormValues) => {
    // O estado do formulário é texto; o `zod` do servidor valida a relação.
    const body = {
      ...values,
      email: values.email || null,
    } as GuardianBody;
    if (guardian) {
      await unwrapAction(updateGuardian({ id: guardian.id, body }));
      return done('Responsável atualizado');
    }
    const created = await unwrapAction(createGuardian(body));
    await link(created.id);
    done('Responsável cadastrado e vinculado');
  };

  return (
    <Card className="mb-6 flex flex-col gap-2 p-4" data-guardian-panel>
      <h2 className="font-semibold text-sm">Responsável ou cuidador</h2>
      {error && <ErrorAlert message={error} />}
      {guardian ? (
        <GuardianSummary
          guardian={guardian}
          portalRevokedAt={patient.guardianPortalRevokedAt}
        />
      ) : (
        <p className="text-ink-2 text-sm">Nenhum responsável vinculado.</p>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {guardian ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialog('edit')}
              >
                Editar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialog('pick')}
              >
                Trocar
              </Button>
              <ConfirmAction
                trigger={
                  <Button type="button" variant="ghost" size="sm">
                    Desvincular
                  </Button>
                }
                title="Desvincular responsável"
                description={`${guardian.fullName} deixa de ser o responsável de ${patient.fullName}. O cadastro dele continua para os outros pacientes.`}
                confirmLabel="Desvincular"
                onConfirm={() =>
                  run(() => link(null), 'Responsável desvinculado')
                }
              />
              <ConfirmAction
                trigger={
                  <Button type="button" variant="ghost" size="sm">
                    Excluir cadastro
                  </Button>
                }
                title="Excluir responsável"
                description={`${patient.fullName} é desvinculado e o cadastro de ${guardian.fullName} é apagado. Se outro paciente ainda usa este responsável, o cadastro é mantido.`}
                confirmLabel="Excluir"
                variant="danger"
                onConfirm={() =>
                  run(async () => {
                    await link(null);
                    await unwrapAction(deleteGuardian({ id: guardian.id }));
                  }, 'Responsável excluído')
                }
              />
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialog('pick')}
            >
              Vincular responsável
            </Button>
          )}
        </div>
      )}
      {dialog === 'pick' && (
        <GuardianPickerModal
          onClose={() => setDialog('none')}
          onPick={async (id) => {
            await link(id);
            done('Responsável vinculado');
          }}
          onCreate={() => setDialog('create')}
        />
      )}
      {(dialog === 'create' || dialog === 'edit') && (
        <GuardianFormModal
          guardian={dialog === 'edit' ? guardian : null}
          onClose={() => setDialog('none')}
          onSubmit={saveGuardian}
        />
      )}
    </Card>
  );
}
