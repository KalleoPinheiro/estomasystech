import { describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import { getRepositories } from '@/infrastructure/container';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import type { Session } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  listPlatformAuditFor,
  listPlatformClinicAdmins,
  listPlatformClinics,
  loadPlatformClinicDetail,
} from '@/lib/server/data/platform';
import { validCnpj } from '../../support/cnpj';
import { jsonRequest } from '../../support/request';
import { cookieHeaderFor } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.AUTH_SECRET = 'segredo-do-teste-dos-dados-da-plataforma';

const OPERATOR = 'dono@estomasystech.app';
const COOKIE = cookieHeaderFor('super_admin', OPERATOR, null);
const operator = {
  role: 'super_admin',
  subject: OPERATOR,
  clinicId: null,
  professionalId: null,
} as unknown as Session;

interface RouteBody {
  data: unknown;
  meta?: { nextCursor: string | null };
}

const body = async (response: Response) => (await response.json()) as RouteBody;
const get = (path: string) => jsonRequest(path, 'GET', undefined, COOKIE);
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

const routeClinics = async () =>
  body(
    await (await import('@/app/api/platform/clinics/route')).GET(
      get('/api/platform/clinics'),
    ),
  );
const routeDetail = async (id: string) =>
  body(
    await (await import('@/app/api/platform/clinics/[id]/route')).GET(
      get(`/api/platform/clinics/${id}`),
      idParams(id),
    ),
  );
const routeAdmins = async (id: string) =>
  body(
    await (await import('@/app/api/platform/clinics/[id]/admins/route')).GET(
      get(`/api/platform/clinics/${id}/admins`),
      idParams(id),
    ),
  );
const routeAudit = async (query: string) =>
  body(
    await (await import('@/app/api/platform/audit/route')).GET(
      get(`/api/platform/audit${query}`),
    ),
  );

const freshClinic = async (name: string, seq: number) => {
  const clinic = Clinic.create({
    name,
    cnpj: validCnpj(String(seq + 40).padStart(12, '0')),
    contactPhone: '11 3333-4444',
    contactEmail: `contato-${seq}@plataforma.test`,
    createdBy: 'test',
  });
  await (await getRepositories(systemScope())).clinics.create(clinic);
  return clinic;
};

const platformEvent = (clinicId: string | null, resourceId: string) =>
  AuditEvent.create({
    clinicId,
    actorRole: 'super_admin',
    actorId: OPERATOR,
    action: 'update',
    resourceType: 'clinic-info',
    resourceId,
  });

describe('Feature: dados da plataforma lidos no servidor (#558)', () => {
  it('Dadas clínicas fora de ordem, Quando lista, Então vêm por nome e iguais à resposta da rota', async () => {
    await freshClinic('Zeta Clínica', 1);
    await freshClinic('Alfa Clínica', 2);

    const rows = await listPlatformClinics(operator);

    const names = rows.map((row) => row.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );
    expect(names).toEqual(
      expect.arrayContaining(['Alfa Clínica', 'Zeta Clínica']),
    );
    expect(rows[0]).toMatchObject({ adminStatus: 'none' });
    expect(JSON.parse(JSON.stringify(rows))).toEqual(
      (await routeClinics()).data,
    );
  });

  it('Dada uma clínica, Quando lê o detalhe, Então é a resposta da rota; id que não existe dá null', async () => {
    const clinic = await freshClinic('Detalhe Clínica', 3);

    const detail = await loadPlatformClinicDetail(clinic.id);

    expect(detail).toMatchObject({ id: clinic.id, name: 'Detalhe Clínica' });
    expect(JSON.parse(JSON.stringify(detail))).toEqual(
      (await routeDetail(clinic.id)).data,
    );
    expect(await loadPlatformClinicDetail('clinica-que-nao-existe')).toBeNull();
  });

  it('Dada uma clínica com Admin, Quando lista os Admins, Então é a resposta da rota; clínica que não existe dá null', async () => {
    const clinic = await freshClinic('Admins Clínica', 5);
    await (await getRepositories(clinicScope(clinic.id))).userAccounts.save(
      UserAccount.create({
        email: 'admin@admins.test',
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'company_admin',
        clinicId: clinic.id,
      }),
    );

    const admins = await listPlatformClinicAdmins(clinic.id);

    expect(admins).toHaveLength(1);
    expect(admins?.[0]).toMatchObject({ email: 'admin@admins.test' });
    expect(JSON.parse(JSON.stringify(admins))).toEqual(
      (await routeAdmins(clinic.id)).data,
    );
    expect(await listPlatformClinicAdmins('clinica-que-nao-existe')).toBeNull();
  });

  it('Dados eventos de plataforma e de clínica, Quando lê a trilha, Então traz o nome da clínica e só dá cursor com a página cheia', async () => {
    const clinic = await freshClinic('Trilha Clínica', 4);
    const audit = (await getRepositories(clinicScope(clinic.id))).auditEvents;
    await audit.save(platformEvent(clinic.id, 'na-clinica'));
    await (await getRepositories(systemScope())).auditEvents.save(
      platformEvent(null, 'da-plataforma'),
    );

    const full = await listPlatformAuditFor(operator, { limit: 500 });
    const small = await listPlatformAuditFor(operator, { limit: 1 });

    const inClinic = full.events.find((e) => e.resourceId === 'na-clinica');
    const onPlatform = full.events.find(
      (e) => e.resourceId === 'da-plataforma',
    );
    expect(inClinic?.clinicName).toBe('Trilha Clínica');
    expect(onPlatform).toMatchObject({ clinicId: null, clinicName: null });
    expect(full.nextCursor).toBeNull();
    expect(small.events).toHaveLength(1);
    expect(small.nextCursor).toEqual(expect.any(String));
    const next = await listPlatformAuditFor(operator, {
      limit: 1,
      cursor: small.nextCursor ?? undefined,
    });
    expect(next.events[0].id).not.toBe(small.events[0].id);
    const routed = await routeAudit('?limit=500');
    expect(JSON.parse(JSON.stringify(full.events))).toEqual(routed.data);
    expect(routed.meta?.nextCursor).toBeNull();
  });

  it('Dado um período, Quando lê a trilha, Então só entram eventos dentro dele', async () => {
    const future = new Date(Date.now() + 86_400_000);

    const page = await listPlatformAuditFor(operator, {
      limit: 500,
      from: future,
    });

    expect(page.events).toEqual([]);
  });
});
