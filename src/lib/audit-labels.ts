/**
 * Rótulos das trilhas de auditoria — a da clínica (`/auditoria`) e a de
 * plataforma (`/plataforma/auditoria`, B6) usam a mesma lista.
 */
export const ACTION_LABELS: Record<string, string> = {
  read: 'Leitura',
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
};

export const RESOURCE_LABELS: Record<string, string> = {
  anamnesis: 'Anamnese',
  evolution: 'Evolução',
  evolutions: 'Evoluções',
  condition: 'Condição',
  conditions: 'Condições',
  assessment: 'Avaliação',
  assessments: 'Avaliações',
  'portal-patient': 'Portal do paciente',
  'portal-partner': 'Portal do parceiro',
  photo: 'Foto',
  photos: 'Fotos',
  document: 'Documento',
  'account-password': 'Senha da conta',
  appointment: 'Consulta',
  care_plan: 'Plano de cuidado',
  care_plan_diagnosis: 'Diagnóstico do plano de cuidado',
  care_plan_intervention: 'Intervenção do plano de cuidado',
  care_plan_outcome: 'Desfecho do plano de cuidado',
  care_plans: 'Planos de cuidado',
  clinic: 'Clínica',
  'clinic-info': 'Dados da clínica',
  clinic_channel: 'Canal de e-mail',
  'clinic-status': 'Situação da clínica',
  'account-recovery': 'Recuperação de conta',
  'clinic-schedule': 'Grade de horários',
  consent: 'Consentimento',
  'partner-consent': 'Consentimento para o parceiro',
  export: 'Exportação',
  data_request: 'Pedido do titular',
  intervention_record: 'Registro de intervenção',
  outcome_evaluation: 'Avaliação de desfecho',
  patient: 'Paciente',
  guardian: 'Responsável do paciente',
  session: 'Sessão',
  taxonomy_catalog: 'Catálogo de taxonomia',
  professional: 'Profissional',
  account: 'Conta de acesso',
  invoice: 'Fatura',
  recibo: 'Recibo',
  'commission-payout': 'Repasse de comissão',
  'clinic-theme': 'Tema da clínica',
  'clinic-logo': 'Logo da clínica',
  'clinic-cnpj-review': 'Revisão do CNPJ da clínica',
  'calendar-minimization': 'Minimização da agenda',
  'guardian-acting-for': 'Responsável em nome do paciente',
  'professional-availability': 'Disponibilidade do profissional',
  retention: 'Retenção de dados',
  'schedule-closure': 'Fechamento de agenda',
  'waitlist-entry': 'Lista de espera',
};

/** Papel de quem agiu, como a trilha o grava (`system` é a retenção automática). */
export const ACTOR_ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Admin de Empresa',
  atendente: 'Atendente',
  profissional: 'Profissional',
  patient: 'Paciente',
  guardian: 'Responsável',
  partner: 'Parceiro',
  system: 'Sistema',
};

/** Códigos curtos que o servidor grava no detalhe de login, segundo fator e conta. */
const DETAIL_LABELS: Record<string, string> = {
  invalid_credentials: 'Credenciais inválidas',
  clinic_suspended: 'Clínica suspensa',
  ambiguous_credentials: 'Credenciais ambíguas entre empresas',
  mfa_required: 'Segundo fator exigido',
  mfa_enrolled: 'Segundo fator ativado',
  mfa_verified: 'Segundo fator verificado',
  mfa_invalid_code: 'Código do segundo fator inválido',
  mfa_invalid_recovery_code: 'Código de recuperação inválido',
  mfa_recovery_code_used: 'Código de recuperação usado',
  'resend-invite': 'Convite reenviado',
  'password-change': 'Troca de senha',
  'reset-mfa': 'Segundo fator redefinido',
  'reset-link': 'Link de redefinição gerado',
};

const RETENTION_COUNT_LABELS: Array<[string, string]> = [
  ['clinicalRecords', 'prontuários anonimizados'],
  ['photos', 'fotos apagadas'],
  ['auditEvents', 'eventos de auditoria apagados'],
  ['waitlistExpired', 'entradas da lista de espera vencidas'],
  ['waitlistEntries', 'entradas da lista de espera apagadas'],
  ['accounts', 'contas anonimizadas'],
  ['calendarEvents', 'eventos do Google Agenda apagados'],
];

function retentionSummary(detail: string): string {
  try {
    const counts = JSON.parse(detail) as Record<string, unknown>;
    const parts = RETENTION_COUNT_LABELS.flatMap(([key, label]) => {
      const value = counts[key];
      return typeof value === 'number' && value > 0
        ? [`${value} ${label}`]
        : [];
    });
    return parts.length > 0 ? parts.join(' · ') : 'Nada a anonimizar';
  } catch {
    return detail;
  }
}

/** Detalhe da trilha em português: códigos viram rótulo e o JSON da retenção vira resumo. */
export function formatAuditDetail(
  resourceType: string,
  detail: string | null,
): string {
  if (!detail) return '—';
  if (resourceType === 'retention') return retentionSummary(detail);
  return DETAIL_LABELS[detail] ?? detail;
}

export function formatDateTimeWithSeconds(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
