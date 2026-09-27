import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface ClinicDto {
  id: string;
  name: string;
  cnpj: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  city: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
  registrationComplete: boolean;
  createdAt: string;
}

const SUPER_ADMIN = cookieHeaderFor('super_admin', 'dono@vitta.app', null);

const repositories = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

let seq = 0;
const seedClinic = async (cnpj: string) => {
  const clinic = Clinic.create({
    name: `Clínica ${++seq}`,
    cnpj,
    contactPhone: '11 3333-4444',
    contactEmail: 'contato@x.com',
    createdBy: 'test',
  });
  const { clinics } = await repositories(clinic.id);
  await clinics.create(clinic);
  return clinic;
};

const detail = async (id: string) => {
  const route = await import('@/app/api/platform/clinics/[id]/route');
  const response = await route.GET(
    jsonRequest(`/api/platform/clinics/${id}`, 'GET', undefined, SUPER_ADMIN),
    { params: Promise.resolve({ id }) },
  );
  return { response, json: (await response.json()) as Envelope<ClinicDto> };
};

const patch = async (id: string, body: unknown) => {
  const route = await import('@/app/api/platform/clinics/[id]/route');
  const response = await route.PATCH(
    jsonRequest(`/api/platform/clinics/${id}`, 'PATCH', body, SUPER_ADMIN),
    { params: Promise.resolve({ id }) },
  );
  return { response, json: (await response.json()) as Envelope<ClinicDto> };
};

describe('Feature: Detalhe e edição do cadastro pela plataforma (B4, Journey 6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dada clínica existente ou não, Quando abrir o detalhe da clínica, Então 200 com o cadastro ou 404', async () => {
    const clinic = await seedClinic('11.000.000/0001-00');

    const { response, json } = await detail(clinic.id);

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      id: clinic.id,
      name: clinic.name,
      cnpj: '11.000.000/0001-00',
      contactPhone: '11 3333-4444',
      contactEmail: 'contato@x.com',
      address: null,
      city: null,
      professionalName: null,
      professionalRegistry: null,
      registrationComplete: true,
      status: 'active',
      statusChangedAt: null,
      statusChangedBy: null,
      createdAt: clinic.createdAt.toISOString(),
    });

    const legacy = await detail('legacy-clinic');
    expect(legacy.json.data.registrationComplete).toBe(false);

    const missing = await detail('nao-existe');
    expect(missing.response.status).toBe(404);
    expect(missing.json.error).toBe('Clínica não encontrada');
  });

  it('Dada a clínica do go-live, Quando o super_admin edita o cadastro em partes, Então só os campos enviados mudam', async () => {
    const first = await patch('legacy-clinic', {
      name: 'Clínica Real Ltda',
      cnpj: '33444555000166',
      contactPhone: '11 94444-5555',
    });

    expect(first.response.status).toBe(200);
    expect(first.json.data).toMatchObject({
      name: 'Clínica Real Ltda',
      cnpj: '33.444.555/0001-66',
      contactPhone: '11 94444-5555',
      contactEmail: null,
      registrationComplete: false,
    });

    const second = await patch('legacy-clinic', {
      contactEmail: 'Contato@Real.com',
      professionalName: 'Enf. Bia',
    });

    expect(second.json.data).toMatchObject({
      name: 'Clínica Real Ltda',
      cnpj: '33.444.555/0001-66',
      contactEmail: 'contato@real.com',
      professionalName: 'Enf. Bia',
      registrationComplete: true,
    });
    const { clinics } = await repositories('legacy-clinic');
    expect((await clinics.findById('legacy-clinic'))?.contactEmail).toBe(
      'contato@real.com',
    );

    const missing = await patch('nao-existe', { name: 'X' });
    expect(missing.response.status).toBe(404);
    expect(missing.json.error).toBe('Clínica não encontrada');
  });

  it.each([
    ['nome vazio', { name: '' }],
    ['e-mail de contato inválido', { contactEmail: 'invalido' }],
    ['CNPJ malformado', { cnpj: '12.345' }],
  ])(
    'Dado %s, Quando editar, Então nome vazio e dado inválido respondem 400 e nada muda',
    async (_label, body) => {
      const clinic = await seedClinic(
        `12.${String(++seq).padStart(3, '0')}.000/0001-00`,
      );

      const { response } = await patch(clinic.id, body);

      expect(response.status).toBe(400);
      const { clinics } = await repositories(clinic.id);
      const stored = await clinics.findById(clinic.id);
      expect(stored?.name).toBe(clinic.name);
      expect(stored?.contactEmail).toBe('contato@x.com');
      expect(stored?.cnpj).toBe(clinic.cnpj);
    },
  );

  it('Dada clínica completa, Quando o super_admin limpa o contato, Então 200 e a clínica volta a cadastro incompleto', async () => {
    const clinic = await seedClinic('47.000.000/0001-00');

    const { response, json } = await patch(clinic.id, {
      contactEmail: null,
      contactPhone: '',
    });

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      contactEmail: null,
      contactPhone: null,
      registrationComplete: false,
    });
  });

  it('Dado CNPJ de outra clínica, Quando editar, Então 400 e a clínica não muda; o próprio CNPJ passa', async () => {
    const owner = await seedClinic('44.000.000/0001-00');
    const other = await seedClinic('45.000.000/0001-00');

    const { response, json } = await patch(other.id, {
      cnpj: '44000000000100',
      name: 'Tentou roubar',
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe('Já existe clínica com este CNPJ');
    const { clinics } = await repositories(other.id);
    expect((await clinics.findById(other.id))?.cnpj).toBe('45.000.000/0001-00');
    expect((await clinics.findById(other.id))?.name).toBe(other.name);

    const same = await patch(owner.id, { cnpj: '44.000.000/0001-00' });
    expect(same.response.status).toBe(200);
  });

  it('Dada a edição, Quando registrar a auditoria da edição, Então o evento fica na clínica-alvo com o super_admin', async () => {
    const clinic = await seedClinic('46.000.000/0001-00');

    await patch(clinic.id, { city: 'Campinas' });

    const { auditEvents } = await repositories(clinic.id);
    await vi.waitFor(async () => {
      expect(await auditEvents.findAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'update',
            resourceType: 'clinic-info',
            resourceId: clinic.id,
            actorRole: 'super_admin',
            actorId: 'dono@vitta.app',
            clinicId: clinic.id,
          }),
        ]),
      );
    });
  });
});
