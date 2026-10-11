import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { PUBLIC_PATHS } from '@/lib/auth/access-policy';
import { classifyRoute } from '@/lib/auth/route-family';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

/**
 * Rede de proteção contra a lacuna descrita na Issue #4: "é fácil esquecer uma
 * rota nova no futuro".
 *
 * Em vez de uma lista fixa que envelhece, o teste VARRE `src/app/api` e exige
 * que todo handler exportado se recuse a executar sem sessão. Uma rota criada
 * amanhã sem `requireStaffSession`/`requirePortalSession` quebra o build aqui,
 * mesmo que o proxy da borda esteja correto.
 *
 * Como a guarda roda antes de qualquer I/O, nenhum caso precisa do banco.
 */

const API_ROOT = path.join(process.cwd(), 'src/app/api');
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Rotas legitimamente sem guarda de sessão — precisam ser alcançáveis por quem
 * ainda não tem sessão (login/OAuth) ou autenticam por outro fator. Espelha a
 * `PUBLIC_PATHS` do access-policy; a divergência entre as duas é testada abaixo.
 */
const UNGUARDED_PREFIXES = [
  'api/auth/',
  'api/reminders/run',
  'api/retention/run',
] as const;

interface RouteFile {
  /** Caminho relativo a `src/app`, ex.: `api/patients/[id]/route.ts`. */
  relative: string;
  /** Especificador de import, ex.: `@/app/api/patients/[id]/route`. */
  specifier: string;
  /** Pathname HTTP com os segmentos dinâmicos resolvidos, ex.: `/api/patients/x`. */
  pathname: string;
  isUnguarded: boolean;
  isPortal: boolean;
}

function collectRouteFiles(dir: string, acc: RouteFile[] = []): RouteFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRouteFiles(full, acc);
      continue;
    }
    if (entry.name !== 'route.ts') continue;

    const relative = path
      .relative(path.join(process.cwd(), 'src/app'), full)
      .split(path.sep)
      .join('/');
    const withoutFile = relative.replace(/\/route\.ts$/, '');
    acc.push({
      relative,
      specifier: `@/app/${withoutFile}/route`,
      pathname: `/${withoutFile}`.replace(/\[[^\]]+\]/g, 'x'),
      isUnguarded: UNGUARDED_PREFIXES.some((prefix) =>
        withoutFile.startsWith(prefix),
      ),
      isPortal: withoutFile.startsWith('api/portal'),
    });
  }
  return acc;
}

const routeFiles = collectRouteFiles(API_ROOT).sort((a, b) =>
  a.relative.localeCompare(b.relative),
);

/** Contexto genérico: cobre `[id]`, `[code]` e `[carePlanId]` de uma vez. */
const anyContext = () => ({
  params: Promise.resolve({ id: 'x', code: 'x', carePlanId: 'x' }),
});

const requestFor = (
  pathname: string,
  method: HttpMethod,
  headers: Record<string, string> = {},
) =>
  new NextRequest(`http://localhost${pathname}`, {
    method,
    body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    headers: { 'Content-Type': 'application/json', ...headers },
  });

type Handler = (
  request: NextRequest,
  context: ReturnType<typeof anyContext>,
) => Promise<Response>;

async function loadHandlers(
  file: RouteFile,
): Promise<Array<[HttpMethod, Handler]>> {
  const mod = (await import(file.specifier)) as Record<string, unknown>;
  return HTTP_METHODS.filter((m) => typeof mod[m] === 'function').map((m) => [
    m,
    mod[m] as Handler,
  ]);
}

const SRC_ROOT = path.join(process.cwd(), 'src');

/** Varredura textual de `src/**` — devolve os arquivos que citam o termo. */
function sourceFilesMentioning(term: string, dir: string = SRC_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFilesMentioning(term, full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    if (readFileSync(full, 'utf8').includes(term)) {
      found.push(path.relative(SRC_ROOT, full));
    }
  }
  return found.sort();
}

