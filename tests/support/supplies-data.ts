import { vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';

/**
 * Dublê da camada de dados e das ações de Materiais (#556). A tela agora lê no
 * servidor, então os testes de página trocam o `fetch('/api/...')` de antes por
 * estas funções: os mesmos cenários, o mesmo vocabulário de opções.
 */
export const actionOk = <T>(data: T) => ({
  success: true as const,
  data,
  error: null,
});
export const actionError = (error: string) => ({
  success: false as const,
  data: null,
  error,
});

export const supplies = {
  session: {
    role: 'company_admin' as UserRole,
    subject: 'admin@clinica.com',
    professionalId: null as string | null,
  },
  requireStaffPageFor: vi.fn(),
  listSuppliesFor: vi.fn(),
  getSupplyInsightsFor: vi.fn(),
  listAppointmentsFor: vi.fn(),
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
  registerStockMovement: vi.fn(),
  reset() {
    for (const fn of [
      this.requireStaffPageFor,
      this.listSuppliesFor,
      this.getSupplyInsightsFor,
      this.listAppointmentsFor,
      this.createSupply,
      this.updateSupply,
      this.registerStockMovement,
    ]) {
      fn.mockReset();
    }
    this.requireStaffPageFor.mockResolvedValue(this.session);
    this.createSupply.mockResolvedValue(actionOk(null));
    this.updateSupply.mockResolvedValue(actionOk(null));
    this.registerStockMovement.mockResolvedValue(actionOk(null));
  },
};
