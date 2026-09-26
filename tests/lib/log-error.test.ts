import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, sanitizeError } from '@/lib/log-error';

/** Erro do driver `pg` como o Postgres o devolve numa violação de unicidade. */
function pgUniqueViolation(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "uq_patients_clinic_email"',
    ),
    {
      code: '23505',
      severity: 'ERROR',
      detail: 'Key (clinic_id, email)=(c1, fulano@x.com) already exists.',
      table: 'patients',
      constraint: 'uq_patients_clinic_email',
      routine: '_bt_check_unique',
    },
  );
}

describe('logError (#202)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C14 DrizzleQueryError é logado sem params nem query', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new DrizzleQueryError(
      'insert into "patients" ("full_name", "email") values ($1, $2)',
      ['Fulano de Tal', 'fulano@x.com'],
      pgUniqueViolation(),
    );

    logError('Erro inesperado na API:', error);

    expect(log).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.mock.calls[0]);
    expect(logged).not.toContain('fulano@x.com');
    expect(logged).not.toContain('Fulano de Tal');
    expect(logged).not.toContain('insert into');
    expect(log.mock.calls[0][1]).toMatchObject({
      code: '23505',
      table: 'patients',
      constraint: 'uq_patients_clinic_email',
    });
  });

  it('erro do driver sem wrapper também perde detail e mensagem', () => {
    const safe = sanitizeError(pgUniqueViolation());

    expect(JSON.stringify(safe)).not.toContain('fulano@x.com');
    expect(safe).toMatchObject({ name: 'DatabaseError', code: '23505' });
    expect(safe.message).toBeUndefined();
  });

  it('stack de erro de banco mantém só os frames', () => {
    const error = new DrizzleQueryError('select $1', ['segredo'], undefined);
    const safe = sanitizeError(error);

    expect(safe.stack ?? '').not.toContain('segredo');
    expect(safe.stack ?? '').toMatch(/^\s*at /);
  });

  it('erro comum mantém nome, mensagem e causa sanitizada', () => {
    const error = new Error('falhou', { cause: pgUniqueViolation() });
    const safe = sanitizeError(error);

    expect(safe).toMatchObject({ name: 'Error', message: 'falhou' });
    expect(safe.cause).toMatchObject({ code: '23505' });
    expect(JSON.stringify(safe)).not.toContain('fulano@x.com');
  });

  it('valor não-Error lançado não é serializado', () => {
    expect(sanitizeError({ email: 'fulano@x.com' })).toEqual({
      name: 'object',
      message: 'valor não-Error lançado',
    });
  });

  it('stack sem frames vira undefined', () => {
    const error = new DrizzleQueryError('q', [], undefined);
    error.stack = 'DrizzleQueryError: Failed query: q';

    expect(sanitizeError(error).stack).toBeUndefined();
  });
});
