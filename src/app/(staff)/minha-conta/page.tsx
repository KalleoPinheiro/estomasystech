'use client';

import { OwnAccountPanel } from '@/components/own-account-panel';
import { PageHeader } from '@/components/page-header';

export default function OwnAccountPage() {
  return (
    <div>
      <PageHeader
        title="Minha conta"
        description="Troque a sua senha e cuide do segundo fator."
      />
      <OwnAccountPanel />
    </div>
  );
}
