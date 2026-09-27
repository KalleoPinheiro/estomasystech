'use client';

import {
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { ClinicAdminDto, PlatformClinicDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

type AdminAction = 'resend-invite' | 'deactivate' | 'reactivate';

const ACTION_DONE: Record<AdminAction, string> = {
  'resend-invite': 'Convite reenviado',
  deactivate: 'Admin desativado',
  reactivate: 'Admin reativado',
};

const adminSituation = (admin: ClinicAdminDto) => {
  if (!admin.active) return { status: 'cancelled', label: 'Desativado' };
  return admin.passwordSet
    ? { status: 'completed', label: 'Ativo' }
    : { status: 'pending', label: 'Aguardando primeiro acesso' };
};

/**
 * Admins de Empresa da clínica (Journey 4 e 5). Para trocar o admin, convide o
 * novo antes de desativar o antigo: o último ativo não pode ser desativado.
 */
export function ClinicAdminsSection({ clinic }: { clinic: PlatformClinicDto }) {
  const { toast } = useToast();
  const url = `/api/platform/clinics/${clinic.id}/admins`;
  const { data, error, refresh } = useApiQuery<ClinicAdminDto[]>(url);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (admin: ClinicAdminDto, action: AdminAction) => {
    setActionError(null);
    try {
      const result = await apiFetch<{ delivered: boolean | null }>(
        `${url}/${admin.id}`,
        { method: 'PATCH', body: JSON.stringify({ action }) },
      );
      const undelivered = result.delivered === false;
      toast({
        description: undelivered
          ? `O convite para ${admin.email} não foi entregue. Tente de novo mais tarde.`
          : ACTION_DONE[action],
        variant: undelivered ? 'warning' : 'success',
      });
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro na ação');
    }
  };

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Admins de Empresa</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Para trocar o admin, convide o novo antes de desativar o antigo.
      </p>
      {actionError && <ErrorAlert message={actionError} />}
      <AdminsTable
        admins={data}
        error={error}
        suspended={clinic.status === 'suspended'}
        onRetry={refresh}
        onAction={(admin, action) => void act(admin, action)}
      />
      <InviteAdminForm clinic={clinic} url={url} onInvited={refresh} />
    </Card>
  );
}

function AdminsTable({
  admins,
  error,
  suspended,
  onRetry,
  onAction,
}: {
  admins: ClinicAdminDto[] | null;
  error: string | null;
  /** Clínica suspensa (B5) não reenvia convite. */
  suspended: boolean;
  onRetry: () => void;
  onAction: (admin: ClinicAdminDto, action: AdminAction) => void;
}) {
  if (error) return <ErrorAlert message={error} onRetry={onRetry} />;
  if (!admins) return <LoadingIndicator />;
  if (admins.length === 0) {
    return <EmptyState message="Nenhum Admin de Empresa convidado." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table stack className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2 pr-3">E-mail</TableHead>
            <TableHead className="py-2 pr-3">Situação</TableHead>
            <TableHead className="py-2 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.map((admin) => (
            <AdminRow
              key={admin.id}
              admin={admin}
              canResend={!suspended}
              onAction={(action) => onAction(admin, action)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AdminRow({
  admin,
  canResend,
  onAction,
}: {
  admin: ClinicAdminDto;
  canResend: boolean;
  onAction: (action: AdminAction) => void;
}) {
  const situation = adminSituation(admin);
  return (
    <TableRow className={admin.active ? '' : 'bg-surface-2/60'}>
      <TableCell label="E-mail" className="py-2 pr-3 font-medium">
        {admin.email}
      </TableCell>
      <TableCell label="Situação" className="py-2 pr-3">
        <StatusBadge status={situation.status} label={situation.label} />
      </TableCell>
      <TableCell label="Ações" className="py-2 text-right">
        <AdminActions admin={admin} canResend={canResend} onAction={onAction} />
      </TableCell>
    </TableRow>
  );
}

function AdminActions({
  admin,
  canResend,
  onAction,
}: {
  admin: ClinicAdminDto;
  canResend: boolean;
  onAction: (action: AdminAction) => void;
}) {
  if (!admin.active) {
    return (
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-ink-3"
        onClick={() => onAction('reactivate')}
      >
        Reativar
      </Button>
    );
  }
  return (
    <>
      {canResend && !admin.passwordSet && (
        <Button
          type="button"
          variant="link"
          className="mr-3 h-auto p-0 text-ink-3"
          onClick={() => onAction('resend-invite')}
        >
          Reenviar convite
        </Button>
      )}
      <ConfirmAction
        trigger={
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-ink-3"
          >
            Desativar
          </Button>
        }
        title="Desativar admin?"
        description={`${admin.email} perde o acesso à clínica imediatamente.`}
        confirmLabel="Desativar"
        variant="danger"
        onConfirm={() => onAction('deactivate')}
      />
    </>
  );
}

function InviteAdminForm({
  clinic,
  url,
  onInvited,
}: {
  clinic: PlatformClinicDto;
  url: string;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const suspended = clinic.status === 'suspended';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ email: string; delivered: boolean }>(
        url,
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        },
      );
      toast({
        description: created.delivered
          ? `Convite enviado para ${created.email}`
          : `Admin criado, mas o convite para ${created.email} não foi entregue. Reenvie mais tarde.`,
        variant: created.delivered ? 'success' : 'warning',
      });
      setEmail('');
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao convidar admin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex max-w-xl flex-col gap-3">
      <h3 className="font-semibold text-base">Convidar Admin de Empresa</h3>
      {suspended ? (
        <p className="text-ink-3 text-sm">
          Clínica suspensa: reative a clínica antes de convidar o admin.
        </p>
      ) : (
        !clinic.registrationComplete && (
          <p className="text-ink-3 text-sm">
            Complete o cadastro (nome, CNPJ, telefone e e-mail de contato) antes
            de convidar o admin.
          </p>
        )
      )}
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        E-mail do admin *
        <Input
          type="email"
          required
          value={email}
          placeholder="admin@clinica.com.br"
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
        />
      </label>
      <div>
        <Button
          type="submit"
          variant="accent"
          disabled={saving || suspended || !clinic.registrationComplete}
        >
          {saving ? 'Convidando…' : 'Convidar admin'}
        </Button>
      </div>
    </form>
  );
}
