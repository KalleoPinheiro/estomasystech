import { Procedure } from '@/domain/catalog/procedure';
import type { ProcedureRepository } from '@/domain/catalog/procedure-repository';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

export interface ProcedureInput {
  name: string;
  priceCents: number;
  durationMinutes: number;
}

export interface ProcedureChange extends Partial<ProcedureInput> {
  active?: boolean;
}

const duplicateName = (name: string) =>
  new ValidationError(`Já existe procedimento com o nome "${name}"`);

/** Cadastra o procedimento; nome repetido na empresa é recusado. */
export async function createProcedureRecord(
  procedures: ProcedureRepository,
  input: ProcedureInput,
): Promise<Procedure> {
  const existing = await procedures.findByName(input.name);
  if (existing) throw duplicateName(existing.name);
  const procedure = Procedure.create(input);
  await procedures.save(procedure);
  return procedure;
}

/** Edita, ativa ou desativa; a regra é a mesma da rota `PATCH /api/procedures/:id`. */
export async function updateProcedureRecord(
  procedures: ProcedureRepository,
  id: string,
  change: ProcedureChange,
): Promise<Procedure> {
  const existing = await procedures.findById(id);
  if (!existing) throw new NotFoundError('Procedimento', id);
  if (change.name) {
    const sameName = await procedures.findByName(change.name);
    if (sameName && sameName.id !== id) throw duplicateName(sameName.name);
  }
  let updated = existing.update({
    name: change.name,
    priceCents: change.priceCents,
    durationMinutes: change.durationMinutes,
  });
  if (change.active === true) updated = updated.reactivate();
  if (change.active === false) updated = updated.deactivate();
  await procedures.save(updated);
  return updated;
}
