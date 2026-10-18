import { describe, expect, it } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Isolamento de Parceiro por empresa (MT-27)', () => {
  const postPartner = async (clinicId: string, email: string) => {
    const route = await import('@/app/api/partners/route');
    const response = await route.POST(
      jsonRequest(
        '/api/partners',
        'POST',
        { fullName: 'Dr. Teste', email, phone: '11988887777' },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return { status: response.status, body };
  };

  const createPartner = async (clinicId: string, email: string) =>
    (await postPartner(clinicId, email)).body.data.id;

  const putPartnerEmail = async (
    clinicId: string,
    id: string,
    email: string,
  ) => {
    const byIdRoute = await import('@/app/api/partners/[id]/route');
    const response = await byIdRoute.PUT(
      jsonRequest(
        `/api/partners/${id}`,
        'PUT',
        { email },
        adminCookieHeader(clinicId),
      ),
      { params: Promise.resolve({ id }) },
    );
    const body = (await response.json()) as Envelope<{ email: string }>;
    return { status: response.status, body };
  };

  it('Dada sessão da clínica A, Quando GET /api/partners, Então lista não inclui parceiro da clínica B', async () => {
    await ensureTestClinics();
    const idB = await createPartner(CLINIC_B_ID, 'parceiro-exclusivo-b@x.com');

    const route = await import('@/app/api/partners/route');
    const response = await route.GET(
      jsonRequest(
        '/api/partners',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(body.data.some((p) => p.id === idB)).toBe(false);
  });

  it('Dada sessão da clínica A, Quando PUT em parceiro da clínica B, Então falha', async () => {
    await ensureTestClinics();
    const idB = await createPartner(
      CLINIC_B_ID,
      'parceiro-so-edita-propria@x.com',
    );

    const byIdRoute = await import('@/app/api/partners/[id]/route');
    const response = await byIdRoute.PUT(
      jsonRequest(
        `/api/partners/${idB}`,
        'PUT',
        { fullName: 'Tentativa cross-empresa' },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: idB }) },
    );

    expect(response.status).toBe(404);
  });

  describe('Cenário: e-mail do parceiro único por empresa (#211)', () => {
    it('Dadas duas empresas, Quando cada uma cadastra o mesmo e-mail de parceiro, Então as duas respondem 200', async () => {
      await ensureTestClinics();
      const email = 'parceiro-duas-empresas@x.com';

      const inA = await postPartner(CLINIC_A_ID, email);
      const inB = await postPartner(CLINIC_B_ID, email);

      expect(inA.status).toBe(200);
      expect(inB.status).toBe(200);
      expect(inA.body.data.id).not.toBe(inB.body.data.id);
    });

    it('Dado e-mail já cadastrado, Quando cadastrar duplicado na mesma empresa, Então 409 com a mensagem da empresa', async () => {
      await ensureTestClinics();
      await postPartner(CLINIC_B_ID, 'parceiro-duplicado@x.com');

      const duplicate = await postPartner(
        CLINIC_B_ID,
        'Parceiro-Duplicado@X.com',
      );

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toBe('Já existe parceiro com este e-mail');
    });

    it('Dada edição para e-mail de outro parceiro da mesma empresa, Quando PUT, Então 409 com a mensagem da empresa', async () => {
      await ensureTestClinics();
      await createPartner(CLINIC_B_ID, 'parceiro-ocupado@x.com');
      const id = await createPartner(CLINIC_B_ID, 'parceiro-que-edita@x.com');

      const result = await putPartnerEmail(
        CLINIC_B_ID,
        id,
        'parceiro-ocupado@x.com',
      );

      expect(result.status).toBe(409);
      expect(result.body.error).toBe('Já existe parceiro com este e-mail');
    });

    it('Dada edição para e-mail que só existe em outra empresa, Quando PUT, Então 200', async () => {
      await ensureTestClinics();
      await createPartner(CLINIC_A_ID, 'parceiro-so-na-a@x.com');
      const id = await createPartner(CLINIC_B_ID, 'parceiro-da-b@x.com');

      const result = await putPartnerEmail(
        CLINIC_B_ID,
        id,
        'parceiro-so-na-a@x.com',
      );

      expect(result.status).toBe(200);
      expect(result.body.data.email).toBe('parceiro-so-na-a@x.com');
    });
  });
});
