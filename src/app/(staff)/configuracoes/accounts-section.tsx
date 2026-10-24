'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Checkbox,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { AccessLinkField } from '@/components/access-link';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { ProfessionalDto, UserAccountDto } from '@/lib/dto';
import { useStaffAccess } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';
import { PortalLinkField } from './portal-link-field';

// Papéis que uma conta Admin de Empresa pode cadastrar (PROVISIONING_MATRIX.company_admin,
// src/domain/auth/role-hierarchy.ts) — super_admin fica fora desta tela por design.
type AccountRole =
  | 'company_admin'
  | 'atendente'
  | 'profissional'
  | 'patient'
  | 'partner'
  | 'guardian';

const ACCOUNT_ROLE_OPTIONS: { value: AccountRole; label: string }[] = [
  { value: 'company_admin', label: 'Admin de Empresa' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'patient', label: 'Paciente' },
  { value: 'partner', label: 'Parceiro' },
  { value: 'guardian', label: 'Responsável do paciente' },
];

/** Rótulo do papel na tabela de contas (#475): sem a coluna só se distinguia pela de profissional. */
const accountRoleLabel = (role: AccountRole | string): string =>
  ACCOUNT_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;

type EmailChannelState = 'configured' | 'none' | 'unknown';

/** O convite sai por e-mail só com canal; sem ele a tela devolve o link (ACE-RN-33). */
const INVITE_HINT: Record<EmailChannelState, string> = {
  configured:
    'A pessoa recebe um e-mail de convite e define a própria senha — ninguém digita senha por ela.',
  none: 'Esta clínica não tem canal de e-mail: ao criar a conta, o link de convite aparece aqui para você copiar e enviar. A pessoa define a própria senha — ninguém digita senha por ela.',
  unknown:
    'A pessoa define a própria senha pelo link do convite. Ele sai por e-mail quando a clínica tem canal configurado; sem canal, o link aparece aqui para você copiar.',
};

/** Link que não saiu por e-mail, para o admin repassar à mão (C2, #265). */
interface ManualLink {
  email: string;
  url: string;
}

/** Resposta das rotas que emitem link de acesso (C2, #265). */
interface AccessLinkResult {
  delivered: boolean;
  inviteUrl: string | null;
}

