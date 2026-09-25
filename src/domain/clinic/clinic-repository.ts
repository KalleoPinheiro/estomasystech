import type { Clinic } from './clinic';

export interface ClinicRepository {
  create(clinic: Clinic): Promise<void>;
  findById(id: string): Promise<Clinic | null>;
  /** Todas as empresas — só o cron de lembretes lista (escopo de sistema). */
  findAll(): Promise<Clinic[]>;
  update(clinic: Clinic): Promise<void>;
}
