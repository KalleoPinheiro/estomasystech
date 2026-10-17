export const USER_ROLES = [
  'super_admin',
  'company_admin',
  'atendente',
  'profissional',
  'patient',
  'partner',
  'guardian',
] as const;

/**
 * Papel de acesso, catálogo fechado de 7 valores (ADR-003, ADR-026):
 * - super_admin: sistema, cross-empresa.
 * - company_admin: equipe, acesso total dentro da própria empresa.
 * - atendente: equipe, acesso operacional (agenda, cadastro), sem dado clínico.
 * - profissional: equipe, acesso clínico escopado dinamicamente por vínculo com paciente.
 * - patient: paciente, portal próprio.
 * - partner: parceiro, portal próprio.
 * - guardian: responsável do paciente, portal em nome do paciente (ADR-026).
 */
export type UserRole = (typeof USER_ROLES)[number];
