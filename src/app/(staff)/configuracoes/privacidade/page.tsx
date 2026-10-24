import { PrivacyContactSection } from '../privacy-contact-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="privacidade">
      <PrivacyContactSection />
    </SettingsSectionPage>
  );
}
