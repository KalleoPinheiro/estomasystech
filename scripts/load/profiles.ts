/**
 * Perfis de carga do baseline (#222). Cada perfil descreve o volume semeado
 * por empresa e a concorrência da medição. Os números são premissas de
 * medição, não regra de negócio: o perfil `tipica` modela uma clínica de
 * estomaterapia de porte médio; o `issue` reproduz o volume citado na #222.
 */
export interface LoadProfile {
  name: string;
  clinics: number;
  professionals: number;
  patients: number;
  appointments: number;
  invoices: number;
  auditEvents: number;
  followUps: number;
  /** Usuários virtuais simultâneos (equipe + pacientes no portal). */
  users: number;
  /** Pausa média entre requisições de um mesmo usuário, em ms. */
  thinkMs: number;
}

export const PROFILES: Record<string, LoadProfile> = {
  tipica: {
    name: "tipica",
    clinics: 1,
    professionals: 5,
    patients: 2_000,
    appointments: 20_000,
    invoices: 12_000,
    auditEvents: 100_000,
    followUps: 600,
    users: 30,
    thinkMs: 2_000,
  },
  // Vários tenants no mesmo banco: o filtro por `clinic_id` deixa de ser
  // seletivo, que é onde faltam os índices compostos da #222.
  multi: {
    name: "multi",
    clinics: 20,
    professionals: 5,
    patients: 2_000,
    appointments: 20_000,
    invoices: 12_000,
    auditEvents: 100_000,
    followUps: 600,
    users: 30,
    thinkMs: 2_000,
  },
  issue: {
    name: "issue",
    clinics: 1,
    professionals: 20,
    patients: 10_000,
    appointments: 100_000,
    invoices: 60_000,
    auditEvents: 1_000_000,
    followUps: 3_000,
    users: 30,
    thinkMs: 2_000,
  },
};

export function clinicIdFor(index: number): string {
  return `load-clinic-${index}`;
}

export const LOAD_ADMIN_EMAIL = "carga-admin@load.test";
export const PORTAL_ACCOUNTS = 50;

export function portalEmail(index: number): string {
  return `paciente${index}@load.test`;
}

export function resolveProfile(name: string | undefined): LoadProfile {
  const profile = PROFILES[name ?? "tipica"];
  if (!profile) {
    throw new Error(`Perfil desconhecido "${name}". Use: ${Object.keys(PROFILES).join(", ")}`);
  }
  return profile;
}
