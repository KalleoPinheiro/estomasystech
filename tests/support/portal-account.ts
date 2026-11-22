import { UserAccount } from '@/domain/auth/user-account';
import {
  currentBlindIndex,
  currentDataCipher,
  getRepositories,
} from '@/infrastructure/container';
import { loginEmailHash } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
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
  // O e-mail do paciente está cifrado no banco (ADR-096): decifra em JS.
  const cipher = currentDataCipher();
  const blindIndex = currentBlindIndex();
  const select = async (query: ReturnType<typeof sql>) =>
    (
      (await db.execute(query)) as unknown as {
        rows: { id: string; clinic_id: string; email: string }[];
      }
    ).rows;
  const records = [
    ...(
      await select(
        sql`SELECT id, clinic_id, email FROM patients WHERE email IS NOT NULL`,
      )
    ).map((row) => ({ ...row, role: 'patient' as const })),
    ...(
      await select(
        sql`SELECT id, clinic_id, email FROM partners WHERE email IS NOT NULL`,
      )
    ).map((row) => ({ ...row, role: 'partner' as const })),
  ];
  for (const row of records) {
    // Conta como a aplicação grava (ADR-111): e-mail cifrado e índice cego real,
    // para o login achar a conta só pelo hash depois da contração (0091).
    const email = cipher.decrypt(row.email).toLowerCase();
    const emailHash = loginEmailHash(blindIndex, email);
    if (emailHash === null) continue;
    await db.execute(sql`
      INSERT INTO user_accounts (id, clinic_id, email, email_hash, password_hash, role, patient_id, partner_id, active, created_at)
      SELECT gen_random_uuid()::text, ${row.clinic_id}, ${cipher.encrypt(email)}, ${emailHash}, ${UNSET_PASSWORD_HASH}, ${row.role},
        ${row.role === 'patient' ? row.id : null}, ${row.role === 'partner' ? row.id : null}, true, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM user_accounts ua
        WHERE ua.clinic_id = ${row.clinic_id} AND ua.email_hash = ${emailHash}
      )`);
  }
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
