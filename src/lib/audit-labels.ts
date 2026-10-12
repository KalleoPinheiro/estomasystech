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
  session: 'Sessão',
  taxonomy_catalog: 'Catálogo de taxonomia',
  professional: 'Profissional',
  account: 'Conta de acesso',
};

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
