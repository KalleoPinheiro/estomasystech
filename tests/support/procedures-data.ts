import { vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';

/**
 * Dublê da camada de dados e das ações de Procedimentos (#556). A tela agora
 * lê no servidor, então os testes de página trocam o `fetch('/api/...')` de
 * antes por estas funções: os mesmos cenários, o mesmo vocabulário de opções.
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

export const procedures = {
  session: {
    role: 'company_admin' as UserRole,
    subject: 'admin@clinica.com',
    professionalId: null as string | null,
  },
  requireStaffPageFor: vi.fn(),
  listProceduresFor: vi.fn(),
  listSuppliesFor: vi.fn(),
  createProcedure: vi.fn(),
  updateProcedure: vi.fn(),
  setProcedureKit: vi.fn(),
  reset() {
    for (const fn of [
      this.requireStaffPageFor,
      this.listProceduresFor,
      this.listSuppliesFor,
      this.createProcedure,
      this.updateProcedure,
      this.setProcedureKit,
    ]) {
      fn.mockReset();
    }
    this.requireStaffPageFor.mockResolvedValue(this.session);
    this.createProcedure.mockResolvedValue(actionOk(null));
    this.updateProcedure.mockResolvedValue(actionOk(null));
    this.setProcedureKit.mockResolvedValue(actionOk(null));
  },
};
