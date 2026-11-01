import { describe, expect, it } from 'vitest';
import { Partner } from '@/domain/partner/partner';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { decodeCursor } from '@/lib/pagination';
import { listPartnersFor } from '@/lib/server/data/partners';
import { listPatientsPage } from '@/lib/server/data/patients';
import { buildPatient, buildProfessional } from '../../support/builders';
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

describe('Feature: lista de pacientes lida no servidor (#549)', () => {
  it('Dado mais pacientes que o limite, Quando lê a 1ª página, Então devolve o limite e o cursor da próxima, em ordem de nome', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    for (const fullName of ['Zélia Pag', 'Ana Pag', 'Maria Pag']) {
      await repos.patients.save(buildPatient({ fullName }));
    }

    const page = await listPatientsPage(session('atendente', CLINIC_A_ID), {
      search: 'Pag',
      limit: 2,
    });

    expect(page.items.map((p) => p.fullName)).toEqual(['Ana Pag', 'Maria Pag']);
    expect(decodeCursor(page.nextCursor)).toMatchObject({
      fullName: 'Maria Pag',
    });

    const next = await listPatientsPage(session('atendente', CLINIC_A_ID), {
      search: 'Pag',
      limit: 2,
      cursor: page.nextCursor as string,
    });
    expect(next.items.map((p) => p.fullName)).toEqual(['Zélia Pag']);
    expect(next.nextCursor).toBeNull();
  });

  it('Dado uma busca, Quando lê, Então só traz quem casa com o termo', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    await repos.patients.save(buildPatient({ fullName: 'Beatriz Buscável' }));
    await repos.patients.save(buildPatient({ fullName: 'Outra Pessoa' }));

    const page = await listPatientsPage(session('company_admin', CLINIC_A_ID), {
      search: 'Buscável',
      limit: 100,
    });

    expect(page.items.map((p) => p.fullName)).toEqual(['Beatriz Buscável']);
  });

  it('Dado pacientes da clínica B, Quando a clínica A lê, Então não os enxerga', async () => {
    await ensureTestClinics();
    const other = await getRepositories(clinicScope(CLINIC_B_ID));
    await other.patients.save(buildPatient({ fullName: 'Isolado da B' }));

    const page = await listPatientsPage(session('company_admin', CLINIC_A_ID), {
      search: 'Isolado da B',
      limit: 100,
    });

    expect(page.items).toEqual([]);
  });

  it('Dado o profissional com vínculo (R4), Quando lê, Então só vê os pacientes vinculados', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    const linked = buildPatient({ fullName: 'R4 Vinculado' });
    await repos.patients.save(linked);
    await repos.patients.save(buildPatient({ fullName: 'R4 Sem Vínculo' }));
    await repos.professionalPatientLinks.ensureLink(professional.id, linked.id);

    const page = await listPatientsPage(
      session('profissional', CLINIC_A_ID, professional.id),
      { search: 'R4', limit: 100 },
    );

    expect(page.items.map((p) => p.fullName)).toEqual(['R4 Vinculado']);
  });

  it('Dado o profissional sem cadastro de profissional na sessão, Quando lê, Então não vê ninguém', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    await repos.patients.save(buildPatient({ fullName: 'Sem Dono' }));

    const page = await listPatientsPage(session('profissional', CLINIC_A_ID), {
      search: 'Sem Dono',
      limit: 100,
    });

    expect(page.items).toEqual([]);
  });
});

describe('Feature: parceiros do formulário lidos no servidor (#549)', () => {
  it('Dado parceiros nas duas clínicas, Quando a A lê, Então traz só os dela', async () => {
    await ensureTestClinics();
    const a = await getRepositories(clinicScope(CLINIC_A_ID));
    const b = await getRepositories(clinicScope(CLINIC_B_ID));
    await a.partners.save(
      Partner.create({
        fullName: 'Parceiro da A',
        email: 'a-parceiro@x.com',
        phone: '11999990001',
      }),
    );
    await b.partners.save(
      Partner.create({
        fullName: 'Parceiro da B',
        email: 'b-parceiro@x.com',
        phone: '11999990002',
      }),
    );

    const list = await listPartnersFor(session('atendente', CLINIC_A_ID));

    expect(list.map((p) => p.fullName)).toContain('Parceiro da A');
    expect(list.map((p) => p.fullName)).not.toContain('Parceiro da B');
  });
});
