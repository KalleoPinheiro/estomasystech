import { describe, expect, it } from 'vitest';
import { Anamnesis } from '@/domain/clinical/anamnesis';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleAnamnesisRepository,
  DrizzleClinicalConditionRepository,
  DrizzleConditionAssessmentRepository,
  DrizzleConditionPhotoRepository,
  DrizzleEvolutionNoteRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-clinical-repositories';
import { TEST_CIPHER as cipher } from '../support/cipher';

// Papel de sistema (clinicId nulo) lê entre empresas, mas nunca grava prontuário.
// A recusa acontece antes de qualquer acesso ao banco.
const semBanco = {} as AppDb;

describe('Feature: Papel de sistema não grava prontuário (ADR-001)', () => {
  it('Dado papel de sistema, Quando salvar anamnese, Então recusa', async () => {
    const repo = new DrizzleAnamnesisRepository(semBanco, null, cipher);
    await expect(
      repo.save(Anamnesis.create({ patientId: 'p1', allergies: 'látex' })),
    ).rejects.toThrow('Papel de sistema não pode salvar anamnese');
  });

  it('Dado papel de sistema, Quando salvar evolução SOAP, Então recusa', async () => {
    const repo = new DrizzleEvolutionNoteRepository(semBanco, null, cipher);
    await expect(
      repo.save(
        EvolutionNote.create({
          patientId: 'p1',
          subjective: 'Dor leve',
          objective: '',
          assessment: '',
          plan: '',
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar nota de evolução');
  });

  it('Dado papel de sistema, Quando salvar condição clínica, Então recusa', async () => {
    const repo = new DrizzleClinicalConditionRepository(semBanco, null, cipher);
    await expect(
      repo.save(
        ClinicalCondition.create({
          patientId: 'p1',
          kind: 'wound',
          title: 'Úlcera venosa',
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar condição clínica');
  });

  it('Dado papel de sistema, Quando salvar avaliação, Então recusa', async () => {
    const repo = new DrizzleConditionAssessmentRepository(
      semBanco,
      null,
      cipher,
    );
    await expect(
      repo.save(ConditionAssessment.create({ conditionId: 'c1' })),
    ).rejects.toThrow('Papel de sistema não pode salvar avaliação de condição');
  });

  it('Dado papel de sistema, Quando salvar foto, Então recusa', async () => {
    const repo = new DrizzleConditionPhotoRepository(semBanco, null, cipher);
    await expect(
      repo.save(
        ConditionPhoto.create({
          conditionId: 'c1',
          contentType: 'image/jpeg',
          sizeBytes: 10,
        }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar foto de condição');
  });
});
