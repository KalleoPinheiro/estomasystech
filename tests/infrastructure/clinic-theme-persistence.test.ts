import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Clinic } from '@/domain/clinic/clinic';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

let db: PgliteDatabase<typeof schema>;
let clinics: DrizzleClinicRepository;

beforeAll(async () => {
  db = drizzle(await createPgliteFromTemplate(), { schema });
  clinics = new DrizzleClinicRepository(db as unknown as AppDb);
});

describe('Feature: Persistência do tema da clínica (#426)', () => {
  it('Dada clínica existente antes da migração, Quando ler, Então segue o aparelho em violeta', async () => {
    const clinic = (await clinics.findById(CLINIC)) as Clinic;

    expect(clinic.theme).toEqual({ mode: 'system', accent: 'violet' });
  });

  it('Dada uma escolha, Quando gravar o tema, Então volta na leitura e o resto do cadastro não muda', async () => {
    const clinic = (await clinics.findById(CLINIC)) as Clinic;

    await clinics.saveTheme(
      clinic.withTheme({ mode: 'dark', accent: 'amber' }),
    );

    const reloaded = (await clinics.findById(CLINIC)) as Clinic;
    expect(reloaded.theme).toEqual({ mode: 'dark', accent: 'amber' });
    expect(reloaded.name).toBe(clinic.name);
  });

  it('Dado o tema gravado, Quando o cadastro for atualizado, Então o tema não é regravado', async () => {
    const clinic = (await clinics.findById(CLINIC)) as Clinic;

    await clinics.update(
      clinic.withTheme({ mode: 'light', accent: 'cyan' }).updateInfo({
        city: 'Natal',
      }),
    );

    expect(((await clinics.findById(CLINIC)) as Clinic).theme).toEqual({
      mode: 'dark',
      accent: 'amber',
    });
  });

  it.each([
    ['theme_mode', 'auto'],
    ['theme_accent', '#ff0000'],
  ])(
    'Dado %s fora da lista, Quando gravar direto no banco, Então o banco recusa',
    async (column, value) => {
      await expect(
        db.execute(
          sql.raw(
            `UPDATE clinics SET ${column} = '${value}' WHERE id = '${CLINIC}'`,
          ),
        ),
      ).rejects.toThrow();
    },
  );
});
