import { CalendarIntegrationSection } from '../calendar-integration-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="google-agenda">
      <CalendarIntegrationSection />
    </SettingsSectionPage>
  );
}
