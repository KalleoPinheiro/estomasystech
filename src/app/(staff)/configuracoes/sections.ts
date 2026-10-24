/**
 * Seções de Configurações (#522): cada uma é uma sub-rota `/configuracoes/<slug>`.
 * O `slug` é o mesmo id das âncoras antigas (`/configuracoes#horarios`), o que
 * torna o redirecionamento direto. `api` é a rota que o papel precisa poder
 * usar para ver a seção (mesma matriz da autorização); `null` = toda a equipe.
 */
export const SETTINGS_SECTIONS = [
  {
    slug: 'dados',
    label: 'Dados cadastrais',
    summary: 'Razão social, CNPJ e responsável técnico dos documentos.',
    api: '/api/settings/clinic-info',
  },
  {
    slug: 'identidade',
    label: 'Identidade',
    summary: 'Logo e identidade visual da clínica.',
    api: null,
  },
  {
    slug: 'privacidade',
    label: 'Contato de privacidade',
    summary: 'Contato do encarregado de dados (LGPD).',
    api: '/api/settings/clinic-info',
  },
  {
    slug: 'horarios',
    label: 'Horários e agenda',
    summary:
      'Dias, horário de funcionamento, almoço e política de cancelamento.',
    api: '/api/settings/schedule',
  },
  {
    slug: 'feriados',
    label: 'Feriados e ausências',
    summary: 'Dias em que a agenda não atende.',
    api: null,
  },
  {
    slug: 'google-agenda',
    label: 'Google Agenda',
    summary: 'Sincronização dos agendamentos com o Google.',
    api: '/api/integrations/google-calendar',
  },
  {
    slug: 'email',
    label: 'Canal de e-mail',
    summary: 'Envio de convites, redefinições e avisos por e-mail.',
    api: '/api/settings/email-channel',
  },
  {
    slug: 'contas',
    label: 'Contas de acesso',
    summary: 'Quem entra no sistema, com qual papel.',
    api: '/api/professionals',
  },
] as const;

export type SettingsSectionSlug = (typeof SETTINGS_SECTIONS)[number]['slug'];

export function isSettingsSectionSlug(
  value: string,
): value is SettingsSectionSlug {
  return SETTINGS_SECTIONS.some((section) => section.slug === value);
}
