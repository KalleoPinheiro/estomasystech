import { beforeAll, describe, expect, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const PHONE = '11977710992';

/** #992: conferência de repetidos antes do cadastro rápido. */
describe('Feature: possíveis repetidos pela API (#992)', () => {
  let route: typeof import('@/app/api/patients/duplicates/route');
  let anaId: string;
  let biaId: string;

  beforeAll(async () => {
    route = await import('@/app/api/patients/duplicates/route');
    await ensureTestClinics();
    const a = await getRepositories(clinicScope(CLINIC_A_ID));
    const ana = Patient.create({
      fullName: 'Ana Repetida',
      phone: PHONE,
      birthDate: new Date('1960-04-12T00:00:00.000Z'),
    });
    const bia = Patient.create({ fullName: 'Bia Repetida', phone: PHONE });
    await a.patients.save(ana);
    await a.patients.save(bia);
    anaId = ana.id;
    biaId = bia.id;
    await a.professionals.save(
      Professional.restore({
        id: 'prof-dup-992',
        fullName: 'Dra. Dup',
        registry: null,
        commissionPct: null,
        active: true,
        createdAt: new Date(),
      }),
    );
    await a.professionalPatientLinks.ensureLink('prof-dup-992', biaId);
    // A mesma pessoa em outra empresa nunca aparece.
    const b = await getRepositories(clinicScope(CLINIC_B_ID));
    await b.patients.save(
      Patient.create({ fullName: 'Ana Repetida', phone: PHONE }),
    );
  });

  const check = async (
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => {
    const response = await route.POST(
      jsonRequest('/api/patients/duplicates', 'POST', body, headers),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<{ id: string }[]>,
    };
  };

  it('Dado o mesmo celular, Então lista os pacientes da empresa', async () => {
    const { status, body } = await check({
      fullName: 'Outra Pessoa',
      phone: `+55 ${PHONE}`,
    });
    expect(status).toBe(200);
    expect(body.data.map((p) => p.id).sort()).toEqual([anaId, biaId].sort());
  });

  it('Dado o mesmo nome e nascimento com outro celular, Então lista o paciente', async () => {
    const { body } = await check({
      fullName: 'ana repetida',
      phone: '11900000000',
      birthDate: '1960-04-12',
    });
    expect(body.data.map((p) => p.id)).toEqual([anaId]);
  });

  it('Dado Profissional, Então só vê os pacientes com vínculo', async () => {
    const { body } = await check(
      { fullName: 'Outra Pessoa', phone: PHONE },
      cookieHeaderFor('profissional', 'dup@x.com', CLINIC_A_ID, 'prof-dup-992'),
    );
    expect(body.data.map((p) => p.id)).toEqual([biaId]);
  });

  it('Dado Profissional sem cadastro de profissional, Então não vê ninguém', async () => {
    const { body } = await check(
      { fullName: 'Outra Pessoa', phone: PHONE },
      cookieHeaderFor('profissional', 'dup2@x.com', CLINIC_A_ID, null),
    );
    expect(body.data).toEqual([]);
  });

  it('Dado corpo inválido, Então responde 400', async () => {
    const { status } = await check({ fullName: 1 });
    expect(status).toBe(400);
  });

  it('Dado sem sessão, Então responde 401', async () => {
    const response = await route.POST(
      jsonRequest(
        '/api/patients/duplicates',
        'POST',
        { fullName: 'x', phone: PHONE },
        { cookie: '' },
      ),
    );
    expect(response.status).toBe(401);
  });
});
