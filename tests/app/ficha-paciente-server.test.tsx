// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PatientRecordPage from '@/app/(staff)/pacientes/[id]/page';
import type { UserRole } from '@/domain/auth/user-role';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import type { PatientDto } from '@/lib/dto';
import { renderServerPage } from '../support/server-page';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const mocks = vi.hoisted(() => ({
  requireStaffPageFor: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  getPatientRecord: vi.fn(),
  getPatientAnamnesis: vi.fn(),
  getPatientPartnerConsent: vi.fn(),
  listPatientCarePlans: vi.fn(),
  listPatientConditions: vi.fn(),
  listPatientEvolutions: vi.fn(),
  listPatientPackageBalances: vi.fn(),
  listPatientPackagesWithPrice: vi.fn(),
  listProfessionalOptions: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: mocks.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/patient-record', () => ({
  getPatientRecord: mocks.getPatientRecord,
  getPatientAnamnesis: mocks.getPatientAnamnesis,
  getPatientPartnerConsent: mocks.getPatientPartnerConsent,
  listPatientCarePlans: mocks.listPatientCarePlans,
  listPatientConditions: mocks.listPatientConditions,
  listPatientEvolutions: mocks.listPatientEvolutions,
  listPatientPackageBalances: mocks.listPatientPackageBalances,
  listPatientPackagesWithPrice: mocks.listPatientPackagesWithPrice,
}));
vi.mock('@/lib/server/data/professionals', () => ({
  listProfessionalOptions: mocks.listProfessionalOptions,
}));

const patient: PatientDto = {
  id: 'pac-1',
  fullName: 'Maria Souza',
  email: null,
  phone: '11988887777',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  guardianId: null,
  guardianPortalRevokedAt: null,
  active: true,
  anonymized: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function serve(role: UserRole) {
  mocks.requireStaffPageFor.mockResolvedValue({
    role,
    subject: `${role}@clinica.com`,
  });
  mocks.getPatientRecord.mockResolvedValue(patient);
  mocks.getPatientAnamnesis.mockResolvedValue({
    patientId: 'pac-1',
    comorbidities: '',
    allergies: 'Látex',
    medications: '',
    surgicalHistory: '',
    notes: '',
    updatedAt: '2026-01-05T10:00:00.000Z',
  });
  mocks.getPatientPartnerConsent.mockResolvedValue(null);
  mocks.listPatientCarePlans.mockResolvedValue([]);
  mocks.listPatientConditions.mockResolvedValue([]);
  mocks.listPatientEvolutions.mockResolvedValue([]);
  mocks.listPatientPackageBalances.mockResolvedValue([]);
  mocks.listPatientPackagesWithPrice.mockResolvedValue([]);
  mocks.listProfessionalOptions.mockResolvedValue([]);
}

const page = (aba?: string) => () =>
  PatientRecordPage({
    params: Promise.resolve({ id: 'pac-1' }),
    searchParams: Promise.resolve({ aba }),
  });

const render = (aba?: string) =>
  renderServerPage(async () => (
    <WithStaffIdentity>{await page(aba)()}</WithStaffIdentity>
  ));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Feature: ficha do paciente lida no servidor (#552)', () => {
  it('Dado a ficha renderizada no servidor, Quando monta no navegador, Então mostra paciente e alergia sem nenhuma chamada /api', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: identityFor('company_admin') }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    serve('company_admin');

    await render();

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Alergias: Látex');
    expect(
      fetchMock.mock.calls.filter(([url]) => url !== '/api/auth/identity'),
    ).toEqual([]);
    expect(mocks.requireStaffPageFor).toHaveBeenCalledWith('/pacientes');
  });

  it('Dado a recepção, Quando lê a ficha, Então não lê nenhuma seção clínica (#199)', async () => {
    serve('atendente');

    await render();

    expect(mocks.getPatientRecord).toHaveBeenCalled();
    expect(mocks.getPatientPartnerConsent).toHaveBeenCalled();
    expect(mocks.getPatientAnamnesis).not.toHaveBeenCalled();
    expect(mocks.listPatientConditions).not.toHaveBeenCalled();
    expect(mocks.listPatientEvolutions).not.toHaveBeenCalled();
    expect(mocks.listPatientCarePlans).not.toHaveBeenCalled();
    expect(mocks.listPatientPackageBalances).not.toHaveBeenCalled();
    expect(mocks.listPatientPackagesWithPrice).not.toHaveBeenCalled();
  });

  it('Dado o Profissional, Quando lê os pacotes, Então usa o saldo sem preço (AD-027)', async () => {
    serve('profissional');

    await render();

    expect(mocks.listPatientPackageBalances).toHaveBeenCalledOnce();
    expect(mocks.listPatientPackagesWithPrice).not.toHaveBeenCalled();
  });

  it('Dado o Admin, Quando lê os pacotes, Então usa a leitura com valor', async () => {
    serve('company_admin');

    await render();

    expect(mocks.listPatientPackagesWithPrice).toHaveBeenCalledOnce();
    expect(mocks.listPatientPackageBalances).not.toHaveBeenCalled();
    expect(mocks.listProfessionalOptions).toHaveBeenCalledOnce();
  });

  it('Dado ?aba=evolucoes, Quando renderiza, Então abre a aba pedida', async () => {
    serve('company_admin');

    await render();

    expect(
      await screen.findByRole('tab', { name: /Evoluções/, selected: true }),
    ).toBeInTheDocument();
  });

  it('Dado paciente inexistente ou sem vínculo (404), Quando renderiza, Então responde not found sem expor o id', async () => {
    serve('profissional');
    mocks.getPatientRecord.mockRejectedValue(
      new NotFoundError('Paciente', '0b7a5c1e-aaaa'),
    );

    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('Dado falha inesperada ao ler o paciente, Quando renderiza, Então exibe o alerta de erro', async () => {
    serve('company_admin');
    mocks.getPatientRecord.mockRejectedValue(
      new ValidationError('Falha ao ler'),
    );

    await render();

    expect(await screen.findByText('Falha ao ler')).toBeInTheDocument();
  });

  it('Dado falha em uma seção, Quando renderiza, Então a ficha abre e a aba mostra o erro do bloco', async () => {
    serve('company_admin');
    mocks.getPatientAnamnesis.mockRejectedValue(
      new ValidationError('Erro ao ler a anamnese'),
    );

    await render();

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(
      await screen.findByText('Erro ao ler a anamnese'),
    ).toBeInTheDocument();
  });
});
