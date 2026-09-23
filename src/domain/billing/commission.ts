import type { InvoiceStatus } from './invoice';

/**
 * Regra de repasse ao profissional (decisão de negócio de 2026-09-23):
 *
 * - **Apurada na produção, liberada no recebimento.** A comissão nasce quando a
 *   sessão é realizada (competência), mas só entra no repasse quando a fatura
 *   que a cobre é paga.
 * - **Fatura cancelada** → sessão não gera receita nem comissão.
 * - **Inadimplência não é do profissional:** fatura pendente há mais de
 *   `OVERDUE_RELEASE_DAYS` (contados do vencimento, ou da emissão sem
 *   vencimento) libera a comissão mesmo sem pagamento — cobrar é da clínica.
 * - **Sessão de pacote** vale preço do pacote ÷ sessões (não o preço cheio do
 *   procedimento, que contava a receita duas vezes). O desconto do pacote é
 *   dividido proporcionalmente; a liberação segue a fatura da venda do pacote.
 * - **Pacote cortesia** (preço zero): receita zero, mas a comissão é sobre o
 *   preço normal da sessão e já liberada — a cortesia é custo de marketing da
 *   clínica, não trabalho gratuito do profissional.
 */
export const OVERDUE_RELEASE_DAYS = 60;

const MS_PER_DAY = 86_400_000;

export type CommissionRelease = 'released' | 'pending' | 'void';

/** Fatura relevante para a liberação; `null` = sem fatura vinculada. */
export interface BillingRef {
  status: InvoiceStatus;
  issuedAt: Date;
  dueDate: Date | null;
}

export interface PackageRef {
  priceCents: number;
  totalSessions: number;
  /** Fatura da venda do pacote; `null` em pacotes anteriores ao vínculo. */
  invoice: BillingRef | null;
}

/** Sessão (consulta concluída) produzida no período. */
export interface ProducedSession {
  appointmentId: string;
  professionalId: string | null;
  procedure: string;
  /** Preço da consulta no agendamento — o "preço normal" da sessão. */
  listPriceCents: number;
  /** Fatura da própria consulta (consultas avulsas). */
  invoice: BillingRef | null;
  /** Presente quando a sessão consumiu saldo de um pacote. */
  package: PackageRef | null;
}

export interface SessionValuation {
  /** Receita reconhecida para a clínica. */
  revenueCents: number;
  /** Base sobre a qual o percentual do profissional incide. */
  commissionBaseCents: number;
  release: CommissionRelease;
}

export function releaseFor(
  invoice: BillingRef | null,
  now: Date,
): CommissionRelease {
  // Sem fatura vinculada (histórico anterior ao vínculo): não há o que
  // aguardar — não bloqueia o repasse de trabalho já realizado.
  if (!invoice || invoice.status === 'paid') {
    return 'released';
  }
  if (invoice.status === 'cancelled') {
    return 'void';
  }
  const reference = invoice.dueDate ?? invoice.issuedAt;
  const overdueDays = (now.getTime() - reference.getTime()) / MS_PER_DAY;
  return overdueDays >= OVERDUE_RELEASE_DAYS ? 'released' : 'pending';
}

function valuePackageSession(
  session: ProducedSession,
  pkg: PackageRef,
  now: Date,
): SessionValuation {
  if (pkg.priceCents === 0) {
    return {
      revenueCents: 0,
      commissionBaseCents: session.listPriceCents,
      release: 'released',
    };
  }
  const release = releaseFor(pkg.invoice, now);
  const unitCents =
    release === 'void' ? 0 : Math.round(pkg.priceCents / pkg.totalSessions);
  return {
    revenueCents: unitCents,
    commissionBaseCents: unitCents,
    release,
  };
}

export function valueSession(
  session: ProducedSession,
  now: Date,
): SessionValuation {
  if (session.package) {
    return valuePackageSession(session, session.package, now);
  }
  const release = releaseFor(session.invoice, now);
  const cents = release === 'void' ? 0 : session.listPriceCents;
  return { revenueCents: cents, commissionBaseCents: cents, release };
}

export function commissionCents(baseCents: number, pct: number): number {
  return Math.round((baseCents * pct) / 100);
}

/** Leitura das sessões concluídas no período, com faturas e pacote resolvidos. */
export interface ProducedSessionRepository {
  findCompletedInRange(start: Date, end: Date): Promise<ProducedSession[]>;
}
