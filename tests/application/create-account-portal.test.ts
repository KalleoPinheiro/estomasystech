import { describe, expect, it } from 'vitest';
import { CreateAccount } from '@/application/auth/create-account';
import { ValidationError } from '@/domain/shared/errors';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';

const HASH = 'scrypt$16384$salt$hash';
const actor = { role: 'company_admin' as const, clinicId: 'clinic-x' };

const input = (extra: Record<string, unknown>) =>
  ({
    email: `portal-${Math.random()}@x.com`,
    passwordHash: HASH,
    clinicId: 'clinic-x',
    ...extra,
  }) as never;

describe('Feature: Acesso ao portal vinculado ao cadastro, um por titular (#196)', () => {
  it('Dado papel responsável sem guardianId, Quando cadastrar o acesso, Então recusa pedindo o vínculo', async () => {
    const useCase = new CreateAccount(new InMemoryUserAccountRepository());

    await expect(
      useCase.execute(actor, input({ role: 'guardian' })),
    ).rejects.toThrow('guardianId é obrigatório para o papel responsável');
  });

  it('Dado parceiro que já tem acesso, Quando cadastrar outro acesso para ele, Então recusa', async () => {
    const useCase = new CreateAccount(new InMemoryUserAccountRepository());
    await useCase.execute(
      actor,
      input({ role: 'partner', partnerId: 'par-1' }),
    );

    await expect(
      useCase.execute(actor, input({ role: 'partner', partnerId: 'par-1' })),
    ).rejects.toThrow(
      new ValidationError('Este parceiro já tem acesso ao portal'),
    );
  });

  it('Dado responsável que já tem acesso, Quando cadastrar outro acesso para ele, Então recusa; o vínculo vai só no papel dele', async () => {
    const useCase = new CreateAccount(new InMemoryUserAccountRepository());
    const created = await useCase.execute(
      actor,
      input({ role: 'guardian', guardianId: 'resp-1' }),
    );
    expect(created.guardianId).toBe('resp-1');
    expect(created.patientId).toBeNull();
    expect(created.partnerId).toBeNull();

    await expect(
      useCase.execute(actor, input({ role: 'guardian', guardianId: 'resp-1' })),
    ).rejects.toThrow('Este responsável já tem acesso ao portal');
  });
});
