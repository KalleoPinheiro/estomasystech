import type { UserRole } from '@/domain/auth/user-role';
import { CLINIC_STAFF_ROLES, STAFF_ROLES } from './staff-roles';

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
  | 'platform'
  | 'shared';

const SHARED_PREFIXES = ['/portal', '/api/portal', '/api/auth/logout'];

/**
 * Área do operador da plataforma (ADR-007): só o super_admin entra, e ele não
 * entra em mais nada da clínica. Classificada antes de todas as outras.
 */
const PLATFORM_PREFIXES = ['/plataforma', '/api/platform'];

/** Sub-rotas de `/api/patients/:id/*` são tratadas à parte (ver `isClinicalPatientSubroute`). */
const CLINICAL_PREFIXES = [
  '/api/conditions',
  '/api/photos',
  '/api/care-plan-diagnoses',
  '/api/care-plan-interventions',
  '/api/care-plan-outcomes',
  '/api/care-plans',
  // Busca NANDA-I/NOC/NIC da SAE (#189): catálogo global só de leitura, usado
  // pelo prontuário. A importação é ato de plataforma
  // (`/api/platform/taxonomy/import`, ADR-007).
  '/api/taxonomy',
];

const PATIENT_RECORD_PREFIX = '/api/patients/';

/**
 * Fail-closed (#185): toda sub-rota de `/api/patients/:id/*` é clínica, exceto
 * as listadas aqui (primeiro segmento depois do `:id`). Hoje nenhuma é
 * operacional — `anamnesis`, `care-plans`, `conditions`, `evolutions` e
 * `export` são todas prontuário. Sub-rota nova nasce negada ao Atendente até
 * alguém decidir incluí-la nesta lista.
 */
const NON_CLINICAL_PATIENT_SUBROUTES: readonly string[] = [];

/**
 * `/api/accounts` fica de fora desta lista de propósito: a hierarquia de
 * provisionamento (RBAC-07..10) permite Atendente e Profissional cadastrarem
 * contas Patient/Partner ali — a checagem fina de "quem pode criar quem" é
 * feita pelo use-case `CreateAccount`, não pela família de rota.
 */
/*
 * Os seletores da equipe (agenda, lista de espera, autoria no prontuário) leem
 * profissionais e procedimentos por `/api/options/*`, que cai na família
 * `operational` por não estar em lista nenhuma (#188/#189) — o cadastro
 * completo, com comissão e kit, fica aqui.
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
  // Edição dos dados cadastrais da clínica (#61) — ato administrativo da
  // empresa. Camada 2 (route.ts) ainda restringe o PUT a company_admin como
  // defesa em profundidade (ADR-002).
  // A LEITURA (`/api/clinic-info`, sem "/settings/") fica de fora desta
  // lista de propósito: toda página de documento (Atestado/Relatório/Plano
  // de Cuidados/Consentimento) consulta essa rota antes de renderizar, e
  // qualquer papel de equipe pode precisar imprimir um documento — não só
  // admin (CodeRabbit, review do PR #81).
  '/api/settings/clinic-info',
  // Canal de e-mail da clínica (C3, #266): só o Admin de Empresa, que paga a
  // conta do provedor, cadastra a chave, testa e remove. O handler repete a
  // checagem (ADR-002).
  '/api/settings/email-channel',
  // Conectar a agenda do Google é ato administrativo da empresa, não operação
  // de atendimento — mesma família de /api/settings/clinic-info.
  '/api/integrations',
  // Livro de repasses da clínica: ver saldos de todos e registrar o
  // fechamento mensal é ato do Admin (decisão de 2026-09-23).
  '/api/commission-payouts',
  // Fila de pedidos do titular (#293): correção e eliminação são analisadas
  // pelo Admin de Empresa. O handler repete a checagem (ADR-002).
  '/api/data-requests',
];

/**
 * Grade da empresa (dias, horário, folga, almoço) e política/taxa de
 * cancelamento tardio (#215): só o Admin de Empresa, como os dados cadastrais.
 * Comparação EXATA — `/api/settings/schedule/closures` (feriados e ausências)
 * fica de fora e segue `operational`, com a regra por papel no caso de uso. A
 * agenda de toda a equipe lê a grade por `/api/schedule-config`.
 */
const ADMINISTRATIVE_EXACT_PATHS = ['/api/settings/schedule'];

/**
 * Dados do próprio Profissional (extrato de repasses): Admin e Profissional
 * entram; Atendente não. O handler restringe ao `professionalId` da sessão.
 */
const PROFESSIONAL_SELF_PREFIXES = ['/api/my-payouts'];

/**
 * Gerar link de redefinição de senha de outra conta é ato do Admin de Empresa
 * (C2, #265) — diferente do resto de `/api/accounts`, aberto ao Atendente e
 * ao Profissional para o cadastro de portal.
 */
const ACCOUNT_RESET_LINK = /^\/api\/accounts\/[^/]+\/reset-link$/;

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isClinicalPatientSubroute(pathname: string): boolean {
  if (!pathname.startsWith(PATIENT_RECORD_PREFIX)) {
    return false;
  }
  const [, subroute] = pathname.slice(PATIENT_RECORD_PREFIX.length).split('/');
  if (subroute === undefined) {
    return false;
  }
  return !NON_CLINICAL_PATIENT_SUBROUTES.includes(subroute);
}

export function classifyRoute(pathname: string): RouteFamily {
  if (startsWithAny(pathname, PLATFORM_PREFIXES)) {
    return 'platform';
  }
  if (startsWithAny(pathname, SHARED_PREFIXES)) {
    return 'shared';
  }
  if (
    isClinicalPatientSubroute(pathname) ||
    startsWithAny(pathname, CLINICAL_PREFIXES)
  ) {
    return 'clinical';
  }
  if (
    startsWithAny(pathname, ADMINISTRATIVE_PREFIXES) ||
    ADMINISTRATIVE_EXACT_PATHS.includes(pathname) ||
    ACCOUNT_RESET_LINK.test(pathname)
  ) {
    return 'administrative';
  }
  if (startsWithAny(pathname, PROFESSIONAL_SELF_PREFIXES)) {
    return 'professional_self';
  }
  return 'operational';
}

/**
 * O super_admin só aparece em `platform` e `shared` (logout, portal): sem
 * acesso clínico nem operacional (ADR-007, emenda ao ADR-003).
 */
const FAMILY_ALLOWED_ROLES: Record<RouteFamily, readonly UserRole[]> = {
  shared: [...STAFF_ROLES, 'patient', 'partner'],
  operational: CLINIC_STAFF_ROLES,
  clinical: ['company_admin', 'profissional'],
  administrative: ['company_admin'],
  professional_self: ['company_admin', 'profissional'],
  platform: ['super_admin'],
};

export function isFamilyAllowedForRole(
  family: RouteFamily,
  role: UserRole,
): boolean {
  return FAMILY_ALLOWED_ROLES[family].includes(role);
}
