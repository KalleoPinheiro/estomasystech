import { describe, expect, it } from 'vitest';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildTriageQueue } from '@/lib/server/data/triage';
import { buildPatient } from '../../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const admin = {
  role: 'company_admin',
  email: 'a@clinica.com',
  clinicId: CLINIC_A_ID,
  professionalId: null,
} as Session;

const woundScore = {
  lengthMm: 10,
  widthMm: 10,
  exudate: 'low' as const,
  tissueType: 'granulation',
};
const detFull = {
  detDiscolorationArea: 1,
  detDiscolorationSeverity: 1,
  detErosionArea: 1,
  detErosionSeverity: 1,
  detOvergrowthArea: 1,
  detOvergrowthSeverity: 1,
};

describe('Feature: fila de triagem lida no servidor (O4.2, ADR-063, #548)', () => {
  it('Dado fotos de ferida e de estomia com avaliações, Quando monta a fila, Então traz o último escore, o alerta de infecção e esconde o que o filtro R4 recusa', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = buildPatient({ fullName: 'Paciente Fila' });
    const hidden = buildPatient({ fullName: 'Paciente Oculto' });
    await repos.patients.save(patient);
    await repos.patients.save(hidden);

    const make = async (
      owner: typeof patient,
      kind: 'wound' | 'stoma',
      title: string,
    ) => {
      const condition = ClinicalCondition.create({
        patientId: owner.id,
        kind,
        title,
        ...(kind === 'stoma' ? { stomaType: 'colostomia' as const } : {}),
      });
      await repos.conditions.save(condition);
      const photo = ConditionPhoto.create({
        conditionId: condition.id,
        contentType: 'image/png',
        sizeBytes: 100,
        origin: 'patient',
        patientNote: title,
      });
      await repos.conditionPhotos.save(photo);
      return { condition, photo };
    };

    const wound = await make(patient, 'wound', 'Ferida A');
    const stoma = await make(patient, 'stoma', 'Estomia B');
    const woundNoScore = await make(patient, 'wound', 'Ferida C');
    const stomaNoScore = await make(patient, 'stoma', 'Estomia D');
    const noAssessment = await make(patient, 'wound', 'Ferida E');
    await make(hidden, 'wound', 'Ferida Oculta');

    const old = ConditionAssessment.restore({
      id: 'avaliacao-antiga',
      conditionId: wound.condition.id,
      ...woundScore,
      infectionLevel: 'systemic',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await repos.assessments.save(old);
    await repos.assessments.save(
      ConditionAssessment.create({
        conditionId: wound.condition.id,
        ...woundScore,
        infectionLevel: 'local',
      }),
    );
    await repos.assessments.save(
      ConditionAssessment.create({
        conditionId: stoma.condition.id,
        ...detFull,
        infectionLevel: 'none',
      }),
    );
    await repos.assessments.save(
      ConditionAssessment.create({ conditionId: woundNoScore.condition.id }),
    );
    await repos.assessments.save(
      ConditionAssessment.create({ conditionId: stomaNoScore.condition.id }),
    );

    const queue = await buildTriageQueue(admin, (id) => id === patient.id);
    const byTitle = new Map(queue.map((item) => [item.conditionTitle, item]));

    expect(byTitle.has('Ferida Oculta')).toBe(false);
    expect(byTitle.get('Ferida A')?.latestScore?.kind).toBe('push');
    expect(byTitle.get('Ferida A')?.infectionAlert).toBe('local');
    expect(byTitle.get('Estomia B')?.latestScore).toEqual({
      kind: 'det',
      value: 6,
    });
    expect(byTitle.get('Estomia B')?.infectionAlert).toBeNull();
    expect(byTitle.get('Ferida C')?.latestScore).toBeNull();
    expect(byTitle.get('Estomia D')?.latestScore).toBeNull();
    expect(byTitle.get(noAssessment.condition.title)?.latestScore).toBeNull();
    expect(byTitle.get('Ferida E')?.infectionAlert).toBeNull();
  });
});
