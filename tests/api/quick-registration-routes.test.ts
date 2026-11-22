import { beforeAll, describe, expect, it } from 'vitest';
import { ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface PatientBody {
  id: string;
  registrationIncomplete?: boolean;
  email: string | null;
}

/** #972: cadastro rápido pela rota e o fim da marca no cadastro completo. */
describe('Feature: cadastro rápido pela API (#972, PRO-RN-38)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    await ensureTestClinics();
  });

  const quickCreate = async (extra: Record<string, unknown> = {}) => {
    const response = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Ana Rápida',
        phone: '11988887777',
        birthDate: '1960-04-12',
        quickRegistration: true,
        ...extra,
      }),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<PatientBody>,
    };
  };

  const put = async (id: string, data: Record<string, unknown>) => {
    const response = await patientByIdRoute.PUT(
      jsonRequest(`/api/patients/${id}`, 'PUT', data),
      { params: Promise.resolve({ id }) },
    );
    return (await response.json()) as Envelope<PatientBody>;
  };

  it('Dado cadastro rápido, Então cria marcado como incompleto e ignora os outros campos', async () => {
    const { status, body } = await quickCreate({
      email: 'ana@example.com',
      referredByPartnerId: 'nao-existe',
    });

    expect(status).toBe(200);
    expect(body.data.registrationIncomplete).toBe(true);
    expect(body.data.email).toBeNull();
  });

  it('Dado cadastro rápido sem nascimento, Então responde 400', async () => {
    const { status } = await quickCreate({ birthDate: null });
    expect(status).toBe(400);
  });

  it('Dado cadastro rápido, Quando o PUT só traz outro campo, Então segue incompleto', async () => {
    const { body } = await quickCreate();
    const updated = await put(body.data.id, { notes: 'só nota' });
    expect(updated.data.registrationIncomplete).toBe(true);
  });

  it('Dado cadastro rápido, Quando salvar o formulário completo, Então deixa de ser incompleto', async () => {
    const { body } = await quickCreate();
    const updated = await put(body.data.id, {
      fullName: 'Ana Rápida Silva',
      phone: '11988887777',
      email: 'ana@example.com',
    });
    expect(updated.data.registrationIncomplete).toBe(false);
  });
});
