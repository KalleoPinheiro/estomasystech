import { describe, expect, it } from 'vitest';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  buildLinkedTriageQueue,
  countLinkedTriageQueue,
} from '@/lib/server/data/triage';
import { buildPatient, buildProfessional } from '../../support/builders';
import { CLINIC_B_ID, ensureTestClinics } from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

// Clínica B isolada dos outros arquivos de teste de triagem (que usam a A).
const sessionOf = (role: Session['role'], professionalId: string | null) =>
  ({
    role,
    subject: `${role}@clinica.com`,
    clinicId: CLINIC_B_ID,
    professionalId,
  }) as unknown as Session;

async function seedPhoto(owner: ReturnType<typeof buildPatient>) {
  const repos = await getRepositories(clinicScope(CLINIC_B_ID));
  await repos.patients.save(owner);
  const condition = ClinicalCondition.create({
    patientId: owner.id,
    kind: 'wound',
    title: 'Ferida',
  });
  await repos.conditions.save(condition);
  await repos.conditionPhotos.save(
    ConditionPhoto.create({
      conditionId: condition.id,
      contentType: 'image/png',
      sizeBytes: 100,
      origin: 'patient',
      patientNote: 'olhem',
    }),
  );
}

describe('Feature: contador de triagem do casco da equipe (#549)', () => {
  it('Dado fotos de pacientes vinculados e não vinculados, Quando o profissional conta, Então conta só as vinculadas, igual ao tamanho da fila', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_B_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    const linked = buildPatient();
    await seedPhoto(linked);
    await seedPhoto(buildPatient());
    await repos.professionalPatientLinks.ensureLink(professional.id, linked.id);
    const session = sessionOf('profissional', professional.id);

    const count = await countLinkedTriageQueue(session);

    expect(count).toBe(1);
    expect(count).toBe((await buildLinkedTriageQueue(session)).length);
  });

  it('Dado o profissional sem vínculo nenhum, Quando conta, Então zero', async () => {
    await ensureTestClinics();
    await seedPhoto(buildPatient());

    expect(await countLinkedTriageQueue(sessionOf('profissional', null))).toBe(
      0,
    );
  });

  it('Dado o admin, Quando conta, Então conta todas as fotos aguardando da empresa', async () => {
    await ensureTestClinics();
    const queue = await buildLinkedTriageQueue(
      sessionOf('company_admin', null),
    );

    expect(await countLinkedTriageQueue(sessionOf('company_admin', null))).toBe(
      queue.length,
    );
    expect(queue.length).toBeGreaterThan(0);
  });
});
