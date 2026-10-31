import { z } from 'zod';
import {
  DATA_REQUEST_KINDS,
  MAX_DETAILS_LENGTH,
} from '@/domain/patient/data-subject-request';

/** Recusa do representante legal que pede eliminação dos dados do menor (#375). */
export const MINOR_ERASURE_AT_CLINIC_MESSAGE =
  'A eliminação dos dados do menor é pedida diretamente à clínica.';

/** Finalidade do termo (`?purpose=` nas rotas): o mesmo conjunto de `CONSENT_PURPOSES`. */
export const consentPurposeSchema = z.object({
  purpose: z.enum(['treatment', 'image']),
});

/** Pedido do titular (LGPD art. 18): a mesma entrada da rota e da Server Action. */
export const openDataRequestSchema = z.object({
  kind: z.enum(DATA_REQUEST_KINDS),
  details: z.string().max(MAX_DETAILS_LENGTH).nullish(),
});
