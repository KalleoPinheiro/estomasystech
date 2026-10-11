import { beforeAll, describe, expect, it } from 'vitest';
import { CreatePartner } from '@/application/partners/create-partner';
import { CreatePatient } from '@/application/patients/create-patient';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { Clinic } from '@/domain/clinic/clinic';
import { getRepositories } from '@/infrastructure/container';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

const PASSWORD = 'senha-forte-123';
const STAFF_MESSAGE =
  'O acesso desta clínica está suspenso. Fale com o responsável pela clínica.';
const PORTAL_MESSAGE =
  'O acesso desta clínica está suspenso. Fale com o responsável pela clínica: telefone 11 3333-4444, e-mail contato@suspensa.test.';

let seq = 0;
let passwordHash = '';
let ipCounter = 0;

const repositories = (clinicId: string) =>
  getRepositories(clinicScope(clinicId));

async function newClinic(contact: boolean): Promise<Clinic> {
  seq += 1;
  const clinic = Clinic.restore({
    id: `login-susp-${seq}`,
    name: `Clínica ${seq}`,
    createdBy: 'fixture',
    createdAt: new Date(),
    contactPhone: contact ? '11 3333-4444' : null,
    contactEmail: contact ? 'contato@suspensa.test' : null,
  });
  await (await repositories(clinic.id)).clinics.create(clinic);
  return clinic;
}

async function setSuspended(clinicId: string, suspended: boolean) {
  const { clinics } = await repositories(clinicId);
  const clinic = (await clinics.findById(clinicId)) as Clinic;
  await clinics.saveStatus(
    suspended
      ? clinic.suspend('dono@vitta.app', new Date())
      : clinic.reactivate('dono@vitta.app', new Date()),
  );
}

/** Conta com senha conhecida; paciente/parceiro vinculados a um cadastro real (#196). */
async function seedAccount(
  clinicId: string,
  role: UserRole,
  email = `${role}-${++seq}@suspensa.test`,
): Promise<UserAccount> {
  const services = await repositories(clinicId);
  let link: { patientId?: string; partnerId?: string } = {};
  if (role === 'patient') {
    const patient = await new CreatePatient(services.patients).execute({
      fullName: 'Paciente Suspensa',
      email,
      phone: '11999990000',
    });
    link = { patientId: patient.id };
  }
  if (role === 'partner') {
    const partner = await new CreatePartner(services.partners).execute({
      fullName: 'Parceiro Suspensa',
      email,
      phone: '11999990000',
    });
    link = { partnerId: partner.id };
  }
  const account = UserAccount.create({
    email,
    passwordHash,
    role,
    clinicId,
    ...link,
  });
  await services.userAccounts.save(account);
  return account;
}

async function login(email: string, password = PASSWORD) {
  ipCounter += 1;
  const route = await import('@/app/api/auth/login/route');
  const response = await route.POST(
    jsonRequest(
      '/api/auth/login',
      'POST',
      { email, password },
      { 'x-forwarded-for': `10.77.0.${ipCounter}` },
    ),
  );
  const body = (await response.json()) as { error: string | null };
  return {
    status: response.status,
    error: body.error,
    cookie: response.cookies.get(SESSION_COOKIE)?.value ?? null,
  };
}

describe('Feature: Login negado em clínica suspensa (B5, Journey 7)', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  it.each(['company_admin', 'atendente', 'profissional'] as const)(
    'Dada conta %s de clínica suspensa, Quando entrar com a senha certa, Então 403 com a mensagem da equipe de clínica suspensa e sem cookie',
    async (role) => {
      const clinic = await newClinic(true);
      const account = await seedAccount(clinic.id, role);
      await setSuspended(clinic.id, true);

      const result = await login(account.email);

      expect(result.status).toBe(403);
      expect(result.error).toBe(STAFF_MESSAGE);
      expect(result.cookie).toBeNull();
    },
  );

  it.each(['patient', 'partner'] as const)(
    'Dada conta %s do portal de clínica suspensa, Quando entrar, Então 403 com o contato da clínica',
    async (role) => {
      const clinic = await newClinic(true);
      const account = await seedAccount(clinic.id, role);
      await setSuspended(clinic.id, true);

      const result = await login(account.email);

      expect(result.status).toBe(403);
      expect(result.error).toBe(PORTAL_MESSAGE);
      expect(result.cookie).toBeNull();
    },
  );

  it('Dada clínica suspensa, Quando a senha errada não revela a suspensão, Então 401 genérico', async () => {
    const clinic = await newClinic(true);
    const account = await seedAccount(clinic.id, 'atendente');
    await setSuspended(clinic.id, true);

    const result = await login(account.email, 'outra-senha-qualquer');

    expect(result.status).toBe(401);
    expect(result.error).toBe('Email ou senha incorretos');
  });

  it('Dado portal de clínica suspensa sem contato, Quando entrar, Então a mensagem da equipe', async () => {
    const clinic = await newClinic(false);
    const account = await seedAccount(clinic.id, 'patient');
    await setSuspended(clinic.id, true);

    const result = await login(account.email);

    expect(result.status).toBe(403);
    expect(result.error).toBe(STAFF_MESSAGE);
  });

  it('Dado o mesmo e-mail em clínica ativa e suspensa, Quando entrar, Então a sessão é da clínica ativa', async () => {
    const active = await newClinic(true);
    const suspended = await newClinic(true);
    const email = `dupla-${++seq}@suspensa.test`;
    await seedAccount(suspended.id, 'atendente', email);
    await seedAccount(active.id, 'atendente', email);
    await setSuspended(suspended.id, true);

    const result = await login(email);

    expect(result.status).toBe(200);
    const session = verifySessionToken(
      process.env.AUTH_SECRET as string,
      result.cookie as string,
    );
    expect(session?.clinicId).toBe(active.id);
  });

  it('Dado login negado, Quando auditar, Então a auditoria do login negado fica na clínica da conta com clinic_suspended', async () => {
    const clinic = await newClinic(true);
    const account = await seedAccount(clinic.id, 'atendente');
    await setSuspended(clinic.id, true);

    await login(account.email);

    const { auditEvents } = await repositories(clinic.id);
    expect(await auditEvents.findAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'read',
          resourceType: 'session',
          detail: 'clinic_suspended',
          actorRole: 'atendente',
          actorId: account.email,
          clinicId: clinic.id,
        }),
      ]),
    );
  });

  it('Dada clínica reativada, Quando entrar, Então reativada entra de novo', async () => {
    const clinic = await newClinic(true);
    const account = await seedAccount(clinic.id, 'atendente');
    await setSuspended(clinic.id, true);
    expect((await login(account.email)).status).toBe(403);

    await setSuspended(clinic.id, false);
    const result = await login(account.email);

    expect(result.status).toBe(200);
    expect(result.cookie).not.toBeNull();
  });
});
