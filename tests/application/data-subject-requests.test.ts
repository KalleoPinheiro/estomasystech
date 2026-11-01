import { describe, expect, it, vi } from 'vitest';
import {
  DECISION_EMAIL_SUBJECT,
  ResolveDataSubjectRequest,
} from '@/application/patients/data-subject-requests';
import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import {
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import { NotFoundError } from '@/domain/shared/errors';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

function fakes(options: { account?: UserAccount | null; email: EmailGateway }) {
  const stored = new Map<string, DataSubjectRequest>();
  const requests = {
    save: vi.fn(async (request: DataSubjectRequest) => {
      stored.set(request.id, request);
    }),
    findById: vi.fn(async (id: string) => stored.get(id) ?? null),
    findByPatient: vi.fn(async () => [...stored.values()]),
    listByStatus: vi.fn(async () => [...stored.values()]),
  } satisfies DataSubjectRequestRepository;
  const accounts = {
    findByPortalLink: vi.fn(async () => options.account ?? null),
  } as unknown as UserAccountRepository;
  return {
    stored,
    useCase: new ResolveDataSubjectRequest(requests, accounts, options.email),
  };
}

const patient = { id: 'p-maria' };
const account = UserAccount.create({
  email: 'login-maria@x.com',
  passwordHash: UNSET_PASSWORD_HASH,
  role: 'patient',
  clinicId: 'c1',
  patientId: patient.id,
});

const run = async (
  useCase: ResolveDataSubjectRequest,
  input: Parameters<ResolveDataSubjectRequest['prepare']>[0],
) => useCase.commit(await useCase.prepare(input));

const pending = () =>
  DataSubjectRequest.create({ patientId: patient.id, kind: 'erasure' });

describe('ResolveDataSubjectRequest (#293)', () => {
  it('canal ativo: avisa o paciente no e-mail de login do portal e devolve notified = true', async () => {
    const send = vi.fn(async () => undefined);
    const { stored, useCase } = fakes({
      account,
      email: { isEnabled: async () => true, send },
    });
    const request = pending();
    stored.set(request.id, request);

    const result = await run(useCase, {
      requestId: request.id,
      decision: 'reject',
      justification: 'Guarda legal',
    });

    expect(result.notified).toBe(true);
    expect(result.request.status).toBe('rejected');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'login-maria@x.com',
        subject: DECISION_EMAIL_SUBJECT,
      }),
    );
  });

  it('falha no envio não desfaz a decisão', async () => {
    const { stored, useCase } = fakes({
      account,
      email: {
        isEnabled: async () => true,
        send: async () => {
          throw new Error('provedor fora');
        },
      },
    });
    const request = pending();
    stored.set(request.id, request);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await run(useCase, {
      requestId: request.id,
      decision: 'accept',
      justification: 'Anonimização agendada',
    });

    expect(result.notified).toBe(false);
    expect(stored.get(request.id)?.status).toBe('accepted');
  });

  it('sem conta de portal ativa: decide sem aviso', async () => {
    const send = vi.fn(async () => undefined);
    const { stored, useCase } = fakes({
      account: null,
      email: { isEnabled: async () => true, send },
    });
    const request = pending();
    stored.set(request.id, request);

    const result = await run(useCase, {
      requestId: request.id,
      decision: 'accept',
      justification: 'ok',
    });

    expect(result.notified).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('conta de portal inativa: decide sem aviso', async () => {
    const send = vi.fn(async () => undefined);
    const { stored, useCase } = fakes({
      account: account.deactivate(),
      email: { isEnabled: async () => true, send },
    });
    const request = pending();
    stored.set(request.id, request);

    const result = await run(useCase, {
      requestId: request.id,
      decision: 'accept',
      justification: 'ok',
    });

    expect(result.notified).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('pedido inexistente: NotFoundError', async () => {
    const { useCase } = fakes({
      account,
      email: { isEnabled: async () => true, send: async () => undefined },
    });

    await expect(
      useCase.prepare({
        requestId: 'x',
        decision: 'accept',
        justification: 'ok',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('pedido inexistente: a mensagem nomeia o pedido e o id (#555)', async () => {
    const { useCase } = fakes({
      account,
      email: { isEnabled: async () => true, send: async () => undefined },
    });

    await expect(
      useCase.prepare({
        requestId: 'x',
        decision: 'accept',
        justification: 'ok',
      }),
    ).rejects.toMatchObject({ entity: 'Pedido', entityId: 'x' });
  });
});
