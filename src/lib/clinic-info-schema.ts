import { z } from 'zod';

/**
 * Corpo da edição dos dados cadastrais — o mesmo para a tela de Configurações
 * (`company_admin`) e para a plataforma (super_admin). Formato de CNPJ e de
 * e-mail é regra do domínio (`Clinic.updateInfo`), não daqui.
 */
export const clinicInfoChangesSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cnpj: z.string().max(30).nullish(),
  address: z.string().max(300).nullish(),
  city: z.string().max(120).nullish(),
  professionalName: z.string().max(200).nullish(),
  professionalRegistry: z.string().max(60).nullish(),
  contactPhone: z.string().max(50).nullish(),
  contactEmail: z.string().max(200).nullish(),
  // Encarregado pelos dados (#216, ADR-030); a regra de tamanho é do domínio.
  dpoName: z.string().max(1000).nullish(),
  dpoContact: z.string().max(1000).nullish(),
});
