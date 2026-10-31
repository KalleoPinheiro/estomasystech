import { describe, expect, it } from 'vitest';
import { AddEvolutionNote } from '@/application/clinical/add-evolution-note';
import { CreateCondition } from '@/application/clinical/create-condition';
import { OpenCarePlan } from '@/application/clinical/open-care-plan';
import { UpsertAnamnesis } from '@/application/clinical/upsert-anamnesis';
import { SessionPackage } from '@/domain/billing/package';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  getPatientAnamnesis,
  getPatientRecord,
  listPatientCarePlans,
  listPatientConditions,
  listPatientEvolutions,
  listPatientPackageBalances,
  listPatientPackagesWithPrice,
} from '@/lib/server/data/patient-record';
import {
  buildPatient,
  buildProcedure,
  buildProfessional,
} from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (
  role: Session['role'],
  clinicId: string,
  professionalId: string | null = null,
) =>
  ({
    role,
    subject: `${role}@clinica.com`,
    clinicId,
    professionalId,
  }) as unknown as Session;

async function seedPatient(clinicId: string, fullName: string) {
  await ensureTestClinics();
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient({ fullName });
  await repos.patients.save(patient);
  return { repos, patient };
}

describe('Feature: ficha do paciente lida no servidor (#552)', () => {
  it('Dado um paciente da clínica, Quando a recepção lê a ficha, Então devolve o paciente e grava a leitura na trilha', async () => {
    const { repos, patient } = await seedPatient(CLINIC_A_ID, 'Ficha Lida');

    const dto = await getPatientRecord(
      session('atendente', CLINIC_A_ID),
      patient.id,
    );

    expect(dto.fullName).toBe('Ficha Lida');
    const trail = await repos.auditEvents.findAll({ patientId: patient.id });
    expect(trail).toContainEqual(
      expect.objectContaining({ action: 'read', resourceType: 'patient' }),
    );
  });

  it('Dado paciente da clínica B, Quando a clínica A lê a ficha, Então 404 (isolamento por empresa)', async () => {
    const { patient } = await seedPatient(CLINIC_B_ID, 'Ficha Da B');

    await expect(
      getPatientRecord(session('company_admin', CLINIC_A_ID), patient.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Dado paciente sem vínculo, Quando o Profissional lê qualquer parte do prontuário, Então 404 (R4)', async () => {
    const { repos, patient } = await seedPatient(CLINIC_A_ID, 'R4 Ficha');
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    const reader = session('profissional', CLINIC_A_ID, professional.id);

    await expect(getPatientRecord(reader, patient.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      getPatientAnamnesis(reader, patient.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      listPatientConditions(reader, patient.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      listPatientPackageBalances(reader, patient.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Dado paciente vinculado, Quando o Profissional lê, Então vê anamnese e condições do paciente', async () => {
    const { repos, patient } = await seedPatient(CLINIC_A_ID, 'R4 Vinculada');
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
    await new UpsertAnamnesis(repos.anamneses, repos.patients).execute({
      patientId: patient.id,
      allergies: 'Látex',
    });
    await new CreateCondition(repos.conditions, repos.patients).execute({
      patientId: patient.id,
      kind: 'wound',
      title: 'Úlcera venosa',
      stomaType: null,
      startedAt: null,
      notes: null,
    });
    const reader = session('profissional', CLINIC_A_ID, professional.id);

    expect((await getPatientAnamnesis(reader, patient.id))?.allergies).toBe(
      'Látex',
    );
    expect(
      (await listPatientConditions(reader, patient.id)).map((c) => c.title),
    ).toEqual(['Úlcera venosa']);
  });

  it('Dado paciente sem anamnese, Quando lê, Então devolve null', async () => {
    const { patient } = await seedPatient(CLINIC_A_ID, 'Sem Anamnese');

    expect(
      await getPatientAnamnesis(
        session('company_admin', CLINIC_A_ID),
        patient.id,
      ),
    ).toBeNull();
  });

  it('Dado pacote vendido, Quando lê o saldo e a versão com valor, Então o saldo não traz preço e a outra traz', async () => {
    const { repos, patient } = await seedPatient(CLINIC_A_ID, 'Com Pacote');
    const procedure = buildProcedure({ name: 'Curativo Pacote' });
    await repos.procedures.save(procedure);
    await repos.sessionPackages.save(
      SessionPackage.create({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions: 10,
        priceCents: 50_000,
      }),
    );
    const admin = session('company_admin', CLINIC_A_ID);

    const [balance] = await listPatientPackageBalances(admin, patient.id);
    const [priced] = await listPatientPackagesWithPrice(admin, patient.id);

    expect(balance).toMatchObject({
      procedureName: 'Curativo Pacote',
      remainingSessions: 10,
    });
    expect(balance).not.toHaveProperty('priceCents');
    expect(priced.priceCents).toBe(50_000);
    expect(priced.procedureName).toBe('Curativo Pacote');
    expect(priced.expiresAt).toBeNull();
  });

  it('Dado um prontuário com anamnese, condição, evolução e plano, Quando a equipe lê cada parte, Então cada leitura entra na trilha com o recurso e o paciente (LGPD)', async () => {
    const { repos, patient } = await seedPatient(
      CLINIC_A_ID,
      'Trilha Completa',
    );
    await new UpsertAnamnesis(repos.anamneses, repos.patients).execute({
      patientId: patient.id,
      allergies: 'Látex',
    });
    await new CreateCondition(repos.conditions, repos.patients).execute({
      patientId: patient.id,
      kind: 'wound',
      title: 'Úlcera da trilha',
      stomaType: null,
      startedAt: null,
      notes: null,
    });
    await new AddEvolutionNote(repos.evolutions, repos.patients).execute({
      patientId: patient.id,
      appointmentId: null,
      professionalId: null,
      subjective: 'Dor leve',
      objective: '',
      assessment: '',
      plan: '',
    });
    await new OpenCarePlan(
      repos.carePlans,
      repos.patients,
      repos.conditions,
    ).execute({
      patientId: patient.id,
      conditionId: null,
      professionalId: null,
    });
    const admin = session('company_admin', CLINIC_A_ID);

    expect(await listPatientEvolutions(admin, patient.id)).toHaveLength(1);
    expect(await listPatientCarePlans(admin, patient.id)).toHaveLength(1);
    await getPatientAnamnesis(admin, patient.id);
    await listPatientConditions(admin, patient.id);

    const trail = await repos.auditEvents.findAll({ patientId: patient.id });
    for (const resourceType of [
      'anamnesis',
      'conditions',
      'evolutions',
      'care_plans',
    ]) {
      expect(
        trail.some(
          (event) =>
            event.action === 'read' &&
            event.resourceType === resourceType &&
            event.resourceId === patient.id &&
            event.patientId === patient.id,
        ),
        `leitura de ${resourceType} na trilha`,
      ).toBe(true);
    }
  });
});
