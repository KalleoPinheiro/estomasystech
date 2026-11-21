import { listClinicDiagnosesFor } from '@/lib/server/data/clinic-diagnoses';
import { requireStaffPageFor } from '@/lib/server/session';
import { ClinicDiagnosesSection } from '../clinic-diagnoses-section';
import { SettingsSectionPage } from '../section-page';

export default async function Page() {
  const session = await requireStaffPageFor('/configuracoes');
  const diagnoses = await listClinicDiagnosesFor(session);
  return (
    <SettingsSectionPage slug="diagnosticos">
      <ClinicDiagnosesSection diagnoses={diagnoses} />
    </SettingsSectionPage>
  );
}
