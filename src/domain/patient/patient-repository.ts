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
  /**
   * Como `findById`, mas tranca a linha (`SELECT … FOR UPDATE`) até o fim da
   * transação: serializa os fluxos do mesmo paciente que contam antes de gravar
   * (limites anti-abuso do portal, #363). Fora de transação o lock some ao fim
   * da própria leitura.
   */
  findByIdForUpdate(id: string): Promise<Patient | null>;
  findByIds(ids: string[]): Promise<Patient[]>;
  findByReferrer(partnerId: string): Promise<Patient[]>;
  /** Pacientes ligados a um responsável (#329); base da regra de exclusão. */
  findByGuardian(guardianId: string): Promise<Patient[]>;
  /**
   * Pacientes ativos ligados a estes responsáveis, nascidos até `birthCutoff`
   * (já maiores de idade), sem o acesso encerrado e sem a clínica ter decidido
   * mantê-lo (#372). Base do aviso de maioridade.
   */
  findAdultsAwaitingMajorityReview(
    guardianIds: string[],
    birthCutoff: Date,
  ): Promise<Patient[]>;
  findAll(search?: string, page?: PatientPage): Promise<Patient[]>;
  /** Empresa dona do registro — usado pelo acesso cross-empresa do papel de sistema para auditar. */
  findClinicIdById(id: string): Promise<string | null>;
}
