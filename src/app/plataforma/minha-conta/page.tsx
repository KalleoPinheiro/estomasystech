'use client';

import { OwnAccountPanel } from '@/components/own-account-panel';
import { PageHeader } from '@/components/page-header';

export default function PlatformOwnAccountPage() {
  return (
    <div>
      <PageHeader
        title="Minha conta"
        description="Troque a sua senha de operador."
      />
      <OwnAccountPanel />
    </div>
  );
}
