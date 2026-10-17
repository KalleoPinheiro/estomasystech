import type { SessionPackage } from '@/domain/billing/package';

/**
 * Pacote como o Profissional vê no prontuário (AD-027, #296): nome e saldo de
 * sessões, sem nenhum valor monetário. Campo novo aqui exige decisão de
 * produto — o teste `package-balance-dto` trava a lista de chaves.
 */
export interface PackageBalanceDto {
  id: string;
  procedureId: string;
  procedureName?: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export const toPackageBalanceDto = (
  pkg: SessionPackage,
  procedureName?: string,
): PackageBalanceDto => ({
  id: pkg.id,
  procedureId: pkg.procedureId,
  procedureName,
  totalSessions: pkg.totalSessions,
  usedSessions: pkg.usedSessions,
  remainingSessions: pkg.remainingSessions,
  expiresAt: pkg.expiresAt?.toISOString() ?? null,
  active: pkg.isActive,
  createdAt: pkg.createdAt.toISOString(),
});
