import { ClosuresSection } from '../closures-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="feriados">
      <ClosuresSection />
    </SettingsSectionPage>
  );
}
