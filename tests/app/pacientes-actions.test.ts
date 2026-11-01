import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Partner } from '@/domain/partner/partner';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildProfessional } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string = CLINIC_A_ID,
  professionalId: string | null = null,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
    professionalId,
  );
};

const actions = () => import('@/app/(staff)/pacientes/actions');

const newPatient = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Ana Lima',
  email: 'ana@example.com',
  phone: '+5511977776666',
  ...overrides,
});

const auditOf = async (resourceId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
  return (await auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );
};

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: cadastro de paciente como Server Action (#549)', () => {
  it('Dado que não há sessão, Quando cadastra, Então responde Não autenticado e nada é gravado', async () => {
    const { createPatient } = await actions();

    const result = await createPatient(newPatient({ fullName: 'Sem Sessão' }));

    expect(result.error).toBe('Não autenticado');
    const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(await patients.findAll('Sem Sessão')).toHaveLength(0);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it.each(['patient', 'partner'] as const)(
    'Dado o papel de portal %s, Quando cadastra, Então é recusado e nada é gravado',
    async (role) => {
      signIn(role);
      const { createPatient } = await actions();

      const result = await createPatient(newPatient({ fullName: 'Portal' }));

      expect(result.success).toBe(false);
      const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
      expect(await patients.findAll('Portal')).toHaveLength(0);
    },
  );

  it('Dado a atendente, Quando cadastra, Então grava na empresa dela, audita sem dado clínico e atualiza a tela', async () => {
    signIn('atendente');
    const { createPatient } = await actions();

    const result = await createPatient(newPatient());

    expect(result.success).toBe(true);
    const created = result.data;
    expect(created?.fullName).toBe('Ana Lima');
    const { patients } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(await patients.findById(created?.id as string)).not.toBeNull();
    await vi.waitFor(async () => {
      const events = await auditOf(created?.id as string);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'create',
        resourceType: 'patient',
        patientId: created?.id,
      });
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado a atendente da clínica A, Quando cadastra, Então a clínica B não enxerga o paciente', async () => {
    signIn('atendente');
    const { createPatient } = await actions();

    const result = await createPatient(newPatient({ fullName: 'Só da A' }));

    const clinicB = await getRepositories(clinicScope(CLINIC_B_ID));
    expect(
      await clinicB.patients.findById(result.data?.id as string),
    ).toBeNull();
  });

  it('Dado o profissional, Quando cadastra, Então ganha o vínculo com o paciente na mesma ação (R4)', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    signIn('profissional', CLINIC_A_ID, professional.id);
    const { createPatient } = await actions();

    const result = await createPatient(
      newPatient({ fullName: 'Do Profissional' }),
    );

    expect(result.success).toBe(true);
    expect(
      await repos.professionalPatientLinks.hasLink(
        professional.id,
        result.data?.id as string,
      ),
    ).toBe(true);
  });

  it('Dado que a atendente cadastra, Quando não é profissional, Então nenhum vínculo é criado', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    signIn('atendente');
    const { createPatient } = await actions();

    const result = await createPatient(newPatient({ fullName: 'Sem Vínculo' }));

    expect(
      await repos.professionalPatientLinks.hasLink(
        professional.id,
        result.data?.id as string,
      ),
    ).toBe(false);
  });

  it('Dado o profissional, Quando tenta cadastrar já com responsável, Então é recusado (só Admin e Atendente gerenciam responsáveis)', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    signIn('profissional', CLINIC_A_ID, professional.id);
    const { createPatient } = await actions();

    const result = await createPatient(
      newPatient({ fullName: 'Com Responsável', guardianId: 'g-1' }),
    );

    expect(result.success).toBe(false);
    expect(await repos.patients.findAll('Com Responsável')).toHaveLength(0);
  });

  it('Dado um parceiro de outra clínica, Quando indica na indicação, Então a ação recusa e nada é gravado', async () => {
    const other = await getRepositories(clinicScope(CLINIC_B_ID));
    const partner = Partner.create({
      fullName: 'Parceiro B',
      email: 'b@parceiro.com',
      phone: '11999990000',
    });
    await other.partners.save(partner);
    signIn('atendente');
    const { createPatient } = await actions();

    const result = await createPatient(
      newPatient({ fullName: 'Indicado', referredByPartnerId: partner.id }),
    );

    expect(result.success).toBe(false);
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(await repos.patients.findAll('Indicado')).toHaveLength(0);
  });

  it('Dado CPF inválido, Quando cadastra, Então responde o motivo e não grava nem atualiza a tela', async () => {
    signIn('atendente');
    const { createPatient } = await actions();

    const result = await createPatient(
      newPatient({ fullName: 'CPF Ruim', cpf: '529.982.247-24' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CPF/);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado corpo sem nome, Quando cadastra, Então a validação recusa antes de gravar', async () => {
    signIn('atendente');
    const { createPatient } = await actions();

    const result = await createPatient({ ...newPatient(), fullName: '' });

    expect(result.success).toBe(false);
  });
});
