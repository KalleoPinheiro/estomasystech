import {
  type ConsentPurpose,
  isConsentPurpose,
} from '@/domain/consent/consent-record';
import { ValidationError } from '@/domain/shared/errors';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';
import {
  IMAGE_CONSENT_TEXT,
  IMAGE_CONSENT_TEXT_VERSION,
} from '@/lib/image-consent-text';

/** Texto-base e versão vigentes de cada termo do paciente (#216, ADR-030). */
export const CONSENT_DOCUMENTS: Record<
  ConsentPurpose,
  { template: string; version: string }
> = {
  treatment: { template: CONSENT_TEXT, version: CONSENT_TEXT_VERSION },
  image: { template: IMAGE_CONSENT_TEXT, version: IMAGE_CONSENT_TEXT_VERSION },
};

/** `?purpose=` das rotas de consentimento: ausente vale `treatment`; outro valor é `400`. */
export function consentPurposeFrom(url: URL): ConsentPurpose {
  const raw = url.searchParams.get('purpose');
  if (raw === null) return 'treatment';
  if (!isConsentPurpose(raw)) {
    throw new ValidationError('Finalidade do consentimento inválida');
  }
  return raw;
}
