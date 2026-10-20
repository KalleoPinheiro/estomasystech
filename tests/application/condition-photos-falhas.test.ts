import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddConditionPhoto } from '@/application/clinical/add-condition-photo';
import { CreateCondition } from '@/application/clinical/create-condition';
import { CreatePatient } from '@/application/patients/create-patient';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionPhotoRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { logger } from '@/lib/observability/logger';

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];

describe('Feature: Foto de ferida com falhas de sanitização e de gravação (SEC1-05..08)', () => {
  let photos: InMemoryConditionPhotoRepository;
  let conditionId: string;
  let storage: PhotoStorage & { files: Map<string, Uint8Array> };
  let useCase: AddConditionPhoto;

  beforeEach(async () => {
    photos = new InMemoryConditionPhotoRepository();
    const conditions = new InMemoryClinicalConditionRepository();
    const patients = new InMemoryPatientRepository();
    const maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    conditionId = (
      await new CreateCondition(conditions, patients).execute({
        patientId: maria.id,
        kind: 'wound',
        title: 'Úlcera venosa MID',
        stomaType: null,
        startedAt: null,
        notes: null,
      })
    ).id;
    const files = new Map<string, Uint8Array>();
    storage = {
      files,
      write: async (id, data) => {
        files.set(id, data);
      },
      read: async (id) => files.get(id) ?? null,
      remove: async (id) => {
        files.delete(id);
      },
    };
    useCase = new AddConditionPhoto(photos, conditions, storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado imagem cuja limpeza de metadados falha, Quando enviar, Então avisa no log, sem dados do paciente, e grava os bytes originais', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const data = new Uint8Array(JPEG);
    Object.defineProperty(data, 'subarray', {
      value: () => {
        throw new Error('estrutura inesperada');
      },
    });

    const photo = await useCase.execute({ conditionId, data });

    expect(storage.files.get(photo.id)).toBe(data);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(conditionId);
    expect(String(warn.mock.calls[0][0])).not.toContain('Maria');
  });

  it('Dado falha ao gravar os metadados e também ao apagar o arquivo, Quando enviar, Então devolve o erro original da gravação', async () => {
    vi.spyOn(photos, 'save').mockRejectedValue(new Error('banco fora do ar'));
    vi.spyOn(storage, 'remove').mockRejectedValue(new Error('disco cheio'));

    await expect(
      useCase.execute({ conditionId, data: new Uint8Array(JPEG) }),
    ).rejects.toThrow('banco fora do ar');
  });
});
