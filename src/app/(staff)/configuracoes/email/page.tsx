import { EmailChannelSection } from '../email-channel-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="email">
      <EmailChannelSection />
    </SettingsSectionPage>
  );
}
