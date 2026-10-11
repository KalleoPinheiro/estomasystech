import { describe, expect, it } from 'vitest';
import {
  resolvePortalPartner,
  resolvePortalPatient,
} from '@/application/portal/portal-identity';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';

/**
 * Issue #219: o id do 404 vai para o log. No portal o `subject` da sessão é o
 * e-mail de login — ele não pode virar o `entityId` do NotFoundError.
 */
describe('Feature: 404 do portal não leva o e-mail de login (issue #219)', () => {
  const email = 'titular@x.com';
  const userAccounts = {
    findByEmail: async () => null,
  } as unknown as UserAccountRepository;

  it('Dado e-mail sem conta, Quando resolver o paciente, Então NotFound sem o e-mail', async () => {
    const error = await resolvePortalPatient(
      { userAccounts, patients: {} as PatientRepository },
      { subject: email, role: 'patient' },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).entityId).not.toContain(email);
    expect((error as Error).message).not.toContain(email);
  });

  it('Dado e-mail sem conta, Quando resolver o parceiro, Então NotFound sem o e-mail', async () => {
    const error = await resolvePortalPartner(
      { userAccounts, partners: {} as PartnerRepository },
      { subject: email, role: 'partner' },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).entityId).not.toContain(email);
  });
});
