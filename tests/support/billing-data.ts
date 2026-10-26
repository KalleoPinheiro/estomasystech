import { vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import { ValidationError } from '@/domain/shared/errors';
import type { InvoiceDto, PayoutsResponseDto, ProcedureDto } from '@/lib/dto';

/**
 * Dublê da camada de dados e das ações do Faturamento e dos Repasses (#547).
 * As telas agora leem no servidor, então os testes de página trocam o
 * `fetch('/api/...')` de antes por estas funções: os mesmos cenários, o mesmo
 * vocabulário de opções.
 */
export const billing = {
  session: {
    role: 'company_admin' as UserRole,
    subject: 'admin@clinica.com',
    professionalId: null as string | null,
  },
  refresh: vi.fn(),
  requireStaffPageFor: vi.fn(),
  listInvoicesFor: vi.fn(),
  getInvoiceSummaryFor: vi.fn(),
  listProceduresFor: vi.fn(),
  getClinicPayoutsFor: vi.fn(),
  getOwnPayoutsFor: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  sellPackage: vi.fn(),
  closePayout: vi.fn(),
  cancelPayout: vi.fn(),
};

export interface BillingDataOptions {
  role?: UserRole;
  professionalId?: string | null;
  invoices?: InvoiceDto[];
  nextCursor?: string | null;
  /** Erro ao ler a lista de faturas. */
  invoicesError?: string;
  summary?: { paidCents: number; pendingCents: number };
  procedures?: ProcedureDto[];
  payouts?: PayoutsResponseDto;
  payoutsError?: string;
}

const ok = <T>(data: T) => ({ success: true as const, data, error: null });
export const actionOk = <T>(data: T) => ok(data);
export const actionError = (error: string) => ({
  success: false as const,
  data: null,
  error,
});

/** Configura o que cada leitura do servidor devolve, ou o erro que lança. */
export function mockBillingData(options: BillingDataOptions = {}) {
  const {
    role = 'company_admin',
    professionalId = null,
    invoices = [],
    nextCursor = null,
    invoicesError,
    summary = { paidCents: 0, pendingCents: 0 },
    procedures = [],
    payouts,
    payoutsError,
  } = options;
  billing.session.role = role;
  billing.session.professionalId = professionalId;
  billing.requireStaffPageFor.mockResolvedValue(billing.session);
  billing.listInvoicesFor.mockImplementation(async () => {
    if (invoicesError) throw new ValidationError(invoicesError);
    return { invoices, nextCursor };
  });
  billing.getInvoiceSummaryFor.mockResolvedValue({
    totalInvoices: 0,
    paidCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    ...summary,
  });
  billing.listProceduresFor.mockResolvedValue(procedures);
  const payoutsRead = async () => {
    if (payoutsError) throw new ValidationError(payoutsError);
    return payouts;
  };
  billing.getClinicPayoutsFor.mockImplementation(payoutsRead);
  billing.getOwnPayoutsFor.mockImplementation(payoutsRead);
  billing.createInvoice.mockResolvedValue(ok(null));
  billing.updateInvoice.mockResolvedValue(ok(null));
  billing.sellPackage.mockResolvedValue(ok(null));
  billing.closePayout.mockResolvedValue(ok(null));
  billing.cancelPayout.mockResolvedValue(ok(null));
}

export function resetBillingData() {
  for (const value of Object.values(billing)) {
    if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
  }
}
