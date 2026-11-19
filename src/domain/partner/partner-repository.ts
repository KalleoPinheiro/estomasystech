import type { Partner } from './partner';

export interface PartnerRepository {
  save(partner: Partner): Promise<void>;
  findById(id: string): Promise<Partner | null>;
  findByEmail(email: string): Promise<Partner | null>;
  findAll(): Promise<Partner[]>;
  /**
   * Marca o mês `AAAA-MM` do relatório se ainda não era esse mês.
   * `false` quando o parceiro não existe ou o mês já estava gravado
   * (a outra execução ganhou). Papel de sistema recusa.
   */
  claimMonthlyReport(partnerId: string, monthKey: string): Promise<boolean>;
  /**
   * Solta a marca desse mês para o envio poder tentar de novo.
   * Mês diferente do gravado não apaga. Papel de sistema recusa.
   */
  releaseMonthlyReport(partnerId: string, monthKey: string): Promise<void>;
}
