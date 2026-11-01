import type { AuditInput } from '@/lib/audit';

/** Detalhe da trilha ao editar: `editado`, `reativado` ou `desativado`. */
export function updateAuditDetail(active: boolean | undefined): string {
  if (active === undefined) return 'editado';
  return active ? 'reativado' : 'desativado';
}

/** Evento de auditoria do cadastro; o mesmo das ações e das rotas (EQP-RN-09). */
export function createdAudit(
  resourceType: 'professional' | 'partner',
  id: string,
): AuditInput {
  return {
    action: 'create',
    resourceType,
    resourceId: id,
    detail: 'cadastrado',
  };
}

/** Evento de auditoria da edição, ativação ou desativação (EQP-RN-09). */
export function updatedAudit(
  resourceType: 'professional' | 'partner',
  id: string,
  active: boolean | undefined,
): AuditInput {
  return {
    action: 'update',
    resourceType,
    resourceId: id,
    detail: updateAuditDetail(active),
  };
}
