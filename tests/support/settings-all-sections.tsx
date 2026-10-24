import { AccountsSection } from '@/app/(staff)/configuracoes/accounts-section';
import { CalendarIntegrationSection } from '@/app/(staff)/configuracoes/calendar-integration-section';
import { ClinicInfoSection } from '@/app/(staff)/configuracoes/clinic-info-section';
import { ClosuresSection } from '@/app/(staff)/configuracoes/closures-section';
import { EmailChannelSection } from '@/app/(staff)/configuracoes/email-channel-section';
import { IdentitySection } from '@/app/(staff)/configuracoes/identity-section';
import { LogoSection } from '@/app/(staff)/configuracoes/logo-section';
import { PrivacyContactSection } from '@/app/(staff)/configuracoes/privacy-contact-section';
import { ScheduleSection } from '@/app/(staff)/configuracoes/schedule-section';
import { SETTINGS_SECTIONS } from '@/app/(staff)/configuracoes/sections';
import { useStaffAccess } from '@/lib/staff-access';

/**
 * Todas as seções de Configurações numa só árvore, com o mesmo corte por papel
 * das sub-rotas (#522). Os specs de seção que antes renderizavam a página única
 * seguem exercitando o comportamento de cada seção sem depender de rota.
 */
export default function SettingsPage() {
  const can = useStaffAccess();
  const shows = (slug: string) => {
    const section = SETTINGS_SECTIONS.find((item) => item.slug === slug);
    return !section?.api || can(section.api);
  };
  return (
    <div>
      {shows('dados') && <ClinicInfoSection />}
      {can('/api/settings/clinic-info') && <LogoSection />}
      <IdentitySection />
      {shows('privacidade') && <PrivacyContactSection />}
      {shows('horarios') && <ScheduleSection />}
      <ClosuresSection />
      {shows('google-agenda') && <CalendarIntegrationSection />}
      <EmailChannelSection />
      {shows('contas') && <AccountsSection />}
    </div>
  );
}
