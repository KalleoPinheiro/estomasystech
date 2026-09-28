import { describe, expect, it } from 'vitest';
import { CreateAccount } from '@/application/auth/create-account';
import {
  ProvisioningDeniedError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';

const HASH = 'scrypt$16384$salt$hash';

describe('Feature: Cadastro de conta respeitando a hierarquia (RBAC-11..14)', () => {
  describe('Cenário: super_admin cadastra company_admin em qualquer empresa, pela plataforma (ADR-007, #253)', () => {
    it('Dado super_admin, Quando cadastrar company_admin em empresa X, Então aceita', async () => {
      const repo = new InMemoryUserAccountRepository();
      const useCase = new CreateAccount(repo);

      const account = await useCase.execute(
        { role: 'super_admin', clinicId: null },
        {
          email: 'novo@x.com',
          passwordHash: HASH,
          role: 'company_admin',
          clinicId: 'clinic-x',
        },
      );

      expect(account.role).toBe('company_admin');
      expect(account.clinicId).toBe('clinic-x');
    });

    it.each(['atendente', 'profissional', 'patient', 'partner'] as const)(
      'Dado super_admin, Quando cadastrar %s, Então rejeita (ProvisioningDeniedError) — ele não opera dentro da clínica (#253)',
      async (targetRole) => {
        const repo = new InMemoryUserAccountRepository();
        const useCase = new CreateAccount(repo);

        await expect(
          useCase.execute(
            { role: 'super_admin', clinicId: null },
            {
              email: `sa-nao-cadastra-${targetRole}@x.com`,
              passwordHash: HASH,
              role: targetRole,
              clinicId: 'clinic-x',
            },
          ),
        ).rejects.toThrow(ProvisioningDeniedError);
        expect(await repo.findAll()).toHaveLength(0);
      },
    );
  });

  describe('Cenário: nenhum ator cadastra super_admin (ADR-007)', () => {
    const ACTORS = [
      { role: 'super_admin', clinicId: null },
      { role: 'company_admin', clinicId: 'clinic-x' },
      { role: 'atendente', clinicId: 'clinic-x' },
      { role: 'profissional', clinicId: 'clinic-x' },
      { role: 'patient', clinicId: 'clinic-x' },
      { role: 'partner', clinicId: 'clinic-x' },
    ] as const;

    it.each(
      ACTORS.flatMap((actor) =>
        ['clinic-x', 'clinic-y'].map((clinicId) => [actor, clinicId] as const),
      ),
    )(
      'Dado ator %o e clínica-alvo %s, Quando cadastrar super_admin, Então nenhum ator cadastra super_admin e nada é gravado',
      async (actor, clinicId) => {
        const repo = new InMemoryUserAccountRepository();
        const useCase = new CreateAccount(repo);

        await expect(
          useCase.execute(actor, {
            email: 'outro-sa@x.com',
            passwordHash: HASH,
            role: 'super_admin',
            clinicId,
          }),
        ).rejects.toThrow(ProvisioningDeniedError);
        expect(await repo.findAll()).toHaveLength(0);
      },
    );
  });

  describe('Cenário: company_admin cadastra dentro da própria empresa', () => {
    it.each([
      'profissional',
      'atendente',
      'patient',
      'partner',
      'company_admin',
    ] as const)(
      'Dado company_admin, Quando cadastrar %s na própria empresa, Então aceita',
      async (targetRole) => {
        const repo = new InMemoryUserAccountRepository();
        const useCase = new CreateAccount(repo);

        const account = await useCase.execute(
          { role: 'company_admin', clinicId: 'clinic-a' },
          {
            email: `${targetRole}@x.com`,
            passwordHash: HASH,
            role: targetRole,
            clinicId: 'clinic-a',
            professionalId:
              targetRole === 'profissional' ? 'professional-1' : null,
            patientId: targetRole === 'patient' ? 'patient-1' : null,
            partnerId: targetRole === 'partner' ? 'partner-1' : null,
          },
        );

        expect(account.role).toBe(targetRole);
      },
    );

    it('Dado role profissional sem professionalId, Quando cadastrar, Então rejeita (ValidationError)', async () => {
      const repo = new InMemoryUserAccountRepository();
      const useCase = new CreateAccount(repo);

      await expect(
        useCase.execute(
          { role: 'company_admin', clinicId: 'clinic-a' },
          {
            email: 'prof-sem-vinculo@x.com',
            passwordHash: HASH,
            role: 'profissional',
            clinicId: 'clinic-a',
            professionalId: null,
          },
        ),
      ).rejects.toThrow(ValidationError);
      expect(await repo.findAll()).toHaveLength(0);
    });

    it('Dado company_admin, Quando cadastrar super_admin, Então rejeita (ProvisioningDeniedError)', async () => {
      const repo = new InMemoryUserAccountRepository();
      const useCase = new CreateAccount(repo);

      await expect(
        useCase.execute(
          { role: 'company_admin', clinicId: 'clinic-a' },
          {
            email: 'sa@x.com',
            passwordHash: HASH,
            role: 'super_admin',
            clinicId: 'clinic-a',
          },
        ),
      ).rejects.toThrow(ProvisioningDeniedError);
    });

    it('Dado company_admin, Quando cadastrar em empresa diferente, Então rejeita (ProvisioningDeniedError)', async () => {
      const repo = new InMemoryUserAccountRepository();
      const useCase = new CreateAccount(repo);

      await expect(
        useCase.execute(
          { role: 'company_admin', clinicId: 'clinic-a' },
          {
            email: 'outra-empresa@x.com',
            passwordHash: HASH,
            role: 'patient',
            patientId: 'patient-cadastro-1',
            clinicId: 'clinic-b',
          },
        ),
      ).rejects.toThrow(ProvisioningDeniedError);
    });

    it('Dado duas contas company_admin cadastradas na mesma empresa, Quando ambas existem, Então aceita as duas (sem limite)', async () => {
      const repo = new InMemoryUserAccountRepository();
      const useCase = new CreateAccount(repo);

      await useCase.execute(
        { role: 'super_admin', clinicId: null },
        {
          email: 'admin1@x.com',
          passwordHash: HASH,
          role: 'company_admin',
          clinicId: 'clinic-a',
        },
      );
      const second = await useCase.execute(
        { role: 'company_admin', clinicId: 'clinic-a' },
        {
          email: 'admin2@x.com',
          passwordHash: HASH,
          role: 'company_admin',
          clinicId: 'clinic-a',
        },
      );

      expect(second.role).toBe('company_admin');
      expect(await repo.findAll()).toHaveLength(2);
    });
  });

  describe('Cenário: atendente e profissional cadastram só patient/partner', () => {
    it.each(['atendente', 'profissional'] as const)(
      'Dado %s, Quando cadastrar patient na própria empresa, Então aceita',
      async (actorRole) => {
        const repo = new InMemoryUserAccountRepository();
        const useCase = new CreateAccount(repo);

        const account = await useCase.execute(
          { role: actorRole, clinicId: 'clinic-a' },
          {
            email: `paciente-${actorRole}@x.com`,
            passwordHash: HASH,
            role: 'patient',
            patientId: 'patient-cadastro-2',
            clinicId: 'clinic-a',
          },
        );

        expect(account.role).toBe('patient');
      },
    );

    it.each(['atendente', 'profissional'] as const)(
      'Dado %s, Quando cadastrar profissional, Então rejeita (ProvisioningDeniedError)',
      async (actorRole) => {
        const repo = new InMemoryUserAccountRepository();
        const useCase = new CreateAccount(repo);

        await expect(
          useCase.execute(
            { role: actorRole, clinicId: 'clinic-a' },
            {
              email: `outro-prof-${actorRole}@x.com`,
              passwordHash: HASH,
              role: 'profissional',
              clinicId: 'clinic-a',
            },
          ),
        ).rejects.toThrow(ProvisioningDeniedError);
      },
    );
  });

  describe('Cenário: patient e partner não cadastram ninguém (RBAC-10)', () => {
    it.each(['patient', 'partner'] as const)(
      'Dado %s, Quando tentar cadastrar qualquer papel, Então rejeita (ProvisioningDeniedError)',
      async (actorRole) => {
        const repo = new InMemoryUserAccountRepository();
        const useCase = new CreateAccount(repo);

        await expect(
          useCase.execute(
            { role: actorRole, clinicId: 'clinic-a' },
            {
              email: `x-${actorRole}@x.com`,
              passwordHash: HASH,
              role: 'patient',
              patientId: 'patient-cadastro-3',
              clinicId: 'clinic-a',
            },
          ),
        ).rejects.toThrow(ProvisioningDeniedError);
      },
    );
  });

  describe('Cenário: email duplicado', () => {
    it('Dado email já cadastrado, Quando cadastrar de novo, Então rejeita (ValidationError)', async () => {
      const repo = new InMemoryUserAccountRepository();
      const useCase = new CreateAccount(repo);

      await useCase.execute(
        { role: 'company_admin', clinicId: 'clinic-a' },
        {
          email: 'duplicado@x.com',
          passwordHash: HASH,
          role: 'patient',
          patientId: 'patient-cadastro-4',
          clinicId: 'clinic-a',
        },
      );

      await expect(
        useCase.execute(
          { role: 'company_admin', clinicId: 'clinic-a' },
          {
            email: 'duplicado@x.com',
            passwordHash: HASH,
            role: 'partner',
            partnerId: 'partner-cadastro-5',
            clinicId: 'clinic-a',
          },
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Cenário: conta de portal nasce vinculada ao cadastro (#196)', () => {
    const actor = { role: 'company_admin' as const, clinicId: 'clinic-x' };
    const input = (extra: Record<string, unknown>) => ({
      email: `portal-${Math.random()}@x.com`,
      passwordHash: HASH,
      clinicId: 'clinic-x',
      ...extra,
    });

    it('Dado papel patient sem patientId ou partner sem partnerId, Então ValidationError', async () => {
      const useCase = new CreateAccount(new InMemoryUserAccountRepository());

      await expect(
        useCase.execute(actor, input({ role: 'patient' }) as never),
      ).rejects.toThrow(/patientId é obrigatório/);
      await expect(
        useCase.execute(actor, input({ role: 'partner' }) as never),
      ).rejects.toThrow(/partnerId é obrigatório/);
    });

    it('Dado cadastro que já tem acesso, Quando criar outro, Então ValidationError', async () => {
      const useCase = new CreateAccount(new InMemoryUserAccountRepository());
      await useCase.execute(
        actor,
        input({ role: 'patient', patientId: 'p1' }) as never,
      );

      await expect(
        useCase.execute(
          actor,
          input({ role: 'patient', patientId: 'p1' }) as never,
        ),
      ).rejects.toThrow('Este paciente já tem acesso ao portal');
    });

    it('Dado papel de equipe com patientId, Então o vínculo é ignorado', async () => {
      const useCase = new CreateAccount(new InMemoryUserAccountRepository());
      const account = await useCase.execute(
        actor,
        input({ role: 'atendente', patientId: 'p9' }) as never,
      );

      expect(account.patientId).toBeNull();
    });
  });
});
