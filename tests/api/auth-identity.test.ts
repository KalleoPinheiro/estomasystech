import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { SidebarIdentityDto } from '@/lib/dto';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

describe('Feature: Identidade de sessão na sidebar (issue #126)', () => {
  const savedAuthSecret = process.env.AUTH_SECRET;
  const savedOpenMode = process.env.VITTA_ALLOW_OPEN_MODE;

  afterEach(() => {
    if (savedAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = savedAuthSecret;
    }
    if (savedOpenMode === undefined) {
      delete process.env.VITTA_ALLOW_OPEN_MODE;
    } else {
      process.env.VITTA_ALLOW_OPEN_MODE = savedOpenMode;
    }
  });

  it('Dada conta de Admin de Empresa numa clínica cadastrada, Quando GET, Então retorna o nome real da clínica e a conta logada', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/auth/identity/route');

    const response = await route.GET(
      jsonRequest(
        '/api/auth/identity',
        'GET',
        undefined,
        cookieHeaderFor('company_admin', 'ana@clinica.com', CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<SidebarIdentityDto>;

    expect(response.status).toBe(200);
    expect(body.data?.clinicLabel).toBe('Clínica B (teste)');
    expect(body.data?.account).toEqual({
      email: 'ana@clinica.com',
      role: 'company_admin',
      roleLabel: 'Admin de Empresa',
    });
  });

  it('Dado super_admin (clinicId null), Quando GET, Então 403: a identidade da equipe é rota da clínica (ADR-007)', async () => {
    const route = await import('@/app/api/auth/identity/route');

    const response = await route.GET(
      jsonRequest(
        '/api/auth/identity',
        'GET',
        undefined,
        cookieHeaderFor('super_admin', 'root@vitta.com', null),
      ),
    );
    const body = (await response.json()) as Envelope<SidebarIdentityDto>;

    expect(response.status).toBe(403);
    expect(body.error).toBe('Seu papel não tem acesso a este recurso');
  });

  it('Dado clinicId sem clínica correspondente no banco, Quando GET, Então clinicLabel é "Clínica não encontrada"', async () => {
    const route = await import('@/app/api/auth/identity/route');

    const response = await route.GET(
      jsonRequest(
        '/api/auth/identity',
        'GET',
        undefined,
        cookieHeaderFor('company_admin', undefined, 'clinica-inexistente'),
      ),
    );
    const body = (await response.json()) as Envelope<SidebarIdentityDto>;

    expect(response.status).toBe(200);
    expect(body.data?.clinicLabel).toBe('Clínica não encontrada');
  });

  it('Dado modo aberto sem sessão real, Quando GET, Então clinicLabel é "Conta de sistema" e account é null', async () => {
    delete process.env.AUTH_SECRET;
    process.env.VITTA_ALLOW_OPEN_MODE = 'true';
    const route = await import('@/app/api/auth/identity/route');

    const response = await route.GET(
      new NextRequest('http://localhost/api/auth/identity', {
        method: 'GET',
      }),
    );
    const body = (await response.json()) as Envelope<SidebarIdentityDto>;

    expect(response.status).toBe(200);
    expect(body.data?.clinicLabel).toBe('Conta de sistema');
    expect(body.data?.account).toBeNull();
  });

  it('Dado sem sessão (modo configurado), Quando GET, Então retorna 401', async () => {
    const route = await import('@/app/api/auth/identity/route');

    const response = await route.GET(
      new NextRequest('http://localhost/api/auth/identity', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('Papel atendente também recebe identidade (rota não é exclusiva de admin)', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/auth/identity/route');

    const response = await route.GET(
      jsonRequest(
        '/api/auth/identity',
        'GET',
        undefined,
        cookieHeaderFor('atendente', 'recepcao@clinica.com', CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<SidebarIdentityDto>;

    expect(response.status).toBe(200);
    expect(body.data?.account?.roleLabel).toBe('Atendente');
  });
});
