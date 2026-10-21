import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const as = (
  role: 'company_admin' | 'atendente' | 'profissional' | 'super_admin',
  clinicId: string | null = CLINIC_A_ID,
) => cookieHeaderFor(role, `${role}-tema@a.test`, clinicId);

const route = () => import('@/app/api/settings/clinic-identity/route');
const put = async (body: unknown, headers: Record<string, string>) =>
  (await route()).PUT(
    jsonRequest('/api/settings/clinic-identity', 'PUT', body, headers),
  );
const envelope = async <T>(r: Response) => (await r.json()) as Envelope<T>;

beforeAll(ensureTestClinics);

describe('Feature: Tema da clínica pela API (#426)', () => {
  it('Dado o Admin, Quando escolher escuro e menta, Então grava, responde a escolha e audita', async () => {
    const response = await put(
      { mode: 'dark', accent: 'mint' },
      as('company_admin'),
    );

    expect(response.status).toBe(200);
    expect((await envelope<{ theme: unknown }>(response)).data.theme).toEqual({
      mode: 'dark',
      accent: 'mint',
    });
    const { clinics, auditEvents } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    expect((await clinics.findById(CLINIC_A_ID))?.theme).toEqual({
      mode: 'dark',
      accent: 'mint',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const events = await auditEvents.findAll({ resourceType: 'clinic-theme' });
    expect(events.map((e) => e.detail)).toContain('modo dark, cor mint');
  });

  it.each([
    ['atendente' as const],
    ['profissional' as const],
    ['super_admin' as const],
  ])(
    'Dado %s, Quando tentar trocar o tema, Então 403 e nada muda',
    async (role) => {
      const response = await put(
        { mode: 'light', accent: 'amber' },
        as(role, role === 'super_admin' ? null : CLINIC_A_ID),
      );

      expect(response.status).toBe(403);
      const { clinics } = await getRepositories(clinicScope(CLINIC_A_ID));
      expect((await clinics.findById(CLINIC_A_ID))?.theme.accent).toBe('mint');
    },
  );

  it('Dado visitante sem sessão, Quando tentar trocar o tema, Então 401', async () => {
    const response = await (await route()).PUT(
      jsonRequest(
        '/api/settings/clinic-identity',
        'PUT',
        { mode: 'light', accent: 'cyan' },
        { cookie: '' },
      ),
    );

    expect(response.status).toBe(401);
  });

  it.each([
    [{ mode: 'light', accent: '#ff0000' }, 'Cor do tema inválida'],
    [{ mode: 'auto', accent: 'cyan' }, 'Modo do tema inválido'],
    [{ accent: 'cyan' }, 'Modo do tema inválido'],
    [{ mode: 'light' }, 'Cor do tema inválida'],
  ])(
    'Dada a escolha %j, Quando o Admin enviar, Então 400 com "%s"',
    async (body, message) => {
      const response = await put(body, as('company_admin'));

      expect(response.status).toBe(400);
      expect((await envelope<null>(response)).error).toContain(message);
    },
  );

  it('Dado o Admin da clínica B, Quando trocar o tema, Então a clínica A não é afetada', async () => {
    await put(
      { mode: 'light', accent: 'amber' },
      as('company_admin', CLINIC_B_ID),
    );

    const a = await getRepositories(clinicScope(CLINIC_A_ID));
    const b = await getRepositories(clinicScope(CLINIC_B_ID));
    expect((await a.clinics.findById(CLINIC_A_ID))?.theme).toEqual({
      mode: 'dark',
      accent: 'mint',
    });
    expect((await b.clinics.findById(CLINIC_B_ID))?.theme).toEqual({
      mode: 'light',
      accent: 'amber',
    });
  });

  describe('Cenário: leitura do tema', () => {
    it('Dado o Admin, Quando consultar Configurações, Então o tema vem em identity.theme', async () => {
      const response = await (
        await import('@/app/api/settings/clinic-info/route')
      ).GET(
        jsonRequest(
          '/api/settings/clinic-info',
          'GET',
          undefined,
          as('company_admin'),
        ),
      );

      const body = await envelope<{ identity: { theme: unknown } }>(response);
      expect(body.data.identity.theme).toEqual({
        mode: 'dark',
        accent: 'mint',
      });
    });

    it('Dada qualquer pessoa da equipe, Quando consultar a identidade do menu, Então vê o tema da clínica', async () => {
      const response = await (
        await import('@/app/api/auth/identity/route')
      ).GET(
        jsonRequest('/api/auth/identity', 'GET', undefined, as('atendente')),
      );

      expect(
        (await envelope<{ clinicTheme: unknown }>(response)).data.clinicTheme,
      ).toEqual({ mode: 'dark', accent: 'mint' });
    });

    it('Dada clínica no padrão, Quando consultar a identidade do menu, Então a chave não aparece', async () => {
      await put({ mode: 'system', accent: 'violet' }, as('company_admin'));

      const response = await (
        await import('@/app/api/auth/identity/route')
      ).GET(
        jsonRequest('/api/auth/identity', 'GET', undefined, as('atendente')),
      );

      expect(
        (await envelope<Record<string, unknown>>(response)).data,
      ).not.toHaveProperty('clinicTheme');
    });
  });
});
