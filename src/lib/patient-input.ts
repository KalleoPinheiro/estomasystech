import { z } from 'zod';

/** Corpo do cadastro de paciente: o mesmo na rota `POST /api/patients` e na Server Action. */
export const createPatientSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().max(200).nullish(),
  phone: z.string().min(1).max(50),
  cpf: z.string().max(20).nullish(),
  // AAAA-MM-DD (o formulário) ou ISO com hora (clientes antigos); ambos viram meia-noite UTC.
  birthDate: z.union([z.iso.date(), z.iso.datetime()]).nullish(),
  notes: z.string().max(5000).nullish(),
  referredByPartnerId: z.string().max(100).nullish(),
  guardianId: z.string().max(100).nullish(),
});
