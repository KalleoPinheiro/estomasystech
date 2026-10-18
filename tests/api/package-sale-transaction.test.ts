import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzleInvoiceRepository } from '@/infrastructure/persistence/drizzle/drizzle-invoice-repository';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const createPatient = async (email: string): Promise<string> => {
  const route = await import('@/app/api/patients/route');
  const response = await route.POST(
    jsonRequest('/api/patients', 'POST', {
      fullName: 'Paciente Pacote',
      email,
      phone: '11999990000',
    }),
  );
  return ((await response.json()) as Envelope<{ id: string }>).data.id;
};

const createProcedure = async (name: string): Promise<string> => {
  const route = await import('@/app/api/procedures/route');
  const response = await route.POST(
    jsonRequest('/api/procedures', 'POST', {
      name,
      priceCents: 15000,
      durationMinutes: 40,
    }),
  );
  return ((await response.json()) as Envelope<{ id: string }>).data.id;
};

const sellPackage = async (
  patientId: string,
  procedureId: string,
  priceCents: number,
) => {
  const route = await import('@/app/api/packages/route');
  return route.POST(
    jsonRequest('/api/packages', 'POST', {
      patientId,
      procedureId,
      totalSessions: 5,
      priceCents,
    }),
  );
};

const listPackages = async (patientId: string) => {
  const route = await import('@/app/api/packages/route');
  const response = await route.GET(
    jsonRequest(`/api/packages?patientId=${patientId}`, 'GET'),
  );
  return ((await response.json()) as Envelope<unknown[]>).data;
};

const listInvoices = async (patientId: string) => {
  const route = await import('@/app/api/invoices/route');
  const response = await route.GET(
    jsonRequest(`/api/invoices?patientId=${patientId}`, 'GET'),
  );
  return ((await response.json()) as Envelope<unknown[]>).data;
};

describe('Feature: Venda de pacote é atômica (POST /api/packages)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dada falha ao gravar a fatura, Quando vender o pacote, Então o pacote também não é gravado (rollback)', async () => {
    const patientId = await createPatient('pacote-rollback@x.com');
    const procedureId = await createProcedure('Pacote rollback');
    vi.spyOn(DrizzleInvoiceRepository.prototype, 'save').mockRejectedValueOnce(
      new Error('falha simulada ao gravar fatura'),
    );

    const response = await sellPackage(patientId, procedureId, 50000);

    expect(response.ok).toBe(false);
    expect(await listPackages(patientId)).toHaveLength(0);
    expect(await listInvoices(patientId)).toHaveLength(0);
  });

  it('Dado pacote cortesia (preço zero), Quando vender, Então 200 com o pacote e nenhuma fatura', async () => {
    const patientId = await createPatient('pacote-cortesia@x.com');
    const procedureId = await createProcedure('Pacote cortesia');

    const response = await sellPackage(patientId, procedureId, 0);

    expect(response.status).toBe(200);
    expect(await listPackages(patientId)).toHaveLength(1);
    expect(await listInvoices(patientId)).toHaveLength(0);
  });
});
