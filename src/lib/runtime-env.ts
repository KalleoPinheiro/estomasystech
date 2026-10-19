/**
 * Ambiente de execução do app (ADR-041). Produção segue na VPS; homologação e
 * previews rodam na Vercel com banco e dados fictícios. O valor decide o que é
 * proibido fora de produção (banco de produção, integrações reais) e o que só
 * existe fora dela (mocks, faixa de aviso).
 */
export const APP_ENVS = [
  'production',
  'staging',
  'preview',
  'development',
] as const;

export type AppEnv = (typeof APP_ENVS)[number];

type Env = Readonly<Record<string, string | undefined>>;

const isAppEnv = (value: string): value is AppEnv =>
  (APP_ENVS as readonly string[]).includes(value);

/**
 * `APP_ENV` explícito vence. Sem ele, a Vercel recusa (nada de adivinhar
 * produção num deploy público); fora dela, `NODE_ENV=production` é produção e o
 * resto é desenvolvimento, como sempre foi.
 */
export function resolveAppEnv(env: Env = process.env): AppEnv {
  const declared = env.APP_ENV?.trim();
  if (declared) {
    if (!isAppEnv(declared)) {
      throw new Error(
        `APP_ENV inválido: "${declared}". Use ${APP_ENVS.join(', ')}.`,
      );
    }
    return declared;
  }
  if (env.VERCEL) {
    throw new Error(
      'APP_ENV obrigatório na Vercel (staging ou preview). Veja docs/engineering/homologacao.md.',
    );
  }
  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

/** Homologação (staging ou preview): dados fictícios, banner e mocks permitidos. */
export function isHomologationEnv(env: Env = process.env): boolean {
  const appEnv = resolveAppEnv(env);
  return appEnv === 'staging' || appEnv === 'preview';
}

/** Integrações externas respondidas pelo MSW (nada sai de verdade). */
export function mockIntegrationsEnabled(env: Env = process.env): boolean {
  if (env.MOCK_INTEGRATIONS !== 'true') {
    return false;
  }
  if (resolveAppEnv(env) === 'production') {
    throw new Error('MOCK_INTEGRATIONS não pode ficar ligado em produção.');
  }
  return true;
}

function databaseHost(connectionString: string): string {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    throw new Error('DATABASE_URL inválida.');
  }
}

/**
 * Fora de produção, recusa o banco cujo host está em `PRODUCTION_DB_HOSTS`
 * (lista separada por vírgula). Dado real nunca entra em homologação (LGPD).
 */
export function assertNotProductionDatabase(
  connectionString: string,
  env: Env = process.env,
): void {
  if (resolveAppEnv(env) === 'production') {
    return;
  }
  const blocked = (env.PRODUCTION_DB_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
  if (blocked.includes(databaseHost(connectionString))) {
    throw new Error('Banco de produção recusado fora de production.');
  }
}
