import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { FollowUp } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient, buildProfessional } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string = CLINIC_A_ID,
  professionalId: string | null = null,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
    professionalId,
  );
};

const actions = () => import('@/app/(staff)/hoje-actions');

const seedFollowUp = async () => {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const patient = buildPatient();
  await repos.patients.save(patient);
  const followUp = FollowUp.create({
    patientId: patient.id,
    appointmentId: null,
    dueDate: new Date('2026-10-30T12:00:00Z'),
    reason: 'Retorno: avaliação de ferida',
  });
  await repos.followUps.save(followUp);
  return { repos, patient, followUp };
};

const seedPatientPhoto = async () => {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const patient = buildPatient();
  await repos.patients.save(patient);
  const condition = ClinicalCondition.create({
    patientId: patient.id,
    kind: 'wound',
    title: 'Ferida sacral',
  });
  await repos.conditions.save(condition);
  const photo = ConditionPhoto.create({
    conditionId: condition.id,
    contentType: 'image/png',
    sizeBytes: 1000,
    origin: 'patient',
    patientNote: 'olhem isto',
  });
  await repos.conditionPhotos.save(photo);
  return { repos, patient, photo };
};

const auditOf = async (resourceId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
  return (await auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );
};

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: ações rápidas da tela Hoje (#548)', () => {
  it('Dado que não há sessão, Quando conclui um retorno, Então responde Não autenticado e nada muda', async () => {
    const { repos, followUp } = await seedFollowUp();
    const { resolveFollowUp } = await actions();

    const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

    expect(result.error).toBe('Não autenticado');
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
    expect(refreshed).not.toHaveBeenCalled();
  });

  it.each(['patient', 'partner'] as const)(
    'Dado o papel %s, Quando conclui um retorno, Então é recusado e nada é gravado',
    async (role) => {
      const { repos, followUp } = await seedFollowUp();
      signIn(role);
      const { resolveFollowUp } = await actions();

      const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

      expect(result.success).toBe(false);
      expect((await repos.followUps.findById(followUp.id))?.status).toBe(
        'pending',
      );
      expect(await auditOf(followUp.id)).toHaveLength(0);
    },
  );

  it('Dado a atendente, Quando conclui o retorno, Então grava o status, audita sem dado clínico e atualiza a tela', async () => {
    const { repos, patient, followUp } = await seedFollowUp();
    signIn('atendente');
    const { resolveFollowUp } = await actions();

    const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

    expect(result).toEqual({
      success: true,
      data: { id: followUp.id, patientId: patient.id, status: 'done' },
      error: null,
    });
    expect((await repos.followUps.findById(followUp.id))?.status).toBe('done');
    await vi.waitFor(async () => {
      const events = await auditOf(followUp.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.detail).toBe('retorno: done');
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado um retorno da clínica A, Quando o admin da clínica B tenta cancelar, Então não o encontra e nada muda', async () => {
    const { repos, followUp } = await seedFollowUp();
    signIn('company_admin', CLINIC_B_ID);
    const { resolveFollowUp } = await actions();

    const result = await resolveFollowUp({
      id: followUp.id,
      status: 'cancelled',
    });

    expect(result.success).toBe(false);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
  });

  it('Dado um profissional sem vínculo com o paciente (R4), Quando conclui o retorno, Então não encontra e nada é gravado', async () => {
    const { repos, followUp } = await seedFollowUp();
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    signIn('profissional', CLINIC_A_ID, professional.id);
    const { resolveFollowUp } = await actions();

    const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

    expect(result.success).toBe(false);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
    expect(await auditOf(followUp.id)).toHaveLength(0);
  });

  it('Dado um profissional vinculado ao paciente, Quando conclui o retorno, Então grava', async () => {
    const { repos, patient, followUp } = await seedFollowUp();
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
    signIn('profissional', CLINIC_A_ID, professional.id);
    const { resolveFollowUp } = await actions();

    const result = await resolveFollowUp({ id: followUp.id, status: 'done' });

    expect(result.success).toBe(true);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe('done');
  });

  it('Dado retorno inexistente, Quando conclui, Então responde não encontrado', async () => {
    signIn('atendente');
    const { resolveFollowUp } = await actions();

    const result = await resolveFollowUp({ id: 'nao-existe', status: 'done' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/não encontrad/i);
  });

  it('Dado a foto do paciente, Quando o admin escala a triagem, Então marca a foto, cria o retorno imediato e audita', async () => {
    const { repos, patient, photo } = await seedPatientPhoto();
    signIn('company_admin');
    const { decideTriage } = await actions();

    const result = await decideTriage({ id: photo.id, decision: 'escalated' });

    expect(result).toEqual({
      success: true,
      data: { id: photo.id, decision: 'escalated', patientId: patient.id },
      error: null,
    });
    expect((await repos.conditionPhotos.findById(photo.id))?.triageStatus).toBe(
      'escalated',
    );
    const pending = await repos.followUps.findAll();
    expect(
      pending.some(
        (f) =>
          f.patientId === patient.id && /Retorno antecipado/.test(f.reason),
      ),
    ).toBe(true);
    await vi.waitFor(async () =>
      expect((await auditOf(photo.id))[0]?.detail).toBe('triagem: escalated'),
    );
  });

  it('Dado a foto do paciente, Quando o admin só avalia, Então não cria retorno', async () => {
    const { repos, patient, photo } = await seedPatientPhoto();
    signIn('company_admin');
    const { decideTriage } = await actions();

    const result = await decideTriage({ id: photo.id, decision: 'reviewed' });

    expect(result.success).toBe(true);
    expect(
      (await repos.followUps.findAll()).some((f) => f.patientId === patient.id),
    ).toBe(false);
  });

  it('Dado profissional sem vínculo, Quando decide a triagem, Então é recusado e a foto segue pendente', async () => {
    const { repos, photo } = await seedPatientPhoto();
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    signIn('profissional', CLINIC_A_ID, professional.id);
    const { decideTriage } = await actions();

    const result = await decideTriage({ id: photo.id, decision: 'reviewed' });

    expect(result.success).toBe(false);
    expect((await repos.conditionPhotos.findById(photo.id))?.triageStatus).toBe(
      'pending',
    );
  });

  it('Dado o papel profissional, Quando tenta manter o responsável após a maioridade, Então é recusado', async () => {
    signIn('profissional');
    const { keepMajorityGuardian } = await actions();

    const result = await keepMajorityGuardian({ patientId: 'qualquer' });

    expect(result.error).toBe('Seu papel não tem acesso a este recurso');
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado o admin e um paciente sem revisão de maioridade, Quando mantém o responsável, Então a regra de negócio responde o erro e nada é auditado', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = buildPatient();
    await repos.patients.save(patient);
    signIn('company_admin');
    const { keepMajorityGuardian } = await actions();

    const result = await keepMajorityGuardian({ patientId: patient.id });

    expect(result.success).toBe(false);
    expect(await auditOf(patient.id)).toHaveLength(0);
  });
});
