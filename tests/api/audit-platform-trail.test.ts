import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { totpCode, totpStep } from '@/domain/auth/totp';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import { hashPassword } from '@/lib/auth/password';
import {
  clinicScope,
  sessionScope,
  systemScope,
} from '@/lib/auth/tenant-scope';
import type { AuditEventDto, PlatformAuditEventDto } from '@/lib/dto';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.AUTH_SECRET = 'segredo-do-teste-da-trilha-de-plataforma';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const OPERATOR = 'dono@vitta.app';
const OPERATOR_PASSWORD = 'senha-do-operador';
const SUPER_ADMIN = cookieHeaderFor('super_admin', OPERATOR, null);

const services = async (clinicId: string | null) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(
    clinicId === null ? systemScope() : clinicScope(clinicId),
  );
};

let seq = 0;
const freshClinic = async (): Promise<Clinic> => {
  seq += 1;
  const clinic = Clinic.create({
    name: `Clínica trilha ${seq}`,
    cnpj: `${String(seq + 70).padStart(12, '0')}${String(seq % 100).padStart(2, '0')}`,
    contactPhone: '11 3333-4444',
    contactEmail: `contato-${seq}@trilha.test`,
    createdBy: 'test',
  });
  await (await services(null)).clinics.create(clinic);
  return clinic;
};

const adminOf = (clinicId: string) =>
  cookieHeaderFor('company_admin', `admin@${clinicId}.test`, clinicId);

let ip = 0;
const fromNewIp = () => {
  ip += 1;
  return { 'x-forwarded-for': `10.88.${Math.floor(ip / 250)}.${ip % 250}` };
};

async function clinicTrail(cookie: Record<string, string>) {
  const route = await import('@/app/api/audit/route');
  const response = await route.GET(
    jsonRequest('/api/audit?limit=500', 'GET', undefined, cookie),
  );
  return ((await response.json()) as Envelope<AuditEventDto[]>).data;
}

async function platformTrail(
  query = '',
  cookie: Record<string, string> = SUPER_ADMIN,
) {
  const route = await import('@/app/api/platform/audit/route');
  const response = await route.GET(
    jsonRequest(`/api/platform/audit${query}`, 'GET', undefined, cookie),
  );
  return {
    response,
    json: (await response.json()) as Envelope<PlatformAuditEventDto[]>,
  };
}

const allPlatform = async () => (await platformTrail('?limit=500')).json.data;

async function login(email: string, password: string) {
  const route = await import('@/app/api/auth/login/route');
  const response = await route.POST(
    new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json', ...fromNewIp() },
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as Envelope<{ pendingToken: string }>,
  };
}

let clinicX: Clinic;
let clinicY: Clinic;

beforeAll(async () => {
  clinicX = await freshClinic();
  clinicY = await freshClinic();
  await (await services(null)).userAccounts.save(
    UserAccount.create({
      email: OPERATOR,
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      role: 'super_admin',
      clinicId: null,
    }),
  );
});

