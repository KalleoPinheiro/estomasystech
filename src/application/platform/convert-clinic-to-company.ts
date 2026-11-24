import type { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { assertCnpjAvailable, rethrowCnpjViolation } from './clinic-cnpj';

export interface ConvertClinicToCompanyInput {
  cnpj: string;
  /** Razão social; ausente mantém o nome atual. */
  name?: string | null;
}

/**
 * Autônoma que abriu CNPJ (#986): o cadastro passa a ser de clínica, com o
 * CNPJ conferido e único. Pacientes, agenda e financeiro ficam onde estão,
 * porque a empresa é a mesma. `null` = clínica inexistente.
 */
export class ConvertClinicToCompany {
  constructor(private readonly clinics: ClinicRepository) {}

  async execute(
    clinicId: string,
    input: ConvertClinicToCompanyInput,
  ): Promise<Clinic | null> {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) return null;
    const converted = clinic.convertToCompany(input);
    await assertCnpjAvailable(this.clinics, converted);
    await this.clinics.update(converted).catch(rethrowCnpjViolation);
    return converted;
  }
}
