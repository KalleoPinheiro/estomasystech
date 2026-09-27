interface PgErrorFields {
  code?: unknown;
  constraint?: unknown;
}

function isViolationOf(value: unknown, constraint?: string): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const fields = value as PgErrorFields;
  return (
    fields.code === '23505' &&
    (constraint === undefined || fields.constraint === constraint)
  );
}

/**
 * `true` para violação de unicidade do Postgres (SQLSTATE 23505) — com
 * `constraint`, só a desse índice. O Drizzle envolve o erro original do driver
 * em `DrizzleQueryError`, que guarda o erro em `.cause`, não na própria
 * instância — checa os dois níveis.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (isViolationOf(error, constraint)) {
    return true;
  }
  const cause = error instanceof Error ? error.cause : undefined;
  return isViolationOf(cause, constraint);
}
