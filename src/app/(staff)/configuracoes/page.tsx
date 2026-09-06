'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
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
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type {
  CalendarIntegrationStatusDto,
  ClinicInfoDto,
  ProfessionalDto,
  UserAccountDto,
} from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

// Papéis que uma conta Admin de Empresa pode cadastrar (PROVISIONING_MATRIX.company_admin,
// src/domain/auth/role-hierarchy.ts) — super_admin fica fora desta tela por design.
type AccountRole =
  | 'company_admin'
  | 'atendente'
  | 'profissional'
  | 'patient'
  | 'partner';

const ACCOUNT_ROLE_OPTIONS: { value: AccountRole; label: string }[] = [
  { value: 'company_admin', label: 'Admin de Empresa' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'patient', label: 'Paciente' },
  { value: 'partner', label: 'Parceiro' },
];

const WEEKDAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

interface ScheduleConfigDto {
  weekdays: number[];
  startHour: number;
  endHour: number;
  minGapMinutes: number;
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="sv-display font-bold text-2xl">Configurações</h1>
      <ClinicInfoSection />
      <ScheduleSection />
      <CalendarIntegrationSection />
      <AccountsSection />
    </div>
  );
}

type ClinicInfoDraft = ClinicInfoDto;

const CLINIC_INFO_FIELDS: {
  key: keyof ClinicInfoDraft;
  label: string;
  placeholder: string;
}[] = [
  { key: 'name', label: 'Razão social', placeholder: 'Nome da clínica' },
  { key: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00' },
  {
    key: 'professionalName',
    label: 'Responsável técnico',
    placeholder: 'Nome completo',
  },
  {
    key: 'professionalRegistry',
    label: 'Registro profissional',
    placeholder: 'COREN-SP 000000',
  },
  { key: 'address', label: 'Endereço', placeholder: 'Rua, número, bairro' },
  { key: 'city', label: 'Cidade', placeholder: 'Cidade/UF' },
];

/**
 * Dados cadastrais da clínica (issue #61) — CNPJ e responsável técnico
 * alimentam o cabeçalho/rodapé dos documentos emitidos (#62); sem eles, a
 * emissão é bloqueada (fail-closed) nas páginas de documento.
 */
function ClinicInfoSection() {
  const { toast } = useToast();
  const { data, error } = useApiQuery<{ info: ClinicInfoDto }>(
    '/api/settings/clinic-info',
  );
  const [edits, setEdits] = useState<ClinicInfoDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;

  const draft = edits ?? data.info;

  const save = async () => {
    setSaveError(null);
    try {
      await apiFetch('/api/settings/clinic-info', {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      toast({ description: 'Dados da clínica salvos', variant: 'success' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao salvar dados da clínica';
      setSaveError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Dados da clínica</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Razão social, CNPJ e responsável técnico aparecem em todo documento
        clínico emitido (atestado, relatório, plano de cuidados).
      </p>
      {saveError && <ErrorAlert message={saveError} />}

      <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {CLINIC_INFO_FIELDS.map((field) => (
          <label key={field.key} className="font-medium text-sm">
            {field.label}
            <Input
              value={draft[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) =>
                setEdits({ ...draft, [field.key]: e.target.value })
              }
              className="mt-1"
            />
          </label>
        ))}
      </div>

      <Button
        type="button"
        onClick={() => void save()}
        variant="accent"
        className="mt-4"
      >
        Salvar dados da clínica
      </Button>
    </Card>
  );
}

function validateScheduleDraft(draft: ScheduleConfigDto): string | null {
  if (draft.startHour >= draft.endHour) {
    return 'Horário de abertura deve ser antes do fechamento';
  }
  if (draft.minGapMinutes < 15 || draft.minGapMinutes > 120) {
    return 'Intervalo mínimo deve estar entre 15 e 120 minutos';
  }
  return null;
}

function ScheduleSection() {
  const { toast } = useToast();
  const { data, error, refresh } = useApiQuery<{
    config: ScheduleConfigDto;
    isDefault: boolean;
  }>('/api/settings/schedule');
  const [edits, setEdits] = useState<ScheduleConfigDto | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;

  // Sem edição local, exibe o que veio do servidor — nada de setState em effect.
  const draft = edits ?? data.config;
  const setDraft = (
    update:
      | ScheduleConfigDto
      | ((prev: ScheduleConfigDto | null) => ScheduleConfigDto | null),
  ) => setEdits(typeof update === 'function' ? update(draft) : update);

  const toggleDay = (day: number) =>
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            weekdays: prev.weekdays.includes(day)
              ? prev.weekdays.filter((d) => d !== day)
              : [...prev.weekdays, day].sort((a, b) => a - b),
          }
        : prev,
    );

  const save = async () => {
    const validationMessage = validateScheduleDraft(draft);
    if (validationMessage) {
      setSaveError(validationMessage);
      return;
    }
    setSaveError(null);
    try {
      await apiFetch('/api/settings/schedule', {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      refresh();
      toast({
        description:
          'Grade salva — vale imediatamente para novos agendamentos.',
        variant: 'success',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao salvar grade';
      setSaveError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Grade de horários</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Define dias e janela de atendimento usados na validação da agenda.
        {data.isDefault && ' (usando padrão — nada salvo ainda)'}
      </p>
      {saveError && <ErrorAlert message={saveError} />}

      <div className="mb-4 flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => (
          <Button
            key={day.value}
            type="button"
            onClick={() => toggleDay(day.value)}
            size="sm"
            variant={draft.weekdays.includes(day.value) ? 'accent' : 'outline'}
            aria-pressed={draft.weekdays.includes(day.value)}
            className="rounded-full"
          >
            {day.label}
          </Button>
        ))}
      </div>

      <div className="grid max-w-md grid-cols-3 gap-3">
        <label className="font-medium text-sm">
          Abre (h)
          <Input
            type="number"
            min="0"
            max="23"
            value={draft.startHour}
            onChange={(e) =>
              setDraft({ ...draft, startHour: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Fecha (h)
          <Input
            type="number"
            min="1"
            max="24"
            value={draft.endHour}
            onChange={(e) =>
              setDraft({ ...draft, endHour: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Intervalo (min)
          <Input
            type="number"
            min="15"
            max="120"
            value={draft.minGapMinutes}
            onChange={(e) =>
              setDraft({ ...draft, minGapMinutes: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
      </div>

      <Button
        type="button"
        onClick={() => void save()}
        variant="accent"
        className="mt-4"
      >
        Salvar grade
      </Button>
    </Card>
  );
}

/**
 * A conexão da agenda é uma integração, não um login: parte de uma sessão já
 * autenticada por senha e não interfere em nenhum fluxo de autenticação
 * (ADR-004). É um link direto porque a rota responde com um redirect do OAuth,
 * que o navegador precisa seguir na própria janela.
 */
// Allowlist de mensagens de erro do redirect do OAuth (mesmo padrão de
// LOGIN_ERROR_MESSAGES em src/app/login/page.tsx): nunca renderiza o valor
// bruto de `?reason=` — texto arbitrário da URL é vetor de phishing por texto
// refletido, mesmo com o React escapando.
const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  nao_configurado:
    'Integração com Google Agenda não está configurada no momento.',
  fluxo_invalido:
    'Não foi possível concluir a conexão — o fluxo expirou ou é inválido. Tente novamente.',
  sem_credencial:
    'O Google não devolveu credencial de longa duração — revogue o acesso do VittaFlow na sua conta Google e conecte de novo.',
  falha_conexao: 'Falha ao conectar o Google Agenda. Tente novamente.',
};
const GENERIC_CALENDAR_ERROR =
  'Não foi possível conectar o Google Agenda. Tente novamente.';

/**
 * Status real da conexão (issue #124) — antes disso a única forma de saber
 * se funcionou era consultar `google_accounts` direto no banco. O toast de
 * sucesso/erro do redirect do OAuth dispara uma única vez por combinação de
 * `calendar`/`reason` (evita repetir a cada re-render).
 */
export function CalendarIntegrationSection() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data, error, isLoading } = useApiQuery<CalendarIntegrationStatusDto>(
    '/api/settings/calendar-integration',
  );
  const calendarParam = searchParams.get('calendar');
  const reasonParam = searchParams.get('reason');
  const notifiedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!calendarParam) return;
    const key = `${calendarParam}:${reasonParam ?? ''}`;
    if (notifiedKey.current === key) return;
    notifiedKey.current = key;

    if (calendarParam === 'conectado') {
      toast({
        description: 'Google Agenda conectado com sucesso',
        variant: 'success',
      });
    } else if (calendarParam === 'erro') {
      toast({
        description: reasonParam
          ? (CALENDAR_ERROR_MESSAGES[reasonParam] ?? GENERIC_CALENDAR_ERROR)
          : GENERIC_CALENDAR_ERROR,
        variant: 'danger',
      });
    }
  }, [calendarParam, reasonParam, toast]);

  return (
    <Card as="section" className="p-5">
      <h2 className="font-semibold text-lg">Google Agenda</h2>
      <p className="mt-1 mb-4 text-ink-3 text-sm">
        Conecte a agenda do Google da clínica para sincronizar os agendamentos.
        A conexão é independente do login — sua sessão continua a mesma.
      </p>
      {error && <ErrorAlert message={error} />}
      {!error && isLoading && <LoadingIndicator />}
      {!error && !isLoading && data && (
        <p className="mb-4 text-ink-2 text-sm">
          {data.connected && data.email && data.connectedAt
            ? `Conectado como ${data.email} em ${formatDateTime(data.connectedAt)}.`
            : 'Nenhuma conta conectada.'}
        </p>
      )}
      <a
        href="/api/integrations/google-calendar"
        className="text-accent-ink text-sm hover:underline"
      >
        {data?.connected
          ? 'Reconectar Google Agenda'
          : 'Conectar Google Agenda'}
      </a>
    </Card>
  );
}

function AccountsSection() {
  const { toast } = useToast();
  const {
    data: accounts,
    error,
    refresh,
  } = useApiQuery<UserAccountDto[]>('/api/accounts');
  const { data: professionals } =
    useApiQuery<ProfessionalDto[]>('/api/professionals');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [undelivered, setUndelivered] = useState<string | null>(null);

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

  const resendInvite = async (account: UserAccountDto) => {
    try {
      const result = await apiFetch<{ delivered: boolean }>(
        `/api/accounts/${account.id}/resend-invite`,
        { method: 'POST' },
      );
      setActionError(null);
      if (result.delivered && account.email === undelivered) {
        setUndelivered(null);
      }
      const notice = result.delivered
        ? `Convite reenviado para ${account.email}.`
        : `Não foi possível enviar o e-mail para ${account.email} — tente novamente mais tarde.`;
      setActionNotice(notice);
      toast({
        description: notice,
        variant: result.delivered ? 'success' : 'danger',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao reenviar convite';
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
        undelivered={undelivered}
      />

      <AccountsTable
        accounts={accounts}
        professionalName={professionalName}
        onToggleActive={(account) => void toggleActive(account)}
        onResendInvite={(account) => void resendInvite(account)}
      />

      {creating && (
        <Modal title="Nova conta de acesso" onClose={() => setCreating(false)}>
          <AccountForm
            professionals={(professionals ?? []).filter((p) => p.active)}
            onSaved={({ email, delivered }) => {
              setCreating(false);
              setUndelivered(delivered ? null : email);
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
  undelivered,
}: {
  error: string | null;
  actionError: string | null;
  actionNotice: string | null;
  undelivered: string | null;
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
      {undelivered && (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>
            Conta criada, mas o convite não foi enviado para {undelivered} —
            reenvie pela tabela abaixo.
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
}: {
  accounts: UserAccountDto[] | null;
  professionalName: (id: string | null) => string;
  onToggleActive: (account: UserAccountDto) => void;
  onResendInvite: (account: UserAccountDto) => void;
}) {
  if (!accounts) return <LoadingIndicator />;
  if (accounts.length === 0)
    return <EmptyState message="Nenhuma conta cadastrada nesta empresa." />;

  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2 pr-3">Email</TableHead>
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
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AccountRow({
  account,
  professionalName,
  onToggleActive,
  onResendInvite,
}: {
  account: UserAccountDto;
  professionalName: string;
  onToggleActive: () => void;
  onResendInvite: () => void;
}) {
  return (
    <TableRow className={account.active ? '' : 'bg-surface-2/60'}>
      <TableCell className="py-2 pr-3 font-medium">{account.email}</TableCell>
      <TableCell className="py-2 pr-3 text-ink-2">{professionalName}</TableCell>
      <TableCell className="py-2 pr-3">
        <StatusBadge
          status={account.active ? 'confirmed' : 'cancelled'}
          label={account.active ? 'Ativa' : 'Desativada'}
        />
      </TableCell>
      <TableCell className="py-2 text-right">
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

function AccountForm({
  professionals,
  onSaved,
}: {
  professionals: ProfessionalDto[];
  onSaved: (created: { email: string; delivered: boolean }) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccountRole>('company_admin');
  const [professionalId, setProfessionalId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const requiresProfessional = role === 'profissional';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requiresProfessional && !professionalId) {
      setError('Selecione o profissional vinculado a esta conta');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<UserAccountDto & { delivered: boolean }>(
        '/api/accounts',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            role,
            professionalId: professionalId || null,
          }),
        },
      );
      onSaved({ email: created.email, delivered: created.delivered });
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
      <p className="text-ink-3 text-sm">
        A pessoa recebe um e-mail de convite e define a própria senha — ninguém
        digita senha por ela.
      </p>
      <label className="font-medium text-sm">
        Papel *
        <NativeSelect
          value={role}
          onChange={(e) => setRole(e.target.value as AccountRole)}
          className="mt-1"
        >
          {ACCOUNT_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </label>
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
