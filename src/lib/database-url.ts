/**
 * Modos de SSL do `pg` que a biblioteca trata como apelido de `verify-full`
 * (aviso "SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'
 * are treated as aliases for 'verify-full'"). Hoje o resultado é o mesmo, mas
 * a segurança do dado de saúde (LGPD) não pode depender de um apelido que o
 * `pg` 9 passa a tratar como o libpq (`require` sem verificar o certificado).
 */
const SSL_MODE_ALIAS = /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/gi;

/**
 * Deixa explícito `sslmode=verify-full` quando a string de conexão pede um dos
 * apelidos. Não liga SSL onde a URL não pede (banco interno do Coolify/compose
 * e Postgres local seguem sem `sslmode`) e não toca em `disable`, `no-verify`
 * nem em `verify-full`, que já estão explícitos.
 */
export function enforceVerifyFull(connectionString: string): string {
  return connectionString.replace(SSL_MODE_ALIAS, '$1sslmode=verify-full');
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Variável da conexão normal de runtime (`getDb`). `DATABASE_APP_URL` existe porque na Vercel a
 * `DATABASE_URL` é gerenciada pela integração do Neon (não é editável e é regravada a cada rotação
 * de segredo): ali o login restrito da aplicação (RLS etapa 5, ADR-110) vai nesta variável.
 * Definida e não vazia, vale ela; senão, `DATABASE_URL`. A migração e o seed do build, a conexão de
 * sistema (`DATABASE_SYSTEM_URL`) e os scripts de operação não passam por aqui.
 */
export function appDatabaseEnvName(
  env: Env = process.env,
): 'DATABASE_APP_URL' | 'DATABASE_URL' {
  return env.DATABASE_APP_URL?.trim() ? 'DATABASE_APP_URL' : 'DATABASE_URL';
}
