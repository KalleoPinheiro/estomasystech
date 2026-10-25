import { ClinicInfoSection } from '../clinic-info-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="dados">
      <ClinicInfoSection />
    </SettingsSectionPage>
  );
}
