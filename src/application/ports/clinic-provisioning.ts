import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';

/** Repositórios da transação que cria uma clínica e o primeiro admin dela. */
export interface ClinicProvisioningScope {
  clinics: ClinicRepository;
  /** Escopado à clínica nova (`clinicId` de `run`). */
  userAccounts: UserAccountRepository;
}

/**
 * Unidade de trabalho da criação de clínica (B4, #214): a clínica e a conta do
 * primeiro `company_admin` gravam juntas ou nada grava. Separada do
 * `TransactionManager`, que nasce preso à empresa do escopo — aqui a empresa
 * ainda não existe quando os serviços são montados.
 */
export interface ClinicProvisioning {
  run<T>(
    clinicId: string,
    fn: (repos: ClinicProvisioningScope) => Promise<T>,
  ): Promise<T>;
}
