import {
  type ConsentPurpose,
  isConsentPurpose,
} from '@/domain/consent/consent-record';
import { ValidationError } from '@/domain/shared/errors';
import {
  CONSENT_REPRESENTATIVE_TEXT,
  CONSENT_REPRESENTATIVE_TEXT_VERSION,
} from '@/lib/consent-representative-text';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';
import {
  IMAGE_CONSENT_REPRESENTATIVE_TEXT,
  IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION,
} from '@/lib/image-consent-representative-text';
import {
  IMAGE_CONSENT_TEXT,
  IMAGE_CONSENT_TEXT_VERSION,
} from '@/lib/image-consent-text';

interface ConsentDocument {
  template: string;
  version: string;
  /** Mesma autorização redigida em nome do representante legal (#469). */
  representativeTemplate: string;
  representativeVersion: string;
}

/** Texto-base e versão vigentes de cada termo do paciente (#216, ADR-030). */
export const CONSENT_DOCUMENTS: Record<ConsentPurpose, ConsentDocument> = {
  treatment: {
    template: CONSENT_TEXT,
    version: CONSENT_TEXT_VERSION,
    representativeTemplate: CONSENT_REPRESENTATIVE_TEXT,
    representativeVersion: CONSENT_REPRESENTATIVE_TEXT_VERSION,
  },
  image: {
    template: IMAGE_CONSENT_TEXT,
    version: IMAGE_CONSENT_TEXT_VERSION,
    representativeTemplate: IMAGE_CONSENT_REPRESENTATIVE_TEXT,
    representativeVersion: IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION,
  },
};

/** Textos-base que cobrem o aceite: o do próprio paciente e o do representante. */
export const acceptedTemplates = (document: ConsentDocument): string[] => [
  document.template,
  document.representativeTemplate,
];

/** `?purpose=` das rotas de consentimento: ausente vale `treatment`; outro valor é `400`. */
export function consentPurposeFrom(url: URL): ConsentPurpose {
  const raw = url.searchParams.get('purpose');
  if (raw === null) return 'treatment';
  if (!isConsentPurpose(raw)) {
    throw new ValidationError('Finalidade do consentimento inválida');
  }
  return raw;
}
