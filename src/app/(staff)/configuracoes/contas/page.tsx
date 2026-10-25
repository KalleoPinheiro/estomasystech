import { AccountsSection } from '../accounts-section';
import { SettingsSectionPage } from '../section-page';

export default function Page() {
  return (
    <SettingsSectionPage slug="contas">
      <AccountsSection />
    </SettingsSectionPage>
  );
}
