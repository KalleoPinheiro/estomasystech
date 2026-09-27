import { describe, expect, it, vi } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { getRepositories } from '@/infrastructure/container';
import { systemScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { linkAllPortalAccounts } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface BillingCounts {
  billing: { totalInvoices: number; pendingCents: number };
}

type RouteContext = { params: Promise<{ id: string }> };
const context = (id: string): RouteContext => ({
  params: Promise.resolve({ id }),
});

const currentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const patientPortalHeader = (email: string, clinicId: string) =>
  cookieHeaderFor('patient', email, clinicId);

const createPatient = async (
  clinicId: string,
  email: string,
  fullName = 'Paciente Isolamento',
): Promise<string> => {
  const route = await import('@/app/api/patients/route');
  const response = await route.POST(
    jsonRequest(
      '/api/patients',
      'POST',
      { fullName, email, phone: '11999990000' },
      adminCookieHeader(clinicId),
    ),
  );
  const body = (await response.json()) as Envelope<{ id: string }>;
  return body.data.id;
};

const createInvoice = async (clinicId: string, patientId: string) => {
  const route = await import('@/app/api/invoices/route');
  const response = await route.POST(
    jsonRequest(
      '/api/invoices',
      'POST',
      { patientId, description: 'Curativo avulso', amountCents: 12345 },
      adminCookieHeader(clinicId),
    ),
  );
  expect(response.status).toBe(200);
};

const createProcedure = async (
  clinicId: string,
  name: string,
): Promise<string> => {
  const route = await import('@/app/api/procedures/route');
  const response = await route.POST(
    jsonRequest(
      '/api/procedures',
      'POST',
      { name, priceCents: 15000, durationMinutes: 40 },
      adminCookieHeader(clinicId),
    ),
  );
  const body = (await response.json()) as Envelope<{ id: string }>;
  return body.data.id;
};

const createSupply = async (
  clinicId: string,
  name: string,
): Promise<string> => {
  const route = await import('@/app/api/supplies/route');
  const response = await route.POST(
    jsonRequest(
      '/api/supplies',
      'POST',
      { name, unit: 'un', minQty: 5, priceCents: 1000 },
      adminCookieHeader(clinicId),
    ),
  );
  const body = (await response.json()) as Envelope<{ id: string }>;
  return body.data.id;
};

describe('Feature: Isolamento por empresa em agregados, auditoria, kit e portal', () => {
  describe('GET /api/summary (painel)', () => {
    const summaryFor = async (clinicId: string) => {
      const route = await import('@/app/api/summary/route');
      const response = await route.GET(
        jsonRequest(
          `/api/summary?month=${currentMonth()}`,
          'GET',
          undefined,
          adminCookieHeader(clinicId),
        ),
      );
      return ((await response.json()) as Envelope<BillingCounts>).data;
    };

    it('Dada fatura criada na clínica B, Quando a clínica A abre o painel, Então o faturamento de A não muda', async () => {
      await ensureTestClinics();
      const beforeA = await summaryFor(CLINIC_A_ID);
      const beforeB = await summaryFor(CLINIC_B_ID);

      const patientB = await createPatient(CLINIC_B_ID, 'sum-b@x.com');
      await createInvoice(CLINIC_B_ID, patientB);

      const afterA = await summaryFor(CLINIC_A_ID);
      const afterB = await summaryFor(CLINIC_B_ID);
      expect(afterA.billing.totalInvoices).toBe(beforeA.billing.totalInvoices);
      expect(afterB.billing.totalInvoices).toBe(
        beforeB.billing.totalInvoices + 1,
      );
    });
  });

  describe('GET /api/reports', () => {
    const reportFor = async (clinicId: string, month: string) => {
      const route = await import('@/app/api/reports/route');
      const response = await route.GET(
        jsonRequest(
          `/api/reports?month=${month}`,
          'GET',
          undefined,
          adminCookieHeader(clinicId),
        ),
      );
      return ((await response.json()) as Envelope<BillingCounts>).data;
    };

    it('Dada fatura criada na clínica B, Quando a clínica A gera o relatório do mês, Então os números de A não mudam', async () => {
      await ensureTestClinics();
      const month = currentMonth();
      const beforeA = await reportFor(CLINIC_A_ID, month);
      const beforeB = await reportFor(CLINIC_B_ID, month);

      const patientB = await createPatient(CLINIC_B_ID, 'rep-b@x.com');
      await createInvoice(CLINIC_B_ID, patientB);

      const afterA = await reportFor(CLINIC_A_ID, month);
      const afterB = await reportFor(CLINIC_B_ID, month);
      expect(afterA.billing.totalInvoices).toBe(beforeA.billing.totalInvoices);
      expect(afterB.billing.totalInvoices).toBe(
        beforeB.billing.totalInvoices + 1,
      );
    });

    it('Dado mês encerrado cacheado pela clínica B, Quando a clínica A pede o mesmo mês, Então recalcula em vez de servir o cache de B', async () => {
      await ensureTestClinics();
      const { clearReportCache } = await import('@/lib/report-cache');
      const { GetMonthlyReport } = await import(
        '@/application/reports/get-monthly-report'
      );
      clearReportCache();
      const executeSpy = vi.spyOn(GetMonthlyReport.prototype, 'execute');

      await reportFor(CLINIC_B_ID, '2019-06');
      await reportFor(CLINIC_A_ID, '2019-06');
      await reportFor(CLINIC_A_ID, '2019-06');

      // B calcula, A calcula (chave própria), A de novo vem do cache.
      expect(executeSpy).toHaveBeenCalledTimes(2);
      executeSpy.mockRestore();
      clearReportCache();
    });
  });

  describe('GET /api/audit', () => {
    it('Dado evento de auditoria da clínica B, Quando a clínica A consulta a trilha, Então não vê o evento', async () => {
      await ensureTestClinics();
      const patientId = 'audit-isolation-patient';
      const { auditEvents } = await getRepositories(systemScope());
      await auditEvents.save(
        AuditEvent.create({
          clinicId: CLINIC_B_ID,
          actorRole: 'company_admin',
          actorId: 'equipe-b@clinica.com',
          action: 'read',
          resourceType: 'anamnesis',
          resourceId: 'r-1',
          patientId,
        }),
      );

      const route = await import('@/app/api/audit/route');
      const listFor = async (clinicId: string | null) => {
        const response = await route.GET(
          jsonRequest(
            `/api/audit?patientId=${patientId}`,
            'GET',
            undefined,
            clinicId === null
              ? cookieHeaderFor('super_admin', 'root@sistema', null)
              : adminCookieHeader(clinicId),
          ),
        );
        return ((await response.json()) as Envelope<unknown[]>).data;
      };

      expect(await listFor(CLINIC_A_ID)).toHaveLength(0);
      expect(await listFor(CLINIC_B_ID)).toHaveLength(1);
      // Papel de sistema mantém a visão cross-empresa.
      expect(await listFor(null)).toHaveLength(1);
    });
  });

  describe('/api/procedures/[id]/kit', () => {
    it('Dado procedimento da clínica B, Quando a clínica A lê ou grava o kit, Então 404', async () => {
      await ensureTestClinics();
      const procedureB = await createProcedure(CLINIC_B_ID, 'Kit isolado B');
      const route = await import('@/app/api/procedures/[id]/kit/route');

      const read = await route.GET(
        jsonRequest(
          `/api/procedures/${procedureB}/kit`,
          'GET',
          undefined,
          adminCookieHeader(CLINIC_A_ID),
        ),
        context(procedureB),
      );
      const write = await route.PUT(
        jsonRequest(
          `/api/procedures/${procedureB}/kit`,
          'PUT',
          { items: [] },
          adminCookieHeader(CLINIC_A_ID),
        ),
        context(procedureB),
      );

      expect(read.status).toBe(404);
      expect(write.status).toBe(404);
    });

    it('Dado insumo da clínica B, Quando a clínica A o coloca no kit do próprio procedimento, Então 404 e o kit não muda', async () => {
      await ensureTestClinics();
      const procedureA = await createProcedure(CLINIC_A_ID, 'Kit misto A');
      const supplyA = await createSupply(CLINIC_A_ID, 'Gaze kit A');
      const supplyB = await createSupply(CLINIC_B_ID, 'Gaze kit B');
      const route = await import('@/app/api/procedures/[id]/kit/route');
      const put = (supplyId: string) =>
        route.PUT(
          jsonRequest(
            `/api/procedures/${procedureA}/kit`,
            'PUT',
            { items: [{ supplyId, quantity: 2 }] },
            adminCookieHeader(CLINIC_A_ID),
          ),
          context(procedureA),
        );

      expect((await put(supplyA)).status).toBe(200);
      expect((await put(supplyB)).status).toBe(404);

      const read = await route.GET(
        jsonRequest(
          `/api/procedures/${procedureA}/kit`,
          'GET',
          undefined,
          adminCookieHeader(CLINIC_A_ID),
        ),
        context(procedureA),
      );
      const body = (await read.json()) as Envelope<{
        items: Array<{ supplyId: string }>;
      }>;
      expect(body.data.items.map((i) => i.supplyId)).toEqual([supplyA]);
    });
  });

  describe('Portal do paciente', () => {
    it('Dado procedimento exclusivo da clínica B, Quando paciente da clínica A lista o catálogo, Então não o vê', async () => {
      await ensureTestClinics();
      await createProcedure(CLINIC_B_ID, 'Procedimento portal B');
      const route = await import('@/app/api/portal/patient/procedures/route');
      const namesFor = async (clinicId: string) => {
        await linkAllPortalAccounts();
        const response = await route.GET(
          jsonRequest(
            '/api/portal/patient/procedures',
            'GET',
            undefined,
            patientPortalHeader('portal-cat@x.com', clinicId),
          ),
        );
        const body = (await response.json()) as Envelope<
          Array<{ name: string }>
        >;
        return body.data.map((p) => p.name);
      };

      expect(await namesFor(CLINIC_A_ID)).not.toContain(
        'Procedimento portal B',
      );
      expect(await namesFor(CLINIC_B_ID)).toContain('Procedimento portal B');
    });

    it('Dado mesmo e-mail de paciente em duas clínicas, Quando cada sessão abre o portal, Então vê só o próprio cadastro', async () => {
      await ensureTestClinics();
      const email = 'portal-dup@x.com';
      await createPatient(CLINIC_A_ID, email, 'Paciente Da Clínica A');
      await createPatient(CLINIC_B_ID, email, 'Paciente Da Clínica B');
      const route = await import('@/app/api/portal/patient/route');
      const nameFor = async (clinicId: string) => {
        await linkAllPortalAccounts();
        const response = await route.GET(
          jsonRequest(
            '/api/portal/patient',
            'GET',
            undefined,
            patientPortalHeader(email, clinicId),
          ),
        );
        const body = (await response.json()) as Envelope<{
          patient: { fullName: string };
        }>;
        return body.data.patient.fullName;
      };

      expect(await nameFor(CLINIC_A_ID)).toBe('Paciente Da Clínica A');
      expect(await nameFor(CLINIC_B_ID)).toBe('Paciente Da Clínica B');
    });

    it('Dado paciente e procedimento só na clínica B, Quando sessão da clínica A pede horários, Então 404', async () => {
      await ensureTestClinics();
      const email = 'portal-slots-b@x.com';
      await createPatient(CLINIC_B_ID, email);
      const procedureB = await createProcedure(CLINIC_B_ID, 'Slots portal B');
      const route = await import('@/app/api/portal/patient/slots/route');
      await linkAllPortalAccounts();
      const slotsFor = (clinicId: string) =>
        route.GET(
          jsonRequest(
            `/api/portal/patient/slots?procedureId=${procedureB}&date=2099-01-05`,
            'GET',
            undefined,
            patientPortalHeader(email, clinicId),
          ),
        );

      expect((await slotsFor(CLINIC_A_ID)).status).toBe(404);
      expect((await slotsFor(CLINIC_B_ID)).status).toBe(200);
    });
  });

  describe('Portal do parceiro', () => {
    it('Dado parceiro só na clínica B, Quando sessão de parceiro da clínica A com o mesmo e-mail abre o portal, Então 404', async () => {
      await ensureTestClinics();
      const email = 'parceiro-iso@x.com';
      const partnersRoute = await import('@/app/api/partners/route');
      const created = await partnersRoute.POST(
        jsonRequest(
          '/api/partners',
          'POST',
          { fullName: 'Parceiro B', email, phone: '11988887777' },
          adminCookieHeader(CLINIC_B_ID),
        ),
      );
      expect(created.status).toBe(200);

      const route = await import('@/app/api/portal/partner/route');
      await linkAllPortalAccounts();
      const openAs = (clinicId: string) =>
        route.GET(
          jsonRequest(
            '/api/portal/partner',
            'GET',
            undefined,
            cookieHeaderFor('partner', email, clinicId),
          ),
        );

      expect((await openAs(CLINIC_A_ID)).status).toBe(404);
      expect((await openAs(CLINIC_B_ID)).status).toBe(200);
    });
  });
});
