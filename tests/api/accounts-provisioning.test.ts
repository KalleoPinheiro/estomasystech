import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { seedPortalRecord } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Hierarquia de provisionamento via POST /api/accounts (RBAC-11..14)', () => {
  const createProfessional = async (fullName: string) => {
    const route = await import('@/app/api/professionals/route');
    const headers = cookieHeaderFor(
      'company_admin',
      'company_admin@example.com',
      CLINIC_A_ID,
    );
    const response = await route.POST(
      jsonRequest('/api/professionals', 'POST', { fullName }, headers),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const create = async (
    actorRole: Parameters<typeof cookieHeaderFor>[0],
    body: Record<string, unknown>,
  ) => {
    const route = await import('@/app/api/accounts/route');
    const headers = cookieHeaderFor(
      actorRole,
      `${actorRole}@example.com`,
      CLINIC_A_ID,
    );
    const response = await route.POST(
      jsonRequest('/api/accounts', 'POST', body, headers),
    );
    const json = (await response.json()) as Envelope<{
      id: string;
      email: string;
    }>;
    return { response, json };
  };

  describe('Cenário: caminho permitido — company_admin cadastra profissional na própria empresa', () => {
    it('Dado company_admin, Quando cadastrar profissional, Então 200', async () => {
      await ensureTestClinics();
      const professionalId = await createProfessional('Dra. Nova Profissional');
      const { response, json } = await create('company_admin', {
        email: 'novo-prof@x.com',
        role: 'profissional',
        professionalId,
      });

      expect(response.status).toBe(200);
      expect(json.data.email).toBe('novo-prof@x.com');
    });
  });

  describe('Cenário: caminho negado — company_admin tentando cadastrar super_admin', () => {
    it('Dado company_admin, Quando cadastrar super_admin, Então 403', async () => {
      await ensureTestClinics();
      const { response } = await create('company_admin', {
        email: 'sa-negado@x.com',
        role: 'super_admin',
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Cenário: caminho negado — atendente tentando cadastrar profissional', () => {
    it('Dado atendente, Quando cadastrar profissional, Então 403', async () => {
      await ensureTestClinics();
      const professionalId = await createProfessional('Dr. Negado');
      const { response } = await create('atendente', {
        email: 'prof-negado@x.com',
        role: 'profissional',
        professionalId,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Cenário: caminho permitido — atendente cadastra patient', () => {
    it('Dado atendente, Quando cadastrar patient, Então 200', async () => {
      await ensureTestClinics();
      const { response } = await create('atendente', {
        email: 'paciente-por-atendente@x.com',
        role: 'patient',
        patientId: await seedPortalRecord('patient'),
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: mais de um company_admin por empresa', () => {
    it('Dado um company_admin já existente, Quando outro company_admin cadastra mais um, Então 200 (sem limite)', async () => {
      await ensureTestClinics();
      const first = await create('company_admin', {
        email: 'admin1-provisioning@x.com',
        role: 'company_admin',
      });
      expect(first.response.status).toBe(200);

      const second = await create('company_admin', {
        email: 'admin2-provisioning@x.com',
        role: 'company_admin',
      });
      expect(second.response.status).toBe(200);
    });
  });

  describe('Cenário: nenhuma rota de auto-cadastro (RBAC-14)', () => {
    it('Dado nenhuma sessão, Quando POST /api/accounts, Então não cria conta (401)', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/accounts/route');
      const noCookieRequest = new NextRequest('http://localhost/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          email: 'auto-cadastro@x.com',
          role: 'super_admin',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await route.POST(noCookieRequest);

      expect(response.status).toBe(401);
    });
  });

  describe('Cenário: conta de portal nasce vinculada ao cadastro (#196)', () => {
    it('portal account requires link: patient sem patientId e partner sem partnerId → 400', async () => {
      await ensureTestClinics();
      const patient = await create('company_admin', {
        email: 'portal-sem-vinculo@x.com',
        role: 'patient',
      });
      const partner = await create('company_admin', {
        email: 'parceiro-sem-vinculo@x.com',
        role: 'partner',
      });

      expect(patient.response.status).toBe(400);
      expect(patient.json.error).toContain('patientId é obrigatório');
      expect(partner.response.status).toBe(400);
      expect(partner.json.error).toContain('partnerId é obrigatório');
    });

    it('portal link validated: cadastro de outra empresa, inexistente ou já vinculado → 400', async () => {
      await ensureTestClinics();
      const { CLINIC_B_ID } = await import('../support/clinics');
      const otherClinic = await create('company_admin', {
        email: 'vinculo-outra-empresa@x.com',
        role: 'patient',
        patientId: await seedPortalRecord('patient', CLINIC_B_ID),
      });
      const missing = await create('company_admin', {
        email: 'vinculo-inexistente@x.com',
        role: 'partner',
        partnerId: 'parceiro-que-nao-existe',
      });
      const patientId = await seedPortalRecord('patient');
      const first = await create('company_admin', {
        email: 'vinculo-primeiro@x.com',
        role: 'patient',
        patientId,
      });
      const second = await create('company_admin', {
        email: 'vinculo-segundo@x.com',
        role: 'patient',
        patientId,
      });

      expect(otherClinic.response.status).toBe(400);
      expect(otherClinic.json.error).toBe('Paciente vinculado não encontrado');
      expect(missing.response.status).toBe(400);
      expect(missing.json.error).toBe('Parceiro vinculado não encontrado');
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(400);
      expect(second.json.error).toBe('Este paciente já tem acesso ao portal');
    });
  });
});
