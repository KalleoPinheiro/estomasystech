import { vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';

/**
 * Dublê da camada de dados e das ações de Profissionais e Parceiros (#550). As
 * telas agora leem no servidor e gravam por Server Action, então os testes de
 * página trocam o `fetch('/api/...')` de antes por estas funções: os mesmos
 * cenários, o mesmo vocabulário de opções.
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

export const equipe = {
  session: {
    role: 'company_admin' as UserRole,
    subject: 'admin@clinica.com',
    professionalId: null as string | null,
  },
  requireStaffPageFor: vi.fn(),
  listPartnersFor: vi.fn(),
  listProfessionalsFor: vi.fn(),
  createPartner: vi.fn(),
  updatePartner: vi.fn(),
  createProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  saveAvailability: vi.fn(),
  reset() {
    const fns = [
      this.requireStaffPageFor,
      this.listPartnersFor,
      this.listProfessionalsFor,
      this.createPartner,
      this.updatePartner,
      this.createProfessional,
      this.updateProfessional,
      this.saveAvailability,
    ];
    for (const fn of fns) fn.mockReset();
    this.requireStaffPageFor.mockResolvedValue(this.session);
    for (const fn of fns.slice(3)) fn.mockResolvedValue(actionOk(null));
  },
};
