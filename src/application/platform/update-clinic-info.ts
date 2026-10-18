import type { Clinic, ClinicInfoFields } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { assertCnpjAvailable, rethrowCnpjViolation } from './clinic-cnpj';

export type ClinicInfoChanges = ClinicInfoFields & {
  name?: string;
  /** Encarregado pelos dados (#216, ADR-030); ausente preserva o valor atual. */
  dpoName?: string | null;
  dpoContact?: string | null;
};

/**
 * Edição dos dados cadastrais (Journey 6): o super_admin pela plataforma e o
 * `company_admin` pela tela de Configurações passam pela mesma regra — CNPJ
 * canônico e único, e-mail de contato válido. `null` = clínica inexistente.
 */
export class UpdateClinicInfo {
  constructor(private readonly clinics: ClinicRepository) {}

  async execute(
    clinicId: string,
    changes: ClinicInfoChanges,
  ): Promise<Clinic | null> {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) return null;
    const { dpoName, dpoContact, ...info } = changes;
    let updated = clinic.updateInfo(info);
    if (dpoName !== undefined || dpoContact !== undefined) {
      updated = updated.updatePrivacyContact({
        dpoName: dpoName === undefined ? updated.dpoName : dpoName,
        dpoContact: dpoContact === undefined ? updated.dpoContact : dpoContact,
      });
    }
    await assertCnpjAvailable(this.clinics, updated);
    await this.clinics.update(updated).catch(rethrowCnpjViolation);
    return updated;
  }
}
