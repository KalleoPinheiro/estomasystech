import { beforeAll, describe, expect, it } from 'vitest';
import { ALREADY_COMPANY_MESSAGE, Clinic } from '@/domain/clinic/clinic';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { ClinicRegistrationDto } from '@/lib/dto';
import { buildPatient } from '../support/builders';
import { validCnpj } from '../support/cnpj';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

let route: typeof import('@/app/api/settings/clinic-info/cnpj/route');

async function createIndividual(cpf: string): Promise<string> {
  const clinic = Clinic.create({
    kind: 'individual',
    name: 'Jeiciele Silva',
    cpf,
    contactPhone: '11 98888-7777',
    contactEmail: 'contato@exemplo.com',
    professionalRegistry: 'COREN-SP 123456',
    createdBy: 'super-admin',
  });
  const { clinics, patients } = await getRepositories(clinicScope(clinic.id));
  await clinics.create(clinic);
  await patients.save(buildPatient({ fullName: 'Paciente da Autônoma' }));
  return clinic.id;
}

const convert = (body: unknown, headers: Record<string, string>) =>
  route.POST(
    jsonRequest('/api/settings/clinic-info/cnpj', 'POST', body, headers),
  );

beforeAll(async () => {
  route = await import('@/app/api/settings/clinic-info/cnpj/route');
});

describe('Feature: autônoma troca o CPF pelo CNPJ (#986)', () => {
  it('o Admin troca; o cadastro vira clínica, os pacientes ficam e a troca é auditada', async () => {
    const clinicId = await createIndividual('529.982.247-25');
    const cnpj = validCnpj('101112130001');

    const response = await convert(
      { cnpj, name: 'Estoma Saúde Ltda' },
      adminCookieHeader(clinicId),
    );
    const body = (await response.json()) as Envelope<{
      info: ClinicRegistrationDto;
    }>;

    expect(response.status).toBe(200);
    expect(body.data?.info.kind).toBeUndefined();
    const repos = await getRepositories(clinicScope(clinicId));
    const saved = await repos.clinics.findById(clinicId);
    expect(saved?.kind).toBe('company');
    expect(saved?.cpf).toBeNull();
    expect(saved?.name).toBe('Estoma Saúde Ltda');
    expect(await repos.patients.findAll()).toHaveLength(1);
    const events = await repos.auditEvents.findAll({
      resourceType: 'clinic-info',
      resourceId: clinicId,
    });
    expect(events.map((event) => event.detail)).toContain(
      'troca de CPF para CNPJ',
    );

    const again = await convert({ cnpj }, adminCookieHeader(clinicId));
    expect(again.status).toBe(400);
    expect(((await again.json()) as Envelope<unknown>).error).toBe(
      ALREADY_COMPANY_MESSAGE,
    );
  });

  it('CNPJ inválido é recusado e nada muda nem é auditado', async () => {
    const clinicId = await createIndividual('111.444.777-35');
    const response = await convert(
      { cnpj: '12.345.678/0001-00' },
      adminCookieHeader(clinicId),
    );
    expect(response.status).toBe(400);
    const repos = await getRepositories(clinicScope(clinicId));
    expect((await repos.clinics.findById(clinicId))?.kind).toBe('individual');
    expect(
      await repos.auditEvents.findAll({
        resourceType: 'clinic-info',
        resourceId: clinicId,
      }),
    ).toHaveLength(0);
  });

  it('CNPJ de outra clínica é recusado', async () => {
    const first = await createIndividual('390.533.447-05');
    const second = await createIndividual('987.654.321-00');
    const cnpj = validCnpj('202122230001');
    expect((await convert({ cnpj }, adminCookieHeader(first))).status).toBe(
      200,
    );
    expect((await convert({ cnpj }, adminCookieHeader(second))).status).toBe(
      400,
    );
  });

  it.each([
    ['atendente', '123.456.789-09'],
    ['profissional', '714.602.380-01'],
  ] as const)('%s não troca', async (role, cpf) => {
    const clinicId = await createIndividual(cpf);
    const response = await convert(
      { cnpj: validCnpj('303132330001') },
      cookieHeaderFor(role, undefined, clinicId),
    );
    expect(response.status).toBe(403);
  });
});
