import { describe, expect, it, vi } from 'vitest';
import {
  AlertDataRequestDeadlines,
  DEADLINE_ALERT_EMAIL_SUBJECT,
  deadlineAlertDaysFromEnv,
} from '@/application/patients/alert-data-request-deadlines';
import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import {
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

const CREATED = new Date('2026-10-01T15:00:00Z'); // limite: 16/10 (São Paulo)

const admin = (email: string) =>
  UserAccount.create({
    email,
    passwordHash: UNSET_PASSWORD_HASH,
    role: 'company_admin',
    clinicId: 'c1',
  });

function setup(options: {
  requests: DataSubjectRequest[];
  admins?: UserAccount[];
  enabled?: boolean;
  send?: EmailGateway['send'];
  save?: DataSubjectRequestRepository['save'];
  alertDays?: number;
}) {
  const stored = new Map(options.requests.map((r) => [r.id, r]));
  const requests = {
    save: vi.fn(
      options.save ??
        (async (request: DataSubjectRequest) => {
          stored.set(request.id, request);
        }),
    ),
    listByStatus: vi.fn(async () =>
      [...stored.values()].filter((r) => r.status === 'pending'),
    ),
  } as unknown as DataSubjectRequestRepository;
  const accounts = {
    findByRole: vi.fn(async () => options.admins ?? [admin('adm@x.com')]),
  } as unknown as UserAccountRepository;
  const send = vi.fn(options.send ?? (async () => undefined));
  const email: EmailGateway = {
    isEnabled: async () => options.enabled ?? true,
    send,
  };
  return {
    stored,
    send,
    save: requests.save as ReturnType<typeof vi.fn>,
    useCase: new AlertDataRequestDeadlines(
      requests,
      accounts,
      email,
      options.alertDays,
    ),
  };
}

const request = (createdAt = CREATED) =>
  DataSubjectRequest.create({ patientId: 'p1', kind: 'erasure' }, createdAt);

const day = (iso: string) => new Date(iso);

describe('AlertDataRequestDeadlines (#312)', () => {
  it('avisa os Admins 3 dias antes do vencimento, sem nome nem texto, e marca o pedido', async () => {
    const pending = request();
    const { useCase, send, stored } = setup({
      requests: [pending],
      admins: [admin('a@x.com'), admin('b@x.com')],
    });

    const summary = await useCase.execute(day('2026-10-13T15:00:00Z'));

    expect(summary).toEqual({ alerted: 1, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@x.com',
        subject: DEADLINE_ALERT_EMAIL_SUBJECT,
      }),
    );
    expect(send.mock.calls[0]?.[0].text).toContain('1 pedido');
    expect(stored.get(pending.id)?.deadlineAlertedAt).toEqual(
      day('2026-10-13T15:00:00Z'),
    );
  });

  it('4 dias antes ainda não avisa', async () => {
    const { useCase, send } = setup({ requests: [request()] });

    const summary = await useCase.execute(day('2026-10-12T15:00:00Z'));

    expect(summary).toEqual({ alerted: 0, skipped: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('a virada de dia é a da clínica: 23h do dia -4 em São Paulo ainda não avisa, 00h do dia -3 avisa', async () => {
    const before = setup({ requests: [request()] });
    const after = setup({ requests: [request()] });

    // 11/10 23:30 em São Paulo = 12/10 02:30 UTC → faltam 4 dias.
    await before.useCase.execute(day('2026-10-12T02:30:00Z'));
    // 12/10 00:30 em São Paulo = 12/10 03:30 UTC → faltam 4 dias; 13/10 00:30 → 3.
    await after.useCase.execute(day('2026-10-13T03:30:00Z'));

    expect(before.send).not.toHaveBeenCalled();
    expect(after.send).toHaveBeenCalled();
  });

  it('não repete o aviso de pedido já avisado', async () => {
    const alerted = request().markDeadlineAlerted(day('2026-10-13T15:00:00Z'));
    const { useCase, send } = setup({ requests: [alerted] });

    const summary = await useCase.execute(day('2026-10-14T15:00:00Z'));

    expect(summary.alerted).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('pedido vencido sem aviso entra no aviso; vários viram um e-mail só', async () => {
    const { useCase, send } = setup({
      requests: [request(), request(day('2026-10-02T15:00:00Z'))],
    });

    const summary = await useCase.execute(day('2026-10-20T15:00:00Z'));

    expect(summary.alerted).toBe(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].text).toContain('2 pedidos');
  });

  it('pedido já decidido não é avisado', async () => {
    const { useCase, send } = setup({ requests: [request().accept('ok')] });

    await useCase.execute(day('2026-10-20T15:00:00Z'));

    expect(send).not.toHaveBeenCalled();
  });

  it('respeita a antecedência configurada', async () => {
    const { useCase, send } = setup({ requests: [request()], alertDays: 7 });

    await useCase.execute(day('2026-10-09T15:00:00Z')); // faltam 7

    expect(send).toHaveBeenCalled();
  });

  it('sem canal de e-mail: conta como pulado e não marca (avisa quando houver canal)', async () => {
    const { useCase, send, save } = setup({
      requests: [request()],
      enabled: false,
    });

    const summary = await useCase.execute(day('2026-10-14T15:00:00Z'));

    expect(summary).toEqual({ alerted: 0, skipped: 1, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('falha no envio a todos: não marca, para tentar de novo no dia seguinte', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { useCase, save } = setup({
      requests: [request()],
      send: async () => {
        throw new Error('provedor fora');
      },
    });

    const summary = await useCase.execute(day('2026-10-14T15:00:00Z'));

    expect(summary).toEqual({ alerted: 0, skipped: 0, failed: 1 });
    expect(save).not.toHaveBeenCalled();
  });

  it('um Admin falha e outro recebe: o pedido é marcado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const { useCase } = setup({
      requests: [request()],
      admins: [admin('a@x.com'), admin('b@x.com')],
      send: async () => {
        calls += 1;
        if (calls === 1) throw new Error('caixa cheia');
      },
    });

    const summary = await useCase.execute(day('2026-10-14T15:00:00Z'));

    expect(summary.alerted).toBe(1);
  });

  it('sem Admin ativo ninguém recebe e nada é marcado', async () => {
    const { useCase, send, save } = setup({
      requests: [request()],
      admins: [admin('off@x.com').deactivate()],
    });

    const summary = await useCase.execute(day('2026-10-14T15:00:00Z'));

    expect(summary.failed).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('falha ao marcar o aviso conta como falha, sem derrubar o lote', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { useCase } = setup({
      requests: [request()],
      save: async () => {
        throw new Error('banco fora');
      },
    });

    const summary = await useCase.execute(day('2026-10-14T15:00:00Z'));

    expect(summary).toEqual({ alerted: 0, skipped: 0, failed: 1 });
  });
});

describe('deadlineAlertDaysFromEnv', () => {
  it.each([
    [undefined, 3],
    ['', 3],
    ['5', 5],
    [' 7 ', 7],
    ['0', 3],
    ['15', 3],
    ['2.5', 3],
    ['abc', 3],
  ])('%j → %i', (raw, expected) => {
    expect(deadlineAlertDaysFromEnv(raw)).toBe(expected);
  });
});
