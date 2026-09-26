import { describe, expect, it } from 'vitest';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { Session } from '@/lib/auth/session';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';

const session = (overrides: Partial<Session>): Session =>
  ({
    subject: 'conta@x.com',
    role: 'company_admin',
    clinicId: 'c1',
    professionalId: null,
    ...overrides,
  }) as Session;

const accounts = (
  byEmail: Record<string, { professionalId: string | null }>,
): UserAccountRepository =>
  ({
    findByEmail: async (email: string) => byEmail[email] ?? null,
  }) as unknown as UserAccountRepository;

describe('resolveSessionProfessionalId (#64, #200)', () => {
  it('profissional usa o professionalId da própria sessão', async () => {
    const id = await resolveSessionProfessionalId(
      session({ role: 'profissional', professionalId: 'pro-a' }),
      accounts({}),
    );

    expect(id).toBe('pro-a');
  });

  it('admin vinculado a profissional usa o vínculo da conta', async () => {
    const id = await resolveSessionProfessionalId(
      session({ subject: 'admin@x.com' }),
      accounts({ 'admin@x.com': { professionalId: 'pro-b' } }),
    );

    expect(id).toBe('pro-b');
  });

  it('C20 conta sem profissional vinculado resolve null', async () => {
    const id = await resolveSessionProfessionalId(
      session({ subject: 'admin@x.com' }),
      accounts({ 'admin@x.com': { professionalId: null } }),
    );

    expect(id).toBeNull();
  });

  it('sem sessão, sessão local ou conta inexistente resolve null', async () => {
    expect(await resolveSessionProfessionalId(null, accounts({}))).toBeNull();
    expect(
      await resolveSessionProfessionalId(
        session({ subject: 'local' }),
        accounts({}),
      ),
    ).toBeNull();
    expect(
      await resolveSessionProfessionalId(
        session({ subject: 'sumiu@x.com' }),
        accounts({}),
      ),
    ).toBeNull();
  });
});
