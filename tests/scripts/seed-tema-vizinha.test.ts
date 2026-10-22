process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  MAIN_CLINIC_ID,
  NEIGHBOR_CLINIC_ID,
  seedHomologation,
} from '../../scripts/seed/seed';

const NOW = new Date('2026-10-22T15:00:00Z');
const PASSWORD = 'senha-ficticia-123';

async function themeOf(clinicId: string) {
  const { clinics } = await getRepositories(systemScope());
  return (await clinics.findById(clinicId))?.theme;
}

describe('Feature: Tema por clínica na homologação (#476)', () => {
  it('Dado banco vazio, Quando semear, Então a vizinha nasce escura e âmbar e a principal segue o padrão', async () => {
    await seedHomologation({ password: PASSWORD, now: NOW });

    expect(await themeOf(NEIGHBOR_CLINIC_ID)).toEqual({
      mode: 'dark',
      accent: 'amber',
    });
    expect(await themeOf(MAIN_CLINIC_ID)).toEqual({
      mode: 'system',
      accent: 'violet',
    });
  });

  it('Dada a vizinha criada antes do tema (padrão), Quando semear, Então ela vira escura e âmbar sem mexer na principal', async () => {
    const { clinics } = await getRepositories(systemScope());
    const neighbor = await clinics.findById(NEIGHBOR_CLINIC_ID);
    await clinics.saveTheme(
      neighbor!.withTheme({ mode: 'system', accent: 'violet' }),
    );

    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.skipped).toBe(false);
    expect(await themeOf(NEIGHBOR_CLINIC_ID)).toEqual({
      mode: 'dark',
      accent: 'amber',
    });
    expect(await themeOf(MAIN_CLINIC_ID)).toEqual({
      mode: 'system',
      accent: 'violet',
    });
  });

  it('Dada a escolha feita pela tela na vizinha, Quando semear de novo, Então a escolha é mantida', async () => {
    const { clinics } = await getRepositories(systemScope());
    const neighbor = await clinics.findById(NEIGHBOR_CLINIC_ID);
    await clinics.saveTheme(
      neighbor!.withTheme({ mode: 'light', accent: 'mint' }),
    );

    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.skipped).toBe(true);
    expect(await themeOf(NEIGHBOR_CLINIC_ID)).toEqual({
      mode: 'light',
      accent: 'mint',
    });
  });

  it('Dado o tema gravado na principal, Quando ler a vizinha, Então ela não muda (isolamento)', async () => {
    const main = await getRepositories(clinicScope(MAIN_CLINIC_ID));
    const { clinics } = await getRepositories(systemScope());
    const mainClinic = await clinics.findById(MAIN_CLINIC_ID);
    const before = await themeOf(NEIGHBOR_CLINIC_ID);

    await main.clinics.saveTheme(
      mainClinic!.withTheme({ mode: 'dark', accent: 'cyan' }),
    );

    expect(await themeOf(MAIN_CLINIC_ID)).toEqual({
      mode: 'dark',
      accent: 'cyan',
    });
    expect(await themeOf(NEIGHBOR_CLINIC_ID)).toEqual(before);
  });
});

describe('Feature: Clínica criada já com tema próprio (#476)', () => {
  it('Dada clínica nova com tema escolhido, Quando criar, Então o tema vai junto e não volta ao padrão', async () => {
    const { clinics } = await getRepositories(systemScope());
    const { Clinic } = await import('@/domain/clinic/clinic');

    await clinics.create(
      Clinic.restore({
        id: 'clinica-com-tema',
        name: 'Com tema',
        createdBy: 'teste',
        createdAt: NOW,
        status: 'active',
        themeMode: 'light',
        themeAccent: 'mint',
      }),
    );

    expect((await clinics.findById('clinica-com-tema'))?.theme).toEqual({
      mode: 'light',
      accent: 'mint',
    });
  });
});
