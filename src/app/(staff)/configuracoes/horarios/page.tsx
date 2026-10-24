import { ScheduleSection } from '../schedule-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="horarios">
      <ScheduleSection />
    </SettingsSectionPage>
  );
}
