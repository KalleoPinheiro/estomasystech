import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAllowedForRole,
  isPublicPath,
  isSharedPath,
  PUBLIC_PATHS,
  resolveAuthMode,
  SHARED_PATH_PREFIXES,
} from '@/lib/auth/access-policy';

const AUTH_ENV_KEYS = [
  'AUTH_SECRET',
  'AUTH_PASSWORD',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APP_URL',
  'GOOGLE_ALLOWED_EMAILS',
  'ESTOMASYSTECH_ALLOW_OPEN_MODE',
] as const;

describe('Feature: Política de acesso compartilhada entre proxy e rotas', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Cenário: allowlist de caminhos públicos', () => {
    it.each(PUBLIC_PATHS)(
      'Dado o caminho público %s, Então dispensa sessão',
      (path) => {
        expect(isPublicPath(path)).toBe(true);
      },
    );

    it('Dado um caminho que apenas começa com um público, Então NÃO é público (match exato)', () => {
      expect(isPublicPath('/api/auth/login/roubado')).toBe(false);
      expect(isPublicPath('/login-falso')).toBe(false);
    });

    it('Dada uma rota de equipe, Então não está na allowlist', () => {
      expect(isPublicPath('/api/patients')).toBe(false);
    });
  });

  describe('Cenário: papéis e caminhos compartilhados', () => {
    it('Dado o papel admin, Então acessa qualquer caminho', () => {
      expect(isAllowedForRole('/api/patients', 'company_admin')).toBe(true);
      expect(isAllowedForRole('/api/portal/patient', 'company_admin')).toBe(
        true,
      );
    });

    it.each(['patient', 'partner'] as const)(
      'Dado o papel %s, Então é barrado nas rotas de equipe',
      (role) => {
        expect(isAllowedForRole('/api/patients', role)).toBe(false);
        expect(isAllowedForRole('/agenda', role)).toBe(false);
      },
    );

    it.each(['patient', 'partner'] as const)(
      'Dado o papel %s, Então acessa portal e logout',
      (role) => {
        expect(isAllowedForRole('/portal', role)).toBe(true);
        expect(isAllowedForRole('/api/portal/patient/photos', role)).toBe(true);
        expect(isAllowedForRole('/api/auth/logout', role)).toBe(true);
      },
    );

    it('Dado um caminho que só tem o prefixo compartilhado no nome, Então não é compartilhado', () => {
      expect(isSharedPath('/portal-interno')).toBe(false);
      expect(isSharedPath('/api/portalzinho')).toBe(false);
    });

    it.each(SHARED_PATH_PREFIXES)(
      'Dado o prefixo %s exato, Então é compartilhado',
      (prefix) => {
        expect(isSharedPath(prefix)).toBe(true);
      },
    );
  });

  describe('Cenário: modo de autenticação', () => {
    it("Dado AUTH_SECRET definido, Então o modo é 'configured'", () => {
      process.env.AUTH_SECRET = 'segredo-de-teste';

      expect(resolveAuthMode()).toBe('configured');
    });

    it("Dado AUTH_SECRET e nenhuma variável do Google, Então o modo continua 'configured'", () => {
      process.env.AUTH_SECRET = 'segredo-de-teste';
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_ALLOWED_EMAILS;

      expect(resolveAuthMode()).toBe('configured');
    });

    it("Dado NODE_ENV=production sem autenticação, Então o modo é 'unconfigured'", () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(resolveAuthMode()).toBe('unconfigured');
    });

    it.each(['production', 'development', 'test'])(
      "Dado NODE_ENV=%s COM ESTOMASYSTECH_ALLOW_OPEN_MODE=true (variável removida, #327), Então segue 'unconfigured'",
      (nodeEnv) => {
        vi.stubEnv('NODE_ENV', nodeEnv);
        process.env.ESTOMASYSTECH_ALLOW_OPEN_MODE = 'true';

        expect(resolveAuthMode()).toBe('unconfigured');
      },
    );

    it("Dado desenvolvimento sem autenticação, Então é 'unconfigured' (fail-closed)", () => {
      vi.stubEnv('NODE_ENV', 'development');

      expect(resolveAuthMode()).toBe('unconfigured');
    });
  });
});
