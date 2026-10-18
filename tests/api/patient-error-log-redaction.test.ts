import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Issue #202: erro de banco no cadastro virava `console.error(error)` com o
 * `DrizzleQueryError` inteiro — a mensagem dele carrega os parâmetros SQL
 * (nome, e-mail, telefone do paciente).
 */
describe('Feature: log de erro sem dado pessoal (#202)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C15 erro de banco no cadastro de paciente não loga e-mail nem nome', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = {
      fullName: 'Maria Sigilosa da Silva',
      email: 'maria.sigilosa@exemplo.com',
      phone: '11988887777',
    };
    // O e-mail do paciente deixou de ser único (#325): o erro de banco é
    // simulado no formato do DrizzleQueryError (query + params na mensagem,
    // SQLSTATE e detalhe com o valor na causa do driver).
    const driverError = Object.assign(
      new Error(
        `duplicate key value violates unique constraint "x" Key (full_name)=(${body.fullName})`,
      ),
      {
        code: '23505',
        severity: 'ERROR',
        detail: `Key (full_name)=(${body.fullName}) already exists.`,
      },
    );
    const queryError = Object.assign(
      new Error(
        `Failed query: insert into "patients" params: ${body.fullName},${body.email},${body.phone}`,
      ),
      {
        query: 'insert into "patients"',
        params: [body.fullName, body.email, body.phone],
        cause: driverError,
      },
    );
    vi.spyOn(DrizzlePatientRepository.prototype, 'save').mockRejectedValueOnce(
      queryError,
    );

    const response = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', body),
    );

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('maria.sigilosa@exemplo.com');
    expect(logged).not.toContain('Sigilosa');
    expect(logged).not.toContain('11988887777');
    expect(logged).toContain('23505');
  });
});
