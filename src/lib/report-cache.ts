import type { MonthlyReport } from '@/application/reports/get-monthly-report';

/**
 * Mês 100% no passado é imutável — recalcular o agregado inteiro a cada acesso
 * é desperdício (CONS2-11). Cache em memória por processo, bounded pelo nº de
 * meses de história; mês corrente nunca entra (CONS2-12). Para múltiplas
 * réplicas (era SaaS), trocar por cache compartilhado — anotado na Fase 6.
 */
/**
 * Limite real: o parâmetro `month` é livre (`0001-01`…`9999-12`), então sem teto
 * o cache cresceria com requisições arbitrárias. 240 meses = 20 anos de
 * histórico, muito além do uso real da clínica. Teto é por entrada (empresa ×
 * mês), compartilhado entre empresas. Descarta o mais antigo (FIFO).
 */
const MAX_CACHED_MONTHS = 240;

const closedMonthCache = new Map<string, MonthlyReport>();

/**
 * Chave inclui a empresa: sem ela, a primeira clínica a abrir um mês encerrado
 * definia o relatório servido a todas as outras. `null` = papel de sistema
 * (visão cross-empresa), com entrada própria.
 */
const cacheKeyFor = (clinicId: string | null, month: string): string =>
  `${clinicId ?? 'system'}:${month}`;

export function getCachedReport(
  clinicId: string | null,
  month: string,
): MonthlyReport | undefined {
  return closedMonthCache.get(cacheKeyFor(clinicId, month));
}

export function cacheReport(
  clinicId: string | null,
  month: string,
  report: MonthlyReport,
): void {
  if (closedMonthCache.size >= MAX_CACHED_MONTHS) {
    const oldest = closedMonthCache.keys().next();
    if (!oldest.done) {
      closedMonthCache.delete(oldest.value);
    }
  }
  closedMonthCache.set(cacheKeyFor(clinicId, month), report);
}

/** Uso em testes. */
export function clearReportCache(): void {
  closedMonthCache.clear();
}
