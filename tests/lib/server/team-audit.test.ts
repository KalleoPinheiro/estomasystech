import { describe, expect, it } from 'vitest';
import {
  createdAudit,
  updateAuditDetail,
  updatedAudit,
} from '@/lib/server/team-audit';

/**
 * #640 / EQP-RN-09: o evento de auditoria de Profissionais e Parceiros é o
 * mesmo nas Server Actions e nas rotas; estes valores são o contrato da trilha.
 */
describe('Feature: eventos de auditoria de Profissionais e Parceiros', () => {
  it.each([['professional'], ['partner']] as const)(
    'Dado cadastro de %s, Quando monta o evento, Então é «create» com detalhe «cadastrado»',
    (type) => {
      expect(createdAudit(type, 'id-1')).toEqual({
        action: 'create',
        resourceType: type,
        resourceId: 'id-1',
        detail: 'cadastrado',
      });
    },
  );

  it.each([['professional'], ['partner']] as const)(
    'Dada edição de %s, Quando monta o evento, Então é «update» sobre o mesmo recurso',
    (type) => {
      expect(updatedAudit(type, 'id-2', undefined)).toEqual({
        action: 'update',
        resourceType: type,
        resourceId: 'id-2',
        detail: 'editado',
      });
    },
  );

  it('Dado o campo ativo, Quando muda o cadastro, Então o detalhe diz editado, reativado ou desativado', () => {
    expect(updateAuditDetail(undefined)).toBe('editado');
    expect(updateAuditDetail(true)).toBe('reativado');
    expect(updateAuditDetail(false)).toBe('desativado');
    expect(updatedAudit('partner', 'x', true).detail).toBe('reativado');
    expect(updatedAudit('partner', 'x', false).detail).toBe('desativado');
  });
});
