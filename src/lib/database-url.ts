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
