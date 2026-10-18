import type { Guardian } from './guardian';

export interface GuardianRepository {
  save(guardian: Guardian): Promise<void>;
  findById(id: string): Promise<Guardian | null>;
  /** Responsáveis dos ids dados (uma consulta); ids sem registro são omitidos. */
  findByIds(ids: readonly string[]): Promise<Guardian[]>;
  /** Nome, telefone ou e-mail contendo `search`; ordenado por nome. */
  findAll(search?: string): Promise<Guardian[]>;
  /** Remove o registro; quem chama garante que nenhum paciente aponta para ele. */
  delete(id: string): Promise<void>;
}
