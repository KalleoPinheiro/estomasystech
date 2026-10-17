import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';

/**
 * Conta de portal vinculada ao cadastro (#196). O portal resolve o titular
 * pela conta da sessão — sem ela, um cookie forjado para o e-mail do cadastro
 * recebe 404. Idempotente: e-mail já com conta na empresa não é recriado.
 */
export async function linkPortalAccount(input: {
  role: 'patient' | 'partner';
  email: string;
  recordId: string;
  clinicId?: string;
}): Promise<UserAccount> {
  const clinicId = input.clinicId ?? LEGACY_CLINIC_ID;
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  const existing = await userAccounts.findByEmail(input.email);
  if (existing) {
    return existing;
  }
  const account = UserAccount.create({
    email: input.email,
    passwordHash: UNSET_PASSWORD_HASH,
    role: input.role,
    clinicId,
    patientId: input.role === 'patient' ? input.recordId : null,
    partnerId: input.role === 'partner' ? input.recordId : null,
  });
  await userAccounts.save(account);
  return account;
}

/**
 * Cria, para todo cadastro de paciente/parceiro ainda sem conta, uma conta de
 * portal vinculada com o e-mail do cadastro (#196) — o equivalente, nos testes
 * de rota, às contas que a equipe cria em /configuracoes. Chame depois de
 * semear os cadastros e antes de usar um cookie de portal para o e-mail deles.
 */
export async function linkAllPortalAccounts(): Promise<void> {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  const { sql } = await import('drizzle-orm');
  const db = await getDb();
  await db.execute(sql`
    INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, patient_id, active, created_at)
    SELECT gen_random_uuid()::text, p.clinic_id, lower(p.email), ${UNSET_PASSWORD_HASH}, 'patient', p.id, true, now()
    FROM patients p
    WHERE p.email IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_accounts ua
      WHERE ua.clinic_id = p.clinic_id AND ua.email = lower(p.email)
    )`);
  await db.execute(sql`
    INSERT INTO user_accounts (id, clinic_id, email, password_hash, role, partner_id, active, created_at)
    SELECT gen_random_uuid()::text, pa.clinic_id, lower(pa.email), ${UNSET_PASSWORD_HASH}, 'partner', pa.id, true, now()
    FROM partners pa
    WHERE NOT EXISTS (
      SELECT 1 FROM user_accounts ua
      WHERE ua.clinic_id = pa.clinic_id AND ua.email = lower(pa.email)
    )`);
}

let recordCounter = 0;

/** Cadastro de paciente/parceiro para vincular uma conta de portal criada pela API (#196). */
export async function seedPortalRecord(
  role: 'patient' | 'partner',
  clinicId: string = LEGACY_CLINIC_ID,
): Promise<string> {
  recordCounter += 1;
  const { Patient } = await import('@/domain/patient/patient');
  const { Partner } = await import('@/domain/partner/partner');
  const repos = await getRepositories(clinicScope(clinicId));
  const props = {
    fullName: `Cadastro Portal ${recordCounter}`,
    email: `cadastro-portal-${recordCounter}-${Date.now()}@x.com`,
    phone: '11900000000',
  };
  if (role === 'patient') {
    const patient = Patient.create(props);
    await repos.patients.save(patient);
    return patient.id;
  }
  const partner = Partner.create(props);
  await repos.partners.save(partner);
  return partner.id;
}
