import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: vi.fn() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string = CLINIC_A_ID,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
  );
};

const actions = () =>
  import('@/app/(staff)/configuracoes/diagnosticos/diagnosis-actions');
const catalogOf = async (clinicId: string) =>
  (await getRepositories(clinicScope(clinicId))).clinicDiagnoses.list();
const auditOf = async (resourceId: string) =>
  (
    await (
      await getRepositories(clinicScope(CLINIC_A_ID))
    ).auditEvents.findAll()
  ).filter(
    (event) =>
      event.resourceType === 'clinic_nursing_diagnosis' &&
      event.resourceId === resourceId,
  );

let counter = 0;
const unique = (label: string) => `${label} ${Date.now()}-${counter++}`;

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
});

describe('Feature: ações do catálogo de diagnósticos da clínica (#954)', () => {
  it('Dado o Admin de Empresa, Quando cadastra, Então grava na empresa dele com trilha', async () => {
    signIn('company_admin');
    const { createClinicDiagnosis } = await actions();
    const label = unique('Dor aguda');

    const result = await createClinicDiagnosis({ label, code: '00132' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({ label, code: '00132', active: true });
    expect(
      (await catalogOf(CLINIC_A_ID)).some((d) => d.id === result.data.id),
    ).toBe(true);
    expect(
      (await catalogOf(CLINIC_B_ID)).some((d) => d.id === result.data.id),
    ).toBe(false);
    expect(await auditOf(result.data.id)).toHaveLength(1);
  });

  it('Dado a Profissional, Quando cadastra, Então é barrada e nada é gravado', async () => {
    signIn('profissional');
    const { createClinicDiagnosis } = await actions();
    const label = unique('Ansiedade');

    const result = await createClinicDiagnosis({ label });

    expect(result.success).toBe(false);
    expect((await catalogOf(CLINIC_A_ID)).some((d) => d.label === label)).toBe(
      false,
    );
  });

  it('Dado um CSV, Quando importa e reenvia, Então grava uma vez, relata repetidos e audita só a importação que gravou', async () => {
    signIn('company_admin');
    const { importClinicDiagnoses } = await actions();
    const a = unique('Risco de infecção');
    const b = unique('Integridade da pele');
    const csv = `titulo;codigo\n${a};\n${b};00046\nx;12\n`;

    const first = await importClinicDiagnoses({ csv });
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data.created).toBe(2);
    expect(first.data.errors).toEqual([
      { line: 4, message: expect.stringContaining('5 dígitos') },
    ]);

    const second = await importClinicDiagnoses({ csv: `titulo\n${a}\n` });
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data).toMatchObject({
      created: 0,
      duplicates: [{ line: 2 }],
    });
    expect(await auditOf('importacao-csv')).not.toHaveLength(0);
  });

  it('Dado item cadastrado, Quando desativa e reativa, Então o estado muda com trilha', async () => {
    signIn('company_admin');
    const { createClinicDiagnosis, setClinicDiagnosisActive } = await actions();
    const created = await createClinicDiagnosis({ label: unique('Fadiga') });
    if (!created.success) throw new Error(created.error);

    const off = await setClinicDiagnosisActive({
      id: created.data.id,
      active: false,
    });
    const on = await setClinicDiagnosisActive({
      id: created.data.id,
      active: true,
    });

    expect(off.success && off.data.active).toBe(false);
    expect(on.success && on.data.active).toBe(true);
    expect(await auditOf(created.data.id)).toHaveLength(3);
  });

  it('Dado item de outra empresa, Quando desativa, Então não encontra', async () => {
    signIn('company_admin', CLINIC_B_ID);
    const { createClinicDiagnosis, setClinicDiagnosisActive } = await actions();
    const created = await createClinicDiagnosis({ label: unique('Náusea') });
    if (!created.success) throw new Error(created.error);

    signIn('company_admin', CLINIC_A_ID);
    const result = await setClinicDiagnosisActive({
      id: created.data.id,
      active: false,
    });

    expect(result.success).toBe(false);
  });
});
