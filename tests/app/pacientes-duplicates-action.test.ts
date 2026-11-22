import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
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

const actions = () => import('@/app/(staff)/pacientes/actions');

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
});

/** #992: a conferência do cadastro completo, como Server Action. */
describe('Feature: possíveis repetidos no cadastro completo (#992)', () => {
  it('Dado o mesmo celular, Então devolve o paciente sem gravar nem reler a tela', async () => {
    const { patients, auditEvents } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    const existing = Patient.create({
      fullName: 'Carla Repetida',
      phone: '11977720992',
    });
    await patients.save(existing);
    const before = (await auditEvents.findAll()).length;
    cookieStore.value = sessionToken('atendente', 'rec@clinica.com');
    const { findPossibleDuplicatePatients } = await actions();

    const result = await findPossibleDuplicatePatients({
      fullName: 'Outra Pessoa',
      phone: '(11) 97772-0992',
      birthDate: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.map((p) => p.id)).toEqual([existing.id]);
    expect((await auditEvents.findAll()).length).toBe(before);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado sem sessão, Então recusa', async () => {
    const { findPossibleDuplicatePatients } = await actions();
    const result = await findPossibleDuplicatePatients({
      fullName: 'x',
      phone: '11977720992',
    });
    expect(result.success).toBe(false);
  });
});