export function AccountsSection() {
  const { toast } = useToast();
  const {
    data: accounts,
    error,
    refresh,
  } = useApiQuery<UserAccountDto[]>('/api/accounts');
  const { data: professionals } =
    useApiQuery<ProfessionalDto[]>('/api/professionals');
  const can = useStaffAccess();
  const { data: channelData } = useApiQuery<{ channel: unknown | null }>(
    can('/api/settings/email-channel') ? '/api/settings/email-channel' : null,
  );
  const emailChannel: EmailChannelState = channelData
    ? channelData.channel
      ? 'configured'
      : 'none'
    : 'unknown';
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<ManualLink | null>(null);
  // Contas criadas nesta sessão: a lista as mostra na hora, mesmo que a nova
  // busca ainda traga a versão antiga (o convite demora e a lista não pode
  // parecer vazia dele; nada de recarregar a página).
  const [justCreated, setJustCreated] = useState<UserAccountDto[]>([]);
  const visibleAccounts = accounts
    ? [
        ...accounts,
        ...justCreated.filter((c) => !accounts.some((a) => a.id === c.id)),
      ]
    : null;

  const professionalName = (id: string | null) =>
    (professionals ?? []).find((p) => p.id === id)?.fullName ?? '—';

  const toggleActive = async (account: UserAccountDto) => {
    try {
      await apiFetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !account.active }),
      });
      setActionError(null);
      toast({
        description: account.active ? 'Conta desativada' : 'Conta reativada',
        variant: 'success',
      });
      refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao atualizar conta';
      setActionError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  /** Remove o 2º fator de quem perdeu o celular (#295); a pessoa cadastra de novo no login. */
  const resetMfa = async (account: UserAccountDto) => {
    try {
      await apiFetch(`/api/accounts/${account.id}/reset-mfa`, {
        method: 'POST',
      });
      const notice = `Segundo fator de ${account.email} redefinido. As sessões dela foram encerradas.`;
      setActionError(null);
      setActionNotice(notice);
      toast({ description: notice, variant: 'success' });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Erro ao redefinir o segundo fator';
      setActionNotice(null);
      setActionError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  /** Reenvio do convite e link de redefinição: mesma resposta, mesmo tratamento. */
  const issueLink = async (
    account: UserAccountDto,
    path: 'resend-invite' | 'reset-link',
  ) => {
    try {
      const result = await apiFetch<AccessLinkResult>(
        `/api/accounts/${account.id}/${path}`,
        { method: 'POST' },
      );
      setActionError(null);
      setManualLink(
        result.inviteUrl
          ? { email: account.email, url: result.inviteUrl }
          : null,
      );
      const sentNotice =
        path === 'resend-invite'
          ? `Convite reenviado para ${account.email}.`
          : `Link de redefinição enviado para ${account.email}.`;
      setActionNotice(result.delivered ? sentNotice : null);
      toast({
        description: result.delivered
          ? sentNotice
          : `O e-mail para ${account.email} não saiu — copie o link e envie manualmente.`,
        variant: result.delivered ? 'success' : 'warning',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao gerar o link';
      setActionNotice(null);
      setActionError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  return (
    <Card as="section" className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Contas de acesso da equipe</h2>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          variant="accent"
        >
          + Nova conta
        </Button>
      </div>
      <p className="mb-4 text-ink-3 text-sm">
        Cada pessoa com sua senha: auditoria identifica quem acessou o
        prontuário e a evolução assume o autor automaticamente.
      </p>
      <AccountAlerts
        error={error}
        actionError={actionError}
        actionNotice={actionNotice}
        manualLink={manualLink}
      />

      <AccountsTable
        accounts={visibleAccounts}
        professionalName={professionalName}
        onToggleActive={(account) => void toggleActive(account)}
        onResendInvite={(account) => void issueLink(account, 'resend-invite')}
        onResetLink={(account) => void issueLink(account, 'reset-link')}
        onResetMfa={(account) => void resetMfa(account)}
      />

      {creating && (
        <Modal title="Nova conta de acesso" onClose={() => setCreating(false)}>
          <AccountForm
            professionals={(professionals ?? []).filter((p) => p.active)}
            emailChannel={emailChannel}
            onSaved={({
              email,
              inviteUrl,
              delivered: _delivered,
              ...account
            }) => {
              setCreating(false);
              setJustCreated((current) => [
                ...current,
                { email, ...account } as UserAccountDto,
              ]);
              setManualLink(inviteUrl ? { email, url: inviteUrl } : null);
              setActionNotice(null);
              toast({ description: 'Conta criada', variant: 'success' });
              refresh();
            }}
          />
        </Modal>
      )}
    </Card>
  );
}

function AccountAlerts({
  error,
  actionError,
  actionNotice,
  manualLink,
}: {
  error: string | null;
  actionError: string | null;
  actionNotice: string | null;
  manualLink: ManualLink | null;
}) {
  const errorMessage = actionError ?? error;
  return (
    <>
      {errorMessage && <ErrorAlert message={errorMessage} />}
      {!actionError && actionNotice && (
        <Alert className="mb-4">
          <AlertDescription>{actionNotice}</AlertDescription>
        </Alert>
      )}
      {manualLink && (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>
            <p className="mb-2">
              E-mail desativado nesta clínica — envie o link manualmente.
            </p>
            <AccessLinkField
              url={manualLink.url}
              label={`Link para ${manualLink.email}`}
            />
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function AccountsTable({
  accounts,
  professionalName,
  onToggleActive,
  onResendInvite,
  onResetLink,
  onResetMfa,
}: {
  accounts: UserAccountDto[] | null;
  professionalName: (id: string | null) => string;
  onToggleActive: (account: UserAccountDto) => void;
  onResendInvite: (account: UserAccountDto) => void;
  onResetLink: (account: UserAccountDto) => void;
  onResetMfa: (account: UserAccountDto) => void;
}) {
  if (!accounts) return <LoadingIndicator />;
  if (accounts.length === 0)
    return <EmptyState message="Nenhuma conta cadastrada nesta empresa." />;

  return (
    <div className="overflow-x-auto">
      <Table stack className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2 pr-3">Email</TableHead>
            <TableHead className="py-2 pr-3">Papel</TableHead>
            <TableHead className="py-2 pr-3">Profissional vinculado</TableHead>
            <TableHead className="py-2 pr-3">Situação</TableHead>
            <TableHead className="py-2 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              professionalName={professionalName(account.professionalId)}
              onToggleActive={() => onToggleActive(account)}
              onResendInvite={() => onResendInvite(account)}
              onResetLink={() => onResetLink(account)}
              onResetMfa={() => onResetMfa(account)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Contas da equipe têm segundo fator; os portais (paciente, parceiro, responsável), não (ACE-RN-42). */
function usesMfa(account: UserAccountDto): boolean {
  return (
    account.role !== 'patient' &&
    account.role !== 'partner' &&
    account.role !== 'guardian'
  );
}

function accountStatusLabel(account: UserAccountDto): string {
  if (account.anonymized) return 'Anonimizada';
  return account.active ? 'Ativa' : 'Desativada';
}

function AccountRow({
  account,
  professionalName,
  onToggleActive,
  onResendInvite,
  onResetLink,
  onResetMfa,
}: {
  account: UserAccountDto;
  professionalName: string;
  onToggleActive: () => void;
  onResendInvite: () => void;
  onResetLink: () => void;
  onResetMfa: () => void;
}) {
  return (
    <TableRow className={account.active ? '' : 'bg-surface-2/60'}>
      <TableCell label="Email" className="py-2 pr-3 font-medium">
        {account.email}
      </TableCell>
      <TableCell label="Papel" className="py-2 pr-3 text-ink-2">
        {accountRoleLabel(account.role)}
      </TableCell>
      <TableCell
        label="Profissional vinculado"
        className="py-2 pr-3 text-ink-2"
      >
        {professionalName}
      </TableCell>
      <TableCell label="Situação" className="py-2 pr-3">
        <StatusBadge
          status={account.active ? 'confirmed' : 'cancelled'}
          label={accountStatusLabel(account)}
        />
      </TableCell>
      <TableCell label="Ações" className="py-2 text-right">
        {account.active && !account.passwordSet && (
          <Button
            type="button"
            onClick={onResendInvite}
            variant="link"
            className="mr-3 h-auto p-0 text-ink-3"
          >
            Reenviar convite
          </Button>
        )}
        {account.active && account.passwordSet && (
          <ConfirmAction
            trigger={
              <Button
                type="button"
                variant="link"
                className="mr-3 h-auto p-0 text-ink-3"
              >
                Gerar link de redefinição
              </Button>
            }
            title="Gerar link de redefinição?"
            description={`Gerar um link de redefinição de senha para ${account.email}? Links anteriores deixam de valer.`}
            confirmLabel="Gerar link"
            onConfirm={onResetLink}
          />
        )}
        {account.active && account.passwordSet && usesMfa(account) && (
          <ConfirmAction
            trigger={
              <Button
                type="button"
                variant="link"
                className="mr-3 h-auto p-0 text-ink-3"
              >
                Redefinir segundo fator
              </Button>
            }
            title="Redefinir o segundo fator?"
            description={`Remove o autenticador e os códigos de recuperação de ${account.email} e encerra as sessões dela. Quem precisa do segundo fator cadastra um novo no próximo login.`}
            confirmLabel="Redefinir"
            variant="danger"
            onConfirm={onResetMfa}
          />
        )}
        {account.active ? (
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
            title="Desativar conta?"
            description="A conta perde acesso ao sistema imediatamente."
            confirmLabel="Confirmar"
            variant="danger"
            onConfirm={onToggleActive}
          />
        ) : account.anonymized ? (
          <span className="text-ink-3 text-xs">
            Anonimizada: para voltar, convide a pessoa novamente.
          </span>
        ) : (
          <Button
            type="button"
            onClick={onToggleActive}
            variant="link"
            className="h-auto p-0 text-ink-3"
          >
            Reativar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function missingLinkMessage(
  role: AccountRole,
  professionalId: string,
  recordId: string,
): string | null {
  if (role === 'profissional' && !professionalId) {
    return 'Selecione o profissional vinculado a esta conta';
  }
  if (role === 'patient' && !recordId) {
    return 'Selecione o paciente dono desta conta de portal';
  }
  if (role === 'partner' && !recordId) {
    return 'Selecione o parceiro dono desta conta de portal';
  }
  if (role === 'guardian' && !recordId) {
    return 'Selecione o responsável dono desta conta de portal';
  }
  return null;
}

function AccountForm({
  professionals,
  emailChannel,
  onSaved,
}: {
  professionals: ProfessionalDto[];
  emailChannel: EmailChannelState;
  onSaved: (created: UserAccountDto & AccessLinkResult) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  // Menor privilégio da equipe como padrão: o Admin de Empresa é escolha consciente (#475).
  const [role, setRole] = useState<AccountRole>('atendente');
  const [professionalId, setProfessionalId] = useState('');
  // Cadastro de paciente/parceiro dono da conta de portal (#196).
  const [recordId, setRecordId] = useState('');
  // Equipe atesta que o paciente autorizou o acesso do responsável (ADR-027).
  const [guardianAuthorized, setGuardianAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requiresProfessional = role === 'profissional';
  const portalRole =
    role === 'patient' || role === 'partner' || role === 'guardian'
      ? role
      : null;

  const changeRole = (next: AccountRole) => {
    setRole(next);
    setRecordId('');
    setGuardianAuthorized(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const missing = missingLinkMessage(role, professionalId, recordId);
    if (missing) {
      setError(missing);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<UserAccountDto & AccessLinkResult>(
        '/api/accounts',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            role,
            professionalId: professionalId || null,
            // Só nas contas de portal; ausentes (undefined) nas demais.
            patientId: role === 'patient' ? recordId : undefined,
            partnerId: role === 'partner' ? recordId : undefined,
            guardianId: role === 'guardian' ? recordId : undefined,
            guardianAuthorization:
              role === 'guardian' ? guardianAuthorized : undefined,
          }),
        },
      );
      onSaved(created);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao criar conta';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Email *
        <Input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
        />
      </label>
      <p className="text-ink-3 text-sm">{INVITE_HINT[emailChannel]}</p>
      <label className="font-medium text-sm">
        Papel *
        <NativeSelect
          value={role}
          onChange={(e) => changeRole(e.target.value as AccountRole)}
          className="mt-1"
        >
          {ACCOUNT_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {portalRole && (
        <>
          <PortalLinkField
            role={portalRole}
            value={recordId}
            onChange={setRecordId}
            onSuggestEmail={(suggested) => setEmail(suggested)}
          />
          <p className="text-ink-3 text-sm">
            O portal mostra os dados deste cadastro. O e-mail de login pode ser
            outro (ex.: de quem cuida do paciente) e não muda se o e-mail do
            cadastro for corrigido depois.
          </p>
          {role === 'guardian' && (
            <label className="flex items-start gap-2 font-medium text-sm">
              <Checkbox
                checked={guardianAuthorized}
                onChange={(e) => setGuardianAuthorized(e.target.checked)}
              />
              <span>
                Confirmo que o paciente (ou o representante legal dele)
                autorizou este responsável a acessar o portal em seu nome. O
                responsável verá consultas, evolução, fotos e faturas do
                paciente, e cada acesso fica registrado.
              </span>
            </label>
          )}
        </>
      )}
      <label className="font-medium text-sm">
        Profissional vinculado{requiresProfessional ? ' *' : ''}
        <NativeSelect
          required={requiresProfessional}
          value={professionalId}
          onChange={(e) => setProfessionalId(e.target.value)}
          className="mt-1"
        >
          <option value="">
            {requiresProfessional ? '— selecione —' : '— nenhum —'}
          </option>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.fullName}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Criando…' : 'Criar conta'}
      </Button>
    </form>
  );
}
