import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

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

    // Duas criações simultâneas com o mesmo e-mail: a checagem da aplicação
    // passa nas duas e o banco rejeita a segunda (uq_patients_clinic_email).
    const responses = await Promise.all([
      patientsRoute.POST(jsonRequest('/api/patients', 'POST', body)),
      patientsRoute.POST(jsonRequest('/api/patients', 'POST', body)),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 500]);
    expect(log).toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('maria.sigilosa@exemplo.com');
    expect(logged).not.toContain('Sigilosa');
    expect(logged).not.toContain('11988887777');
    expect(logged).toContain('23505');
  });
});
