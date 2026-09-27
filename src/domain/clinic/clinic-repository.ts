import type { Clinic } from './clinic';

export interface ClinicRepository {
  create(clinic: Clinic): Promise<void>;
  findById(id: string): Promise<Clinic | null>;
  /** CNPJ na forma canônica (`normalizeCnpj`). */
  findByCnpj(cnpj: string): Promise<Clinic | null>;
  /** Todas as empresas — o cron de lembretes e a plataforma listam (escopo de sistema). */
  findAll(): Promise<Clinic[]>;
  update(clinic: Clinic): Promise<void>;
}
