import type { TransactionManager } from '@/application/ports/transaction-manager';
import { Invoice } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';

export interface SellSessionPackageInput {
  patientId: string;
  procedureId: string;
  totalSessions: number;
  priceCents: number;
  expiresAt?: Date | null;
}

export interface SellSessionPackageResult {
  package: SessionPackage;
  procedureName: string;
  /** null quando o pacote é cortesia (preço zero) — não há o que cobrar. */
  invoice: Invoice | null;
}

/**
 * Venda de pacote de sessões (O3.3): o pacote fatura uma única vez na venda e
 * as sessões consomem saldo. Pacote e fatura persistem juntos (unidade de
 * trabalho): antes, uma falha ao salvar a fatura deixava o pacote gravado sem
 * cobrança — sessões de graça.
 */
export class SellSessionPackage {
  constructor(
    private readonly patients: PatientRepository,
    private readonly procedures: ProcedureRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(
    input: SellSessionPackageInput,
  ): Promise<SellSessionPackageResult> {
    const [patient, procedure] = await Promise.all([
      this.patients.findById(input.patientId),
      this.procedures.findById(input.procedureId),
    ]);
    if (!patient) {
      throw new NotFoundError('Paciente', input.patientId);
    }
    if (!procedure) {
      throw new NotFoundError('Procedimento', input.procedureId);
    }

    // Tudo validado antes de qualquer escrita.
    const pkg = SessionPackage.create({
      ...input,
      expiresAt: input.expiresAt ?? null,
    });
    const invoice =
      pkg.priceCents > 0
        ? Invoice.create({
            patientId: pkg.patientId,
            appointmentId: null,
            sessionPackageId: pkg.id,
            description: `Pacote: ${procedure.name} (${pkg.totalSessions} sessões)`,
            amount: Money.fromCents(pkg.priceCents),
          })
        : null;

    await this.transactions.run(async (tx) => {
      await tx.sessionPackages.save(pkg);
      if (invoice) {
        await tx.invoices.save(invoice);
      }
    });

    return { package: pkg, procedureName: procedure.name, invoice };
  }
}
