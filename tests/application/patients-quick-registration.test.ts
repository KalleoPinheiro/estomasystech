import { beforeEach, describe, expect, it } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import { UpdatePatient } from '@/application/patients/update-patient';
import { ValidationError } from '@/domain/shared/errors';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { toPatientDto } from '@/lib/dto';

describe('Feature: cadastro rápido na nova consulta (#972)', () => {
  let repo: InMemoryPatientRepository;

  beforeEach(() => {
    repo = new InMemoryPatientRepository();
  });

  const createQuick = (birthDate: Date | null = new Date('1970-01-02')) =>
    new CreatePatient(repo).execute({
      fullName: 'Ana Rápida',
      phone: '11988887777',
      // Campos fora do cadastro rápido são ignorados.
      email: 'ana@example.com',
      cpf: '52998224725',
      birthDate,
      quickRegistration: true,
    });

  it('Dado cadastro rápido, Então grava só os campos mínimos e marca como incompleto', async () => {
    const patient = await createQuick();

    const stored = await repo.findById(patient.id);
    expect(stored?.registrationIncomplete).toBe(true);
    expect(stored?.email).toBeNull();
    expect(stored?.cpf).toBeNull();
    expect(toPatientDto(patient).registrationIncomplete).toBe(true);
  });

  it('Dado cadastro rápido sem nascimento, Então recusa e nada é gravado', async () => {
    await expect(createQuick(null)).rejects.toThrow(ValidationError);
    expect(await repo.findAll()).toHaveLength(0);
  });

  it('Dado cadastro rápido, Quando salvar o cadastro completo, Então deixa de ser incompleto', async () => {
    const patient = await createQuick();

    const updated = await new UpdatePatient(repo).execute({
      id: patient.id,
      cpf: '52998224725',
      completeRegistration: true,
    });

    expect(updated.registrationIncomplete).toBe(false);
    expect((await repo.findById(patient.id))?.registrationIncomplete).toBe(
      false,
    );
  });

  it('Dado cadastro rápido, Quando editar sem salvar o cadastro completo, Então continua incompleto', async () => {
    const patient = await createQuick();

    const updated = await new UpdatePatient(repo).execute({
      id: patient.id,
      notes: 'vínculo',
    });

    expect(updated.registrationIncomplete).toBe(true);
  });
});
