import { beforeEach, describe, expect, it } from 'vitest';
import {
  CreateGuardian,
  DeleteGuardian,
  GetGuardian,
  GUARDIAN_IN_USE_MESSAGE,
  ListGuardians,
  UpdateGuardian,
} from '@/application/guardians/guardian-use-cases';
import { CreatePatient } from '@/application/patients/create-patient';
import { UpdatePatient } from '@/application/patients/update-patient';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const ana = {
  fullName: 'Ana Souza',
  relationship: 'filho' as const,
  phone: '11999990000',
  email: 'ana@exemplo.com',
};

describe('Feature: Responsável reutilizável entre pacientes (#329)', () => {
  let guardians: InMemoryGuardianRepository;
  let patients: InMemoryPatientRepository;

  beforeEach(() => {
    guardians = new InMemoryGuardianRepository();
    patients = new InMemoryPatientRepository();
  });

  const newPatient = (fullName: string, guardianId?: string) =>
    new CreatePatient(patients, undefined, guardians).execute({
      fullName,
      phone: '11988880000',
      guardianId,
    });

  it('Dado dois pacientes da família, Quando vincular o mesmo responsável, Então os dois apontam para ele', async () => {
    const guardian = await new CreateGuardian(guardians).execute(ana);

    const mae = await newPatient('Maria Souza', guardian.id);
    const tio = await newPatient('José Souza', guardian.id);

    expect(mae.guardianId).toBe(guardian.id);
    expect(tio.guardianId).toBe(guardian.id);
    const found = await new GetGuardian(guardians, patients).execute(
      guardian.id,
    );
    expect(found.patients.map((p) => p.fullName).sort()).toEqual([
      'José Souza',
      'Maria Souza',
    ]);
  });

  it('Dado vínculo para responsável inexistente, Quando cadastrar ou editar paciente, Então ValidationError', async () => {
    await expect(newPatient('Maria Souza', 'nao-existe')).rejects.toThrow(
      ValidationError,
    );
    const maria = await newPatient('Maria Souza');
    await expect(
      new UpdatePatient(patients, undefined, guardians).execute({
        id: maria.id,
        guardianId: 'nao-existe',
      }),
    ).rejects.toThrow('Responsável não encontrado');
  });

  it('Dado paciente vinculado, Quando atualizar sem guardianId, Então mantém; com null, desvincula', async () => {
    const guardian = await new CreateGuardian(guardians).execute(ana);
    const maria = await newPatient('Maria Souza', guardian.id);
    const update = new UpdatePatient(patients, undefined, guardians);

    const kept = await update.execute({ id: maria.id, notes: 'x' });
    expect(kept.guardianId).toBe(guardian.id);

    const unlinked = await update.execute({ id: maria.id, guardianId: null });
    expect(unlinked.guardianId).toBeNull();
  });

  it('Dado responsável ligado a paciente, Quando excluir, Então ConflictError; sem vínculo, exclui', async () => {
    const guardian = await new CreateGuardian(guardians).execute(ana);
    const maria = await newPatient('Maria Souza', guardian.id);
    const remove = new DeleteGuardian(guardians, patients);

    await expect(remove.execute(guardian.id)).rejects.toThrow(
      new ConflictError(GUARDIAN_IN_USE_MESSAGE),
    );

    await new UpdatePatient(patients, undefined, guardians).execute({
      id: maria.id,
      guardianId: null,
    });
    await remove.execute(guardian.id);

    expect(await guardians.findById(guardian.id)).toBeNull();
    await expect(remove.execute(guardian.id)).rejects.toThrow(NotFoundError);
  });

  it('Dado responsável, Quando editar, Então grava; inexistente dá NotFoundError', async () => {
    const guardian = await new CreateGuardian(guardians).execute(ana);
    const update = new UpdateGuardian(guardians);

    const updated = await update.execute({ id: guardian.id, email: null });

    expect(updated.email).toBeNull();
    expect((await guardians.findById(guardian.id))?.email).toBeNull();
    await expect(update.execute({ id: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('Dado vários responsáveis, Quando listar com busca, Então filtra por nome, telefone ou e-mail e ordena por nome', async () => {
    const create = new CreateGuardian(guardians);
    await create.execute({ ...ana, fullName: 'Zélia Costa', email: null });
    await create.execute(ana);
    const list = new ListGuardians(guardians);

    expect((await list.execute()).map((g) => g.fullName)).toEqual([
      'Ana Souza',
      'Zélia Costa',
    ]);
    expect((await list.execute('  zélia ')).map((g) => g.fullName)).toEqual([
      'Zélia Costa',
    ]);
    expect(await list.execute('ana@exemplo')).toHaveLength(1);
    expect(await list.execute('+5511999990000')).toHaveLength(2);
  });
});
