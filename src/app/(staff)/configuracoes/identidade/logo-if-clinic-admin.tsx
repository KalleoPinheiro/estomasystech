'use client';

import { useStaffAccess } from '@/lib/staff-access';
import { LogoSection } from '../logo-section';

/** O logo só é editável por quem edita os dados cadastrais (mesma regra de antes). */
export function LogoIfClinicAdmin() {
  const can = useStaffAccess();
  return can('/api/settings/clinic-info') ? <LogoSection /> : null;
}