describe('Feature: Trilha de plataforma e trilha da clínica (B6, #210)', () => {
  it('Dado o container, Quando pedir a auditoria de uma clínica, Então o container escopa a auditoria: eventos da outra clínica não aparecem', async () => {
    const inY = AuditEvent.create({
      clinicId: clinicY.id,
      actorRole: 'company_admin',
      actorId: 'y@y.test',
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: 'container-y',
    });
    await (await services(clinicY.id)).auditEvents.save(inY);

    const seenFromX = await (await services(clinicX.id)).auditEvents.findAll();
    const seenFromY = await (await services(clinicY.id)).auditEvents.findAll();

    expect(seenFromX.map((e) => e.id)).not.toContain(inY.id);
    expect(seenFromY.map((e) => e.id)).toContain(inY.id);
  });

  it('Dado conta da clínica X, Quando login falho com a senha errada, Então o evento é de plataforma: nenhum admin vê, o super_admin vê', async () => {
    const email = 'login-falho@x.test';
    await (await services(clinicX.id)).userAccounts.save(
      UserAccount.create({
        email,
        passwordHash: await hashPassword('senha-certa-da-conta'),
        role: 'atendente',
        clinicId: clinicX.id,
      }),
    );

    const attempt = await login(email, 'senha-errada');
    expect(attempt.status).toBe(401);

    const isAttempt = (e: { actorId: string; resourceType: string }) =>
      e.resourceType === 'session' && e.actorId === email;
    expect((await clinicTrail(adminOf(clinicX.id))).filter(isAttempt)).toEqual(
      [],
    );
    expect(
      (await clinicTrail(adminOf('legacy-clinic'))).filter(isAttempt),
    ).toEqual([]);
    expect((await allPlatform()).filter(isAttempt)).toEqual([
      expect.objectContaining({
        clinicId: null,
        clinicName: null,
        actorRole: 'anonymous',
        detail: 'invalid_credentials',
      }),
    ]);
  });

  it('Dado o super_admin, Quando errar o código do segundo fator, Então o evento fica só na trilha de plataforma', async () => {
    const started = await login(OPERATOR, OPERATOR_PASSWORD);
    expect(started.status).toBe(200);
    const enrollRoute = await import('@/app/api/auth/mfa/enroll/route');
    const enrolled = await enrollRoute.POST(
      new NextRequest('http://localhost/api/auth/mfa/enroll', {
        method: 'POST',
        body: JSON.stringify({ pendingToken: started.body.data.pendingToken }),
        headers: { 'Content-Type': 'application/json', ...fromNewIp() },
      }),
    );
    const { pendingToken, secret } = (
      (await enrolled.json()) as Envelope<{
        pendingToken: string;
        secret: string;
      }>
    ).data;
    // Código fora da janela ±1: nunca coincide com o certo.
    const step = totpStep(Date.now());
    const valid = [-1, 0, 1].map((d) => totpCode(secret, step + d));
    const code = ['000000', '111111', '222222', '333333'].find(
      (candidate) => !valid.includes(candidate),
    );
    const verify = await import('@/app/api/auth/mfa/verify/route');
    const wrong = await verify.POST(
      new NextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ pendingToken, code }),
        headers: { 'Content-Type': 'application/json', ...fromNewIp() },
      }),
    );
    expect(wrong.status).toBe(401);

    const mfaEvents = (await allPlatform()).filter(
      (e) => e.detail === 'mfa_invalid_code',
    );
    expect(mfaEvents).toEqual([
      expect.objectContaining({ clinicId: null, actorRole: 'super_admin' }),
    ]);
    for (const clinic of [clinicX.id, clinicY.id, 'legacy-clinic']) {
      expect(
        (await clinicTrail(adminOf(clinic))).filter(
          (e) => e.detail === 'mfa_invalid_code',
        ),
      ).toEqual([]);
    }
  });

  it('Dado o super_admin, Quando importar o catálogo de taxonomia, Então o evento fica só na trilha de plataforma', async () => {
    const route = await import('@/app/api/platform/taxonomy/import/route');
    const response = await route.POST(
      jsonRequest('/api/platform/taxonomy/import', 'POST', {}, SUPER_ADMIN),
    );
    expect(response.status).toBe(200);

    await vi.waitFor(async () => {
      expect(
        (await allPlatform()).filter(
          (e) => e.resourceType === 'taxonomy_catalog',
        ),
      ).toEqual([
        expect.objectContaining({ clinicId: null, actorRole: 'super_admin' }),
      ]);
    });
    expect(
      (await clinicTrail(adminOf('legacy-clinic'))).filter(
        (e) => e.resourceType === 'taxonomy_catalog',
      ),
    ).toEqual([]);
  });

  it('Dada ação do super_admin numa clínica, Quando ler as trilhas, Então aparece na da clínica e na de plataforma, não na de outra clínica', async () => {
    const route = await import('@/app/api/platform/clinics/[id]/route');
    const response = await route.PATCH(
      jsonRequest(
        `/api/platform/clinics/${clinicX.id}`,
        'PATCH',
        { city: 'Campinas' },
        SUPER_ADMIN,
      ),
      { params: Promise.resolve({ id: clinicX.id }) },
    );
    expect(response.status).toBe(200);

    const isEdit = (e: { resourceType: string; resourceId: string }) =>
      e.resourceType === 'clinic-info' && e.resourceId === clinicX.id;
    await vi.waitFor(async () => {
      expect((await clinicTrail(adminOf(clinicX.id))).filter(isEdit)).toEqual([
        expect.objectContaining({
          actorRole: 'super_admin',
          actorId: OPERATOR,
        }),
      ]);
    });
    expect((await allPlatform()).filter(isEdit)).toEqual([
      expect.objectContaining({
        clinicId: clinicX.id,
        clinicName: clinicX.name,
        actorRole: 'super_admin',
      }),
    ]);
    expect((await clinicTrail(adminOf(clinicY.id))).filter(isEdit)).toEqual([]);
  });

  it('Dados eventos de papéis da clínica e de plataforma, Quando ler a trilha, Então o formato da trilha: só plataforma, com clínica, sem paciente, mais novo primeiro', async () => {
    const byAdmin = AuditEvent.create({
      clinicId: clinicY.id,
      actorRole: 'company_admin',
      actorId: 'admin-y@y.test',
      action: 'create',
      resourceType: 'patient',
      resourceId: 'formato-paciente',
      patientId: 'formato-paciente',
    });
    await (await services(clinicY.id)).auditEvents.save(byAdmin);

    const trail = await allPlatform();

    expect(trail.map((e) => e.id)).not.toContain(byAdmin.id);
    expect(
      trail.every((e) => e.clinicId === null || e.actorRole === 'super_admin'),
    ).toBe(true);
    for (const row of trail) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'clinicId',
          'clinicName',
          'actorRole',
          'actorId',
          'action',
          'resourceType',
          'resourceId',
          'detail',
          'occurredAt',
        ].sort(),
      );
    }
    const times = trail.map((e) => Date.parse(e.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('Dada a trilha de plataforma, Quando usar filtros e paginação, Então from/to filtram, limit/offset paginam e limite fora de 1..500 é 400', async () => {
    const { auditEvents } = await services(null);
    const at = (iso: string) =>
      AuditEvent.restore({
        id: `periodo-${iso}`,
        clinicId: null,
        actorRole: 'anonymous',
        actorId: 'periodo@x.test',
        action: 'read',
        resourceType: 'session',
        resourceId: 'periodo@x.test',
        patientId: null,
        detail: null,
        occurredAt: new Date(iso),
      });
    for (const iso of [
      '2020-01-01T10:00:00.000Z',
      '2020-01-02T10:00:00.000Z',
      '2020-01-03T10:00:00.000Z',
    ]) {
      await auditEvents.save(at(iso));
    }

    const window = await platformTrail(
      '?from=2020-01-02T00:00:00.000Z&to=2020-01-03T00:00:00.000Z',
    );
    expect(window.json.data.map((e) => e.id)).toEqual([
      'periodo-2020-01-02T10:00:00.000Z',
    ]);
    const old = '&to=2020-01-04T00:00:00.000Z';
    const page = await platformTrail(`?limit=1&offset=1${old}`);
    expect(page.json.data.map((e) => e.id)).toEqual([
      'periodo-2020-01-02T10:00:00.000Z',
    ]);
    expect((await platformTrail('?limit=0')).response.status).toBe(400);
    expect((await platformTrail('?limit=501')).response.status).toBe(400);
  });

  it('Dada a trilha de plataforma, Quando pedida por Admin de Empresa ou sem sessão, Então só o super_admin: 403 e 401', async () => {
    const asAdmin = await platformTrail('', adminOf(clinicX.id));
    expect(asAdmin.response.status).toBe(403);
    expect(asAdmin.json.error).toBe('Seu papel não tem acesso a este recurso');

    const route = await import('@/app/api/platform/audit/route');
    const anonymous = await route.GET(
      new NextRequest('http://localhost/api/platform/audit'),
    );
    expect(anonymous.status).toBe(401);
  });

  it('Dada sessão de empresa, Quando montar o escopo de leitura, Então sessionScope não é o de sistema (a trilha de plataforma exige sessão sem empresa)', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { auditEvents } = await getRepositories(
      sessionScope({ clinicId: clinicX.id }),
    );
    await expect(auditEvents.findPlatformTrail()).rejects.toThrow(
      'Trilha de plataforma exige escopo de sistema',
    );
  });
});
