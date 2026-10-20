import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeOwnPassword } from '@/application/auth/change-own-password';
import { assertCanGrantGuardianAccess } from '@/application/auth/grant-guardian-access';
import { PrescribeIntervention } from '@/application/clinical/prescribe-intervention';
import { OpenDataSubjectRequest } from '@/application/patients/data-subject-requests';
import { getGuardianAccess } from '@/application/portal/get-guardian-access';
import {
  consentSignerFor,
  resolvePortalPatient,
} from '@/application/portal/portal-identity';
import { revokeGuardianAccess } from '@/application/portal/revoke-guardian-access';
import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import type { CarePlanRepository } from '@/domain/clinical/clinical-repositories';
import { Guardian } from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { Patient } from '@/domain/patient/patient';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { hashPassword, UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { logger } from '@/lib/observability/logger';

vi.mock('@/lib/log-error', () => ({ logError: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Feature: Troca da própria senha (#295)', () => {
  it('Dado conta que sumiu da leitura após a troca, Quando trocar a senha, Então a versão de sessão esperada é a seguinte à atual', async () => {
    const account = UserAccount.restore({
      id: 'u-1',
      email: 'enf@alfa.com',
      passwordHash: await hashPassword('SenhaAtual#2026', 16384),
      role: 'company_admin',
      clinicId: 'c-1',
      active: true,
      createdAt: new Date(),
      sessionVersion: 3,
    });
    const userAccounts = {
      updatePasswordHash: vi.fn(async () => undefined),
      findById: async () => null,
    } as unknown as UserAccountRepository;

    const version = await changeOwnPassword(
      userAccounts,
      account,
      { currentPassword: 'SenhaAtual#2026', newPassword: 'NovaSenha#2027x' },
      async () => undefined,
    );

    expect(version).toBe(4);
  });
});

describe('Feature: Acesso do responsável ao portal (ADR-027, ADR-028)', () => {
  it('Dado acesso a conceder sem responsável informado, Quando conferir as pré-condições, Então recusa por responsável não encontrado', async () => {
    await expect(
      assertCanGrantGuardianAccess(
        {
          guardians: new InMemoryGuardianRepository(),
          patients: new InMemoryPatientRepository(),
        },
        undefined,
        true,
      ),
    ).rejects.toThrow(
      new ValidationError('Responsável vinculado não encontrado'),
    );
  });

  it('Dado paciente cujo cadastro de responsável foi apagado, Quando consultar a evidência de acesso, Então não há acesso a mostrar', async () => {
    const patient = Patient.create({
      fullName: 'Paulo Titular',
      phone: '11999990000',
      guardianId: 'resp-apagado',
    });

    const view = await getGuardianAccess(
      {
        guardians: new InMemoryGuardianRepository(),
        userAccounts: new InMemoryUserAccountRepository(),
        auditEvents: new InMemoryAuditEventRepository(),
      },
      patient,
    );

    expect(view).toBeNull();
  });

  it('Dado falha ao ler o cadastro do responsável no encerramento, Quando o paciente encerrar o acesso, Então o encerramento vale e o aviso falho é registrado sem endereço', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const patients = new InMemoryPatientRepository();
    const guardian = Guardian.create({
      fullName: 'Ana Souza',
      relationship: 'filho',
      phone: '11977770000',
    });
    const patient = Patient.create({
      fullName: 'Paulo Titular',
      phone: '11999990000',
      guardianId: guardian.id,
    });
    await patients.save(patient);
    const guardians = {
      findById: async () => {
        throw new Error('banco indisponível');
      },
    } as unknown as GuardianRepository;

    const revoked = await revokeGuardianAccess(
      {
        patients,
        auditEvents: new InMemoryAuditEventRepository(),
        guardians,
        email: { isEnabled: async () => true, send: vi.fn() },
      },
      patient,
      { subject: 'paciente@x.com', clinicId: null },
    );

    expect(revoked.guardianPortalRevokedAt).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      `Aviso de encerramento do acesso do paciente ${patient.id} não enviado`,
    );
  });
});

describe('Feature: Identidade do portal para responsáveis (ADR-027)', () => {
  const setup = async () => {
    const userAccounts = new InMemoryUserAccountRepository();
    const patients = new InMemoryPatientRepository();
    const guardians = new InMemoryGuardianRepository();
    const guardian = Guardian.create({
      fullName: 'Paula Mãe',
      relationship: 'mae',
      phone: '11999990000',
    });
    await guardians.save(guardian);
    const account = UserAccount.create({
      email: 'paula@x.com',
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'guardian',
      clinicId: 'clinica-da-conta',
      guardianId: guardian.id,
    });
    await userAccounts.save(account);
    const patient = Patient.create({
      fullName: 'Bruno Menor',
      phone: '11999990000',
      birthDate: new Date('2018-01-01T00:00:00Z'),
      guardianId: guardian.id,
    });
    await patients.save(patient);
    const auditEvents = new InMemoryAuditEventRepository();
    return {
      repos: { userAccounts, patients, guardians, auditEvents },
      patient,
    };
  };

  it('Dado sessão de responsável sem empresa na sessão, Quando resolver o paciente, Então a trilha de acesso usa a empresa da conta', async () => {
    const { repos, patient } = await setup();

    const resolved = await resolvePortalPatient(repos, {
      subject: 'paula@x.com',
      role: 'guardian',
    });

    expect(resolved.id).toBe(patient.id);
    const [event] = await repos.auditEvents.findAll({});
    expect(event.clinicId).toBe('clinica-da-conta');
  });

  it('Dado paciente sem responsável vinculado, Quando a sessão for de responsável, Então não pode assinar por ele', async () => {
    const { repos } = await setup();
    const semResponsavel = Patient.create({
      fullName: 'Carla Adulta',
      phone: '11999990000',
      birthDate: new Date('1990-01-01T00:00:00Z'),
    });

    await expect(
      consentSignerFor(
        repos,
        { subject: 'paula@x.com', role: 'guardian' },
        semResponsavel,
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('Feature: Plano de cuidados e pedidos do titular nas bordas', () => {
  it('Dado plano de cuidados inexistente, Quando prescrever intervenção, Então recusa com não encontrado', async () => {
    const carePlans = {
      findById: async () => null,
    } as unknown as CarePlanRepository;

    await expect(
      new PrescribeIntervention({} as never, carePlans, {} as never).execute({
        carePlanId: 'plano-fantasma',
        interventionCode: '3660',
        frequency: 'a cada troca',
        priority: 'alta',
      }),
    ).rejects.toThrow(new NotFoundError('Plano de cuidados', 'plano-fantasma'));
  });

  it('Dado e-mail que falha para um dos admins, Quando o titular abrir o pedido, Então o pedido é gravado e o envio falho não o desfaz', async () => {
    const admin = UserAccount.create({
      email: 'admin@alfa.com',
      passwordHash: 'scrypt$1$s$h',
      role: 'company_admin',
      clinicId: 'c-1',
    });
    const accounts = {
      findByRole: async () => [admin],
    } as unknown as UserAccountRepository;
    const save = vi.fn(async () => undefined);
    const email: EmailGateway = {
      isEnabled: async () => true,
      send: async () => {
        throw new Error('Resend API 500');
      },
    };
    const request = DataSubjectRequest.create({
      patientId: 'p-1',
      kind: 'erasure',
    });

    await new OpenDataSubjectRequest({ save } as never, accounts, email).commit(
      request,
    );

    expect(save).toHaveBeenCalledWith(request);
  });
});
