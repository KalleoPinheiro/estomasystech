import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requirePortalSession,
  requireStaffSession,
} from '@/lib/auth/require-session';
import { createSessionToken } from '@/lib/auth/session';
import { cookieHeaderFor } from '../support/session';

const request = (headers: Record<string, string> = {}): NextRequest =>
  new NextRequest('http://localhost/api/patients', { headers });

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: string }).error;

describe('Feature: Guarda de sessão nas rotas (camada 2 de autorização)', () => {
  const saved = {
    secret: process.env.AUTH_SECRET,
    password: process.env.AUTH_PASSWORD,
  };

  afterEach(() => {
    process.env.AUTH_SECRET = saved.secret;
    process.env.AUTH_PASSWORD = saved.password;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Cenário: rotas da equipe (requireStaffSession)', () => {
    it('Dada sessão admin válida, Então libera e devolve a sessão', () => {
      const guard = requireStaffSession(
        request(cookieHeaderFor('company_admin', 'maria@clinica.com')),
      );

      expect(guard.ok).toBe(true);
      if (!guard.ok) return;
      expect(guard.session?.subject).toBe('maria@clinica.com');
      expect(guard.session?.role).toBe('company_admin');
    });

    it('Dada sessão admin com clinicId, Então guard expõe o clinicId da sessão', () => {
      const guard = requireStaffSession(
        request(
          cookieHeaderFor('company_admin', 'maria@clinica.com', 'clinic-a'),
        ),
      );

      expect(guard.ok).toBe(true);
      if (!guard.ok) return;
      expect(guard.session?.clinicId).toBe('clinic-a');
    });

    it('Dada sessão admin de papel de sistema (clinicId claim null), Então guard expõe clinicId null', () => {
      const guard = requireStaffSession(
        request(cookieHeaderFor('company_admin', 'sistema@clinica.com', null)),
      );

      expect(guard.ok).toBe(true);
      if (!guard.ok) return;
      expect(guard.session).not.toBeNull();
      expect(guard.session?.clinicId).toBeNull();
    });

    it('Dada requisição sem cookie, Então responde 401', async () => {
      const guard = requireStaffSession(request());

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(401);
      expect(await errorOf(guard.response)).toBe('Não autenticado');
    });

    it.each(['patient', 'partner'] as const)(
      'Dada sessão de %s, Então responde 403 (rota de equipe)',
      async (role) => {
        const guard = requireStaffSession(request(cookieHeaderFor(role)));

        expect(guard.ok).toBe(false);
        if (guard.ok) return;
        expect(guard.response.status).toBe(403);
        expect(await errorOf(guard.response)).toBe(
          'Acesso restrito à equipe da clínica',
        );
      },
    );

    it('Dada sessão de atendente numa rota administrative, Então 403 com mensagem distinta de STAFF_ONLY_MESSAGE (RBAC-16)', async () => {
      const administrativeRequest = new NextRequest(
        'http://localhost/api/reports',
        {
          headers: cookieHeaderFor('atendente', 'atendente@clinica.com'),
        },
      );
      const guard = requireStaffSession(administrativeRequest);

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(403);
      const message = await errorOf(guard.response);
      expect(message).toBe('Seu papel não tem acesso a este recurso');
      expect(message).not.toBe('Acesso restrito à equipe da clínica');
    });

    it('Dado cookie assinado por outro segredo, Então responde 401', () => {
      const token = createSessionToken(
        'outro-segredo',
        Date.now() + 3_600_000,
        'x@y.com',
        'company_admin',
      );
      const forjado = { cookie: `estomasystech_session=${token}` };

      const guard = requireStaffSession(request(forjado));

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(401);
    });

    it('Dado cookie malformado, Então responde 401', () => {
      const forjado = {
        cookie: 'estomasystech_session=payload.assinatura-invalida',
      };

      const guard = requireStaffSession(request(forjado));

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(401);
    });

    it('Dada autenticação não configurada, Então responde 503 (fail-closed)', async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.AUTH_PASSWORD;

      const guard = requireStaffSession(request());

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(503);
      expect(await errorOf(guard.response)).toMatch(
        /Autenticação não configurada/,
      );
    });

    it('Dado ESTOMASYSTECH_ALLOW_OPEN_MODE=true (variável removida, #327), Então segue 503 sem AUTH_SECRET', () => {
      delete process.env.AUTH_SECRET;
      delete process.env.AUTH_PASSWORD;
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ESTOMASYSTECH_ALLOW_OPEN_MODE', 'true');

      const guard = requireStaffSession(request());

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(503);
    });
  });

  describe('Cenário: rotas do portal (requirePortalSession)', () => {
    it('Dada sessão do papel esperado, Então libera com sessão não-nula', () => {
      const guard = requirePortalSession(
        request(cookieHeaderFor('patient', 'ana@paciente.com')),
        'patient',
      );

      expect(guard.ok).toBe(true);
      if (!guard.ok) return;
      expect(guard.session.subject).toBe('ana@paciente.com');
    });

    it('Dada sessão do portal com clinicId, Então guard expõe o clinicId da sessão', () => {
      const guard = requirePortalSession(
        request(cookieHeaderFor('patient', 'ana@paciente.com', 'clinic-a')),
        'patient',
      );

      expect(guard.ok).toBe(true);
      if (!guard.ok) return;
      expect(guard.session.clinicId).toBe('clinic-a');
    });

    it('Dada sessão de outro papel, Então responde 403 com mensagem do portal', async () => {
      const guard = requirePortalSession(
        request(cookieHeaderFor('partner')),
        'patient',
      );

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(403);
      expect(await errorOf(guard.response)).toBe(
        'Rota exclusiva do portal do paciente',
      );
    });

    it('Dada sessão de paciente numa rota de parceiro, Então responde 403', async () => {
      const guard = requirePortalSession(
        request(cookieHeaderFor('patient')),
        'partner',
      );

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(await errorOf(guard.response)).toBe(
        'Rota exclusiva do portal do parceiro',
      );
    });

    it('Dada lista de papéis aceitos, Então qualquer um deles passa', () => {
      const roles = ['company_admin', 'partner', 'patient'] as const;

      for (const role of roles) {
        expect(
          requirePortalSession(request(cookieHeaderFor(role)), roles).ok,
        ).toBe(true);
      }
    });

    it('Dada autenticação não configurada, Então responde 503', () => {
      delete process.env.AUTH_SECRET;
      delete process.env.AUTH_PASSWORD;

      const guard = requirePortalSession(request(), 'patient');

      expect(guard.ok).toBe(false);
      if (guard.ok) return;
      expect(guard.response.status).toBe(503);
    });
  });
});
