import type { Patient } from './patient';

export interface PatientPage {
  limit?: number;
  /** Cursor opaco (issue #75) — retoma após o último item da página anterior. */
  cursor?: string;
  /** Restringe a listagem a este subconjunto de IDs (escopo dinâmico do Profissional, R4). */
  ids?: string[];
}

export interface PatientRepository {
  save(patient: Patient): Promise<void>;
  findById(id: string): Promise<Patient | null>;
  findByIds(ids: string[]): Promise<Patient[]>;
  findByReferrer(partnerId: string): Promise<Patient[]>;
  /** Pacientes ligados a um responsável (#329); base da regra de exclusão. */
  findByGuardian(guardianId: string): Promise<Patient[]>;
  findAll(search?: string, page?: PatientPage): Promise<Patient[]>;
  /** Empresa dona do registro — usado pelo acesso cross-empresa do papel de sistema para auditar. */
  findClinicIdById(id: string): Promise<string | null>;
}
