import { CreateAccount } from '@/application/auth/create-account';
import type { ClinicProvisioning } from '@/application/ports/clinic-provisioning';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { UserAccount } from '@/domain/auth/user-account';
import { Clinic, type ClinicProps } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { assertCnpjAvailable, rethrowCnpjViolation } from './clinic-cnpj';
import { PLATFORM_ACTOR } from './platform-actor';

export interface CreateClinicInput extends ClinicProps {
  /** E-mail do primeiro `company_admin`, convidado junto com a clínica. */
  adminEmail: string;
}

export interface CreatedClinic {
  clinic: Clinic;
  admin: UserAccount;
}

/**
 * Grava a auditoria da criação (#243): roda dentro da mesma transação que
 * cria a clínica e o admin, contra o repositório escopado ao `tx`. Falha aqui
 * desfaz clínica e admin junto (rollback) — antes rodava depois do commit,
 * fire-and-forget, e podia deixar a ação mais crítica do super_admin sem
 * trilha.
 */
export type RecordClinicCreationAudit = (
  auditEvents: AuditEventRepository,
  clinic: Clinic,
  admin: UserAccount,
) => Promise<void>;

/**
 * Cadastro de clínica pela plataforma (B4, #214; design "Dados obrigatórios na
 * criação"): a clínica nasce com nome, CNPJ e contato, o primeiro
 * `company_admin` nasce sem senha usável e a auditoria da criação — na mesma
 * transação (#243). O convite por e-mail fica com quem chama, depois do
 * commit: falha de envio não desfaz a clínica, mas a clínica só existe se a
 * auditoria também gravou.
 */
export class CreateClinic {
  constructor(
    private readonly clinics: ClinicRepository,
    private readonly provisioning: ClinicProvisioning,
  ) {}

  async execute(
    input: CreateClinicInput,
    recordAudit: RecordClinicCreationAudit,
  ): Promise<CreatedClinic> {
    const { adminEmail, ...registration } = input;
    const clinic = Clinic.create(registration);
    await assertCnpjAvailable(this.clinics, clinic);

    return this.provisioning
      .run(clinic.id, async ({ clinics, userAccounts, auditEvents }) => {
        await clinics.create(clinic);
        const admin = await new CreateAccount(userAccounts).execute(
          PLATFORM_ACTOR,
          {
            email: adminEmail,
            passwordHash: UNSET_PASSWORD_HASH,
            role: 'company_admin',
            clinicId: clinic.id,
          },
        );
        await recordAudit(auditEvents, clinic, admin);
        return { clinic, admin };
      })
      .catch(rethrowCnpjViolation);
  }
}
