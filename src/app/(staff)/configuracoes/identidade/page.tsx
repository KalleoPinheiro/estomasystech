import { IdentitySection } from '../identity-section';
import { SettingsSectionPage } from '../section-page';
import { LogoIfClinicAdmin } from './logo-if-clinic-admin';

export default function Page() {
  return (
    <SettingsSectionPage slug="identidade">
      <LogoIfClinicAdmin />
      <IdentitySection />
    </SettingsSectionPage>
  );
}
