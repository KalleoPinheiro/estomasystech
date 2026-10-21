import type { Clinic } from './clinic';

export interface ClinicRepository {
  create(clinic: Clinic): Promise<void>;
  findById(id: string): Promise<Clinic | null>;
  /** CNPJ na forma canônica (`normalizeCnpj`). */
  findByCnpj(cnpj: string): Promise<Clinic | null>;
  /** Todas as empresas — o cron de lembretes e a plataforma listam (escopo de sistema). */
  findAll(): Promise<Clinic[]>;
  /** Grava só o cadastro — nunca o estado. */
  update(clinic: Clinic): Promise<void>;
  /**
   * Grava só o estado (`status`, `status_changed_at`, `status_changed_by`, B5, e o motivo, #251):
   * uma edição de cadastro concorrente não regrava o estado lido antes dela.
   */
  saveStatus(clinic: Clinic): Promise<void>;
  /** Grava só a marca de CNPJ pendente de correção (#355), sem regravar o cadastro. */
  saveCnpjReview(clinic: Clinic): Promise<void>;
  /** Grava só a chave da logo (#427), sem regravar o cadastro. */
  saveLogoKey(clinic: Clinic): Promise<void>;
}
