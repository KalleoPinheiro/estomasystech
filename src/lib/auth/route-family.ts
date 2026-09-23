import type { UserRole } from '@/domain/auth/user-role';
import { STAFF_ROLES } from './staff-roles';

/**
 * Classificação grosseira de rota por família (RBAC-05), consumida por
 * `access-policy.ts` (proxy + handler) para decidir acesso sem precisar
 * conhecer `:id` de rota — a checagem fina (ex.: vínculo do Profissional com
 * um paciente específico) acontece no próprio handler (R4).
 */
export type RouteFamily =
  | 'clinical'
  | 'operational'
  | 'administrative'
  | 'professional_self'
  | 'shared';

const SHARED_PREFIXES = ['/portal', '/api/portal', '/api/auth/logout'];

/** Sub-rotas de `/api/patients/:id/*` são tratadas à parte (ver `isClinicalPatientSubroute`). */
const CLINICAL_PREFIXES = [
  '/api/conditions',
  '/api/photos',
  '/api/care-plan-diagnoses',
  '/api/care-plan-interventions',
  '/api/care-plan-outcomes',
  '/api/care-plans',
];

const CLINICAL_PATIENT_SUBROUTES = [
  '/evolutions',
  '/conditions',
  '/anamnesis',
  '/care-plans',
];

/**
 * `/api/accounts` fica de fora desta lista de propósito: a hierarquia de
 * provisionamento (RBAC-07..10) permite Atendente e Profissional cadastrarem
 * contas Patient/Partner ali — a checagem fina de "quem pode criar quem" é
 * feita pelo use-case `CreateAccount`, não pela família de rota.
 */
const ADMINISTRATIVE_PREFIXES = [
  '/api/professionals',
  '/api/supplies',
  '/api/procedures',
  '/api/invoices',
  '/api/packages',
  '/api/reports',
  '/api/summary',
  '/api/audit',
  '/api/admin',
  // Edição dos dados cadastrais da clínica (#61) — ato administrativo da
  // empresa. Camada 2 (route.ts) ainda restringe o PUT a
  // company_admin/super_admin como defesa em profundidade (ADR-002).
  // A LEITURA (`/api/clinic-info`, sem "/settings/") fica de fora desta
  // lista de propósito: toda página de documento (Atestado/Relatório/Plano
  // de Cuidados/Consentimento) consulta essa rota antes de renderizar, e
  // qualquer papel de equipe pode precisar imprimir um documento — não só
  // admin (CodeRabbit, review do PR #81).
  '/api/settings/clinic-info',
  '/api/taxonomy',
  // Conectar a agenda do Google é ato administrativo da empresa, não operação
  // de atendimento — mesma família de /api/settings/clinic-info.
  '/api/integrations',
  // Livro de repasses da clínica: ver saldos de todos e registrar o
  // fechamento mensal é ato do Admin (decisão de 2026-09-23).
  '/api/commission-payouts',
];

/**
 * Dados do próprio Profissional (extrato de repasses): Admin e Profissional
 * entram; Atendente não. O handler restringe ao `professionalId` da sessão.
 */
const PROFESSIONAL_SELF_PREFIXES = ['/api/my-payouts'];

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isClinicalPatientSubroute(pathname: string): boolean {
  if (!pathname.startsWith('/api/patients/')) {
    return false;
  }
  return CLINICAL_PATIENT_SUBROUTES.some((suffix) => pathname.includes(suffix));
}

export function classifyRoute(pathname: string): RouteFamily {
  if (startsWithAny(pathname, SHARED_PREFIXES)) {
    return 'shared';
  }
  if (
    isClinicalPatientSubroute(pathname) ||
    startsWithAny(pathname, CLINICAL_PREFIXES)
  ) {
    return 'clinical';
  }
  if (startsWithAny(pathname, ADMINISTRATIVE_PREFIXES)) {
    return 'administrative';
  }
  if (startsWithAny(pathname, PROFESSIONAL_SELF_PREFIXES)) {
    return 'professional_self';
  }
  return 'operational';
}

const FAMILY_ALLOWED_ROLES: Record<RouteFamily, readonly UserRole[]> = {
  shared: [...STAFF_ROLES, 'patient', 'partner'],
  operational: STAFF_ROLES,
  clinical: ['super_admin', 'company_admin', 'profissional'],
  administrative: ['super_admin', 'company_admin'],
  professional_self: ['super_admin', 'company_admin', 'profissional'],
};

export function isFamilyAllowedForRole(
  family: RouteFamily,
  role: UserRole,
): boolean {
  return FAMILY_ALLOWED_ROLES[family].includes(role);
}
