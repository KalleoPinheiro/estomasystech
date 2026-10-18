import { readdirSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { systemScope } from '@/lib/auth/tenant-scope';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Confirma a AC "não existe nenhuma rota de auto-cadastro" (RBAC-14):
 * (1) nenhum arquivo de rota com nome que sugira auto-cadastro (register,
 * signup, cadastro) existe fora do namespace de autenticação (login/logout);
 * (2) a única rota que cria contas de login (`POST /api/accounts`) exige
 * sessão — reafirmado aqui porque é a AC de negócio central desta task, não
 * só um efeito colateral do sweep genérico de conformidade.
 */
describe('Feature: Ausência de rota de auto-cadastro (RBAC-14)', () => {
  it('Dado o diretório de rotas de API, Quando varrer, Então nenhuma sugere auto-cadastro', () => {
    const apiRoot = path.join(process.cwd(), 'src/app/api');
    const suspicious: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.name !== 'route.ts') continue;
        const relative = path.relative(apiRoot, full);
        if (/register|signup|cadastro-publico/i.test(relative)) {
          suspicious.push(relative);
        }
      }
    };
    walk(apiRoot);

    expect(suspicious).toEqual([]);
  });

  it('Dado nenhuma sessão, Quando POST /api/accounts, Então recusa com 401 (não cria conta)', async () => {
    const email = 'sem-sessao@x.com';
    const route = await import('@/app/api/accounts/route');
    const response = await route.POST(
      new NextRequest('http://localhost/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password: 'senhaSegura123', // gitleaks:allow — fixture de teste, não é credencial
          role: 'super_admin',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    // Guarda de sessão rejeita antes do handler — não a validação de negócio.
    expect(response.status).toBe(401);

    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(systemScope());
    expect(await userAccounts.findByEmail(email)).toBeNull();
  });
});
