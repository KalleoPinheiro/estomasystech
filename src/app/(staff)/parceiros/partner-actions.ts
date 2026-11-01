'use server';

import { z } from 'zod';
import { CreatePartner } from '@/application/partners/create-partner';
import { UpdatePartner } from '@/application/partners/update-partner';
import { toPartnerDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import { createdAudit, updatedAudit } from '@/lib/server/team-audit';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Parceiros (#550): Server Actions com guarda de sessão e
 * papel (os mesmos da API de parceiros), `zod`, escopo de escrita e auditoria
 * na MESMA transação da gravação. A regra de e-mail único e de edição é a dos
 * casos de uso `CreatePartner`/`UpdatePartner`, a mesma das rotas.
 */

const PARTNER_ROLES = rolesWithAccessTo('/api/partners');

const partnerFields = {
  fullName: z.string().min(1).max(200),
  email: z.string().min(1).max(200).email('Email inválido'),
  phone: z.string().min(1).max(50),
  crm: z.string().max(50).nullish(),
  specialty: z.string().max(200).nullish(),
};

/** Cadastra um parceiro. */
export const createPartner = defineAction({
  access: { kind: 'staff', roles: PARTNER_ROLES },
  input: z.object(partnerFields),
  handler: async ({ input, tx }) =>
    toPartnerDto(
      await new CreatePartner(tx.partners).execute({
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        crm: input.crm ?? null,
        specialty: input.specialty ?? null,
      }),
    ),
  audit: ({ result }) => createdAudit('partner', result.id),
});

/** Edita o cadastro, ou ativa e desativa o parceiro. */
export const updatePartner = defineAction({
  access: { kind: 'staff', roles: PARTNER_ROLES },
  input: z
    .object({
      id: z.string().min(1).max(100),
      ...partnerFields,
      active: z.boolean(),
    })
    .partial({ fullName: true, email: true, phone: true, active: true }),
  handler: async ({ input, tx }) =>
    toPartnerDto(await new UpdatePartner(tx.partners).execute(input)),
  audit: ({ input, result }) =>
    updatedAudit('partner', result.id, input.active),
});
