import { Clinic } from '@/domain/clinic/clinic';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { systemScope } from '@/lib/auth/tenant-scope';

/**
 * Fixture de 2 clínicas para testes de isolamento por tenant (M2-M6).
 * Clínica A é a legada, já criada pelo backfill da migração 0019 — não recriar.
 * Clínica B é semeada sob demanda (idempotente) pelo primeiro teste que chamar
 * `ensureTestClinics`.
 */
export const CLINIC_A_ID = LEGACY_CLINIC_ID;
export const CLINIC_B_ID = 'test-clinic-b';

export async function ensureTestClinics(): Promise<void> {
  const { clinics } = await getRepositories(systemScope());
  const existing = await clinics.findById(CLINIC_B_ID);
  if (existing) {
    return;
  }
  await clinics.create(
    Clinic.restore({
      id: CLINIC_B_ID,
      name: 'Clínica B (teste)',
      createdBy: 'test-fixture',
      createdAt: new Date(),
    }),
  );
}