describe('Feature: Conformidade das guardas de rota', () => {
  it('Dado o diretório de rotas, Quando varrer, Então encontra os arquivos de rota', () => {
    expect(routeFiles.length).toBeGreaterThan(50);
  });

  describe('Cenário: allowlist do teste e do access-policy não divergem', () => {
    it('Dado as rotas sem guarda, Quando comparar com PUBLIC_PATHS, Então toda pública está coberta', () => {
      const publicApiPaths = PUBLIC_PATHS.filter((p) => p.startsWith('/api/'));

      for (const publicPath of publicApiPaths) {
        const asRelative = publicPath.slice(1);
        expect(
          UNGUARDED_PREFIXES.some((prefix) => asRelative.startsWith(prefix)),
          `${publicPath} é público no access-policy mas não está na allowlist deste teste`,
        ).toBe(true);
      }
    });

    it('Dado a allowlist deste teste, Quando conferir, Então só cobre auth e os crons de lembretes e de retenção', () => {
      expect([...UNGUARDED_PREFIXES]).toEqual([
        'api/auth/',
        'api/reminders/run',
        'api/retention/run',
      ]);
    });
  });

  /**
   * AUTH-21 / AUTH-22: o login por Google e a allowlist de e-mails foram
   * removidos (ADR-004). Estas checagens são estruturais de propósito — uma
   * rota ou uma leitura de env que ressuscitasse quebraria o build aqui, mesmo
   * que nenhum teste de comportamento a exercitasse.
   */
  describe('Cenário: o caminho de autenticação por Google não existe mais', () => {
    it('Dado a varredura de rotas, Quando procurar handlers sob api/auth/google, Então não existe nenhum', () => {
      const googleRoutes = routeFiles.filter((file) =>
        file.relative.startsWith('api/auth/google'),
      );

      expect(
        googleRoutes.map((file) => file.relative),
        'login por Google foi removido na issue #21 (ADR-004) — nenhuma rota deve reaparecer sob api/auth/google',
      ).toEqual([]);
    });

    it('Dado o código-fonte da aplicação, Quando procurar GOOGLE_ALLOWED_EMAILS, Então não há nenhuma leitura', () => {
      expect(sourceFilesMentioning('GOOGLE_ALLOWED_EMAILS')).toEqual([]);
    });

    it('Dado PUBLIC_PATHS, Quando conferir, Então nenhuma rota de Google segue liberada', () => {
      expect(PUBLIC_PATHS.filter((p) => p.includes('google'))).toEqual([]);
    });

    /** AUTH-23: a senha mestre deixou de existir junto com o login por Google. */
    it('Dado o código-fonte da aplicação, Quando procurar AUTH_PASSWORD, Então não há nenhuma leitura', () => {
      expect(sourceFilesMentioning('AUTH_PASSWORD')).toEqual([]);
    });
  });

  describe('Cenário: rota nova nasce protegida', () => {
    const guarded = routeFiles.filter((f) => !f.isUnguarded);

    it.each(guarded.map((f) => [f.relative, f] as const))(
      'Dado %s sem cookie de sessão, Quando chamar cada handler, Então responde 401',
      async (_relative, file) => {
        const handlers = await loadHandlers(file);
        expect(handlers.length).toBeGreaterThan(0);

        for (const [method, handler] of handlers) {
          const response = await handler(
            requestFor(file.pathname, method),
            anyContext(),
          );
          expect(
            response.status,
            `${method} ${file.pathname} deveria exigir sessão (recebido ${response.status})`,
          ).toBe(401);
        }
      },
    );

    it.each(
      guarded.filter((f) => !f.isPortal).map((f) => [f.relative, f] as const),
    )(
      'Dado %s com sessão de paciente, Quando chamar cada handler, Então responde 403',
      async (_relative, file) => {
        const headers = cookieHeaderFor('patient', 'paciente@example.com');
        const handlers = await loadHandlers(file);

        for (const [method, handler] of handlers) {
          const response = await handler(
            requestFor(file.pathname, method, headers),
            anyContext(),
          );
          expect(
            response.status,
            `${method} ${file.pathname} deveria ser exclusivo da equipe (recebido ${response.status})`,
          ).toBe(403);
          const body = (await response.json()) as { error: string };
          expect(body.error, `${method} ${file.pathname}`).toBe(
            'Acesso restrito à equipe da clínica',
          );
        }
      },
    );

    it.each(
      guarded.filter((f) => !f.isPortal).map((f) => [f.relative, f] as const),
    )(
      'Dado %s com sessão de parceiro, Quando chamar cada handler, Então responde 403',
      async (_relative, file) => {
        const headers = cookieHeaderFor('partner', 'parceiro@example.com');
        const handlers = await loadHandlers(file);

        for (const [method, handler] of handlers) {
          const response = await handler(
            requestFor(file.pathname, method, headers),
            anyContext(),
          );
          expect(
            response.status,
            `${method} ${file.pathname} deveria ser exclusivo da equipe (recebido ${response.status})`,
          ).toBe(403);
          const body = (await response.json()) as { error: string };
          expect(body.error, `${method} ${file.pathname}`).toBe(
            'Acesso restrito à equipe da clínica',
          );
        }
      },
    );
  });

  describe('Cenário: 6 papéis × família de rota (RBAC-05/RBAC-06)', () => {
    const staffGuarded = routeFiles.filter(
      (f) => !f.isUnguarded && !f.isPortal,
    );

    /**
     * Famílias que a matriz de `route-family.ts` nega a cada papel de equipe —
     * Atendente: clinical/administrative/professional_self; Profissional:
     * administrative (o escopo fino do R4 é testado à parte). A família
     * `platform` é só do super_admin, que por sua vez não entra em nenhuma
     * família da clínica (ADR-007).
     */
    const DENIED_FAMILIES = {
      super_admin: new Set([
        'clinical',
        'operational',
        'administrative',
        'professional_self',
      ]),
      company_admin: new Set(['platform']),
      atendente: new Set([
        'clinical',
        'administrative',
        'professional_self',
        'platform',
      ]),
      profissional: new Set(['administrative', 'platform']),
    } as const;

    /** O super_admin não tem clínica: a sessão dele nasce com `clinicId` nulo. */
    const headersFor = (role: keyof typeof DENIED_FAMILIES) =>
      cookieHeaderFor(
        role,
        `${role}@example.com`,
        role === 'super_admin' ? null : undefined,
      );

    it('Dado a varredura, Quando classificar, Então existe rota de plataforma e de cada família da clínica', () => {
      const families = new Set(
        staffGuarded.map((f) => classifyRoute(f.pathname)),
      );
      for (const family of [
        'platform',
        'clinical',
        'operational',
        'administrative',
        'professional_self',
      ]) {
        expect(families.has(family as never), family).toBe(true);
      }
    });

    for (const role of Object.keys(DENIED_FAMILIES) as Array<
      keyof typeof DENIED_FAMILIES
    >) {
      const deniedFamilies: ReadonlySet<string> = DENIED_FAMILIES[role];
      const deniedRoutes = staffGuarded.filter((f) =>
        deniedFamilies.has(classifyRoute(f.pathname)),
      );

      it.each(deniedRoutes.map((f) => [f.relative, f] as const))(
        `Dado %s com sessão de ${role}, Quando chamar cada handler, Então responde 403 (família negada)`,
        async (_relative, file) => {
          const handlers = await loadHandlers(file);

          for (const [method, handler] of handlers) {
            const response = await handler(
              requestFor(file.pathname, method, headersFor(role)),
              anyContext(),
            );
            expect(
              response.status,
              `${method} ${file.pathname} deveria negar o papel ${role} (família ${classifyRoute(file.pathname)}, recebido ${response.status})`,
            ).toBe(403);
            const body = (await response.json()) as { error: string };
            expect(body.error, `${method} ${file.pathname}`).toBe(
              'Seu papel não tem acesso a este recurso',
            );
          }
        },
      );

      const allowedRoutes = staffGuarded.filter(
        (f) => !deniedFamilies.has(classifyRoute(f.pathname)),
      );

      it.each(allowedRoutes.map((f) => [f.relative, f] as const))(
        `Dado %s com sessão de ${role}, Quando chamar cada handler, Então NÃO responde 401/403 (família permitida)`,
        async (_relative, file) => {
          const handlers = await loadHandlers(file);

          for (const [method, handler] of handlers) {
            const response = await handler(
              requestFor(file.pathname, method, headersFor(role)),
              anyContext(),
            );
            expect(
              [401, 403].includes(response.status),
              `${method} ${file.pathname} deveria permitir o papel ${role} passar da guarda de papel (família ${classifyRoute(file.pathname)}, recebido ${response.status})`,
            ).toBe(false);
          }
        },
      );
    }
  });
});
