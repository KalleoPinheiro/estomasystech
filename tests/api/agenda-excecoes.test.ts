import { beforeAll, describe, expect, it } from 'vitest';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Matriz de exceções da agenda (ADR-049): concorrência no mesmo horário, caso
 * aplicável que só tinha teste sequencial.
 */
describe('Feature: Conflito de agenda sob pedidos simultâneos (AGE-RN-02)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  const pacientes: string[] = [];

  const criarPaciente = async (email: string) => {
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Corrida', email, phone: '11999990000' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    return ((await response.json()) as Envelope<{ id: string }>).data.id;
  };

  const marcar = (patientId: string) =>
    appointmentsRoute.POST(
      jsonRequest(
        '/api/appointments',
        'POST',
        {
          patientId,
          startsAt: '2027-07-12T13:00:00.000Z',
          endsAt: '2027-07-12T14:00:00.000Z',
          procedure: 'Troca de bolsa',
          priceCents: 15000,
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

  beforeAll(async () => {
    await ensureTestClinics();
    patientsRoute = await import('@/app/api/patients/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    pacientes.push(
      await criarPaciente('corrida-1@x.com'),
      await criarPaciente('corrida-2@x.com'),
    );
  });

  describe('Cenário: dois Atendentes marcam o mesmo horário ao mesmo tempo', () => {
    it('Dados dois pedidos simultâneos para o mesmo horário, Quando marcar, Então um é aceito e o outro recebe 409', async () => {
      const [primeiro = '', segundo = ''] = pacientes;

      const respostas = await Promise.all([marcar(primeiro), marcar(segundo)]);

      expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });
});
