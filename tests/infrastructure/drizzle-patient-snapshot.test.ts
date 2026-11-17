import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * #855: a página de pacientes sai de um único snapshot. O PGlite tem uma conexão só e não
 * distingue isolamento pelo resultado, então aqui se prova que `findAll` abre a transação
 * `repeatable read` e roda as leituras dentro dela. A corrida de verdade (renomeação confirmada
 * entre as duas leituras) está em `tests/integracao/paciente-findall-snapshot.integracao.ts`.
 */
describe('Feature: findAll lê a página do paciente num único snapshot (#855)', () => {
  let db: AppDb;
  let repo: DrizzlePatientRepository;
  const nomes = ['Ana Souza', 'Bruno Lima', 'Carla Dias'];

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema }) as unknown as AppDb;
    repo = new DrizzlePatientRepository(db, 'legacy-clinic', TEST_CIPHER);
    for (const [i, fullName] of nomes.entries()) {
      await repo.save(
        Patient.create({
          fullName,
          email: `snapshot${i}@x.com`,
          phone: `1199999000${i}`,
        }),
      );
    }
  });

  it('abre uma transação repeatable read e lê seleção e linhas dentro dela', async () => {
    const transaction = vi.spyOn(db, 'transaction');

    const found = await repo.findAll();

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'repeatable read',
    });
    expect(found.map((p) => p.fullName)).toEqual(nomes);
    transaction.mockRestore();
  });

  it('mantém a seleção e a ordem: busca por nome e paginação por cursor', async () => {
    const porNome = await repo.findAll('bruno');
    expect(porNome.map((p) => p.fullName)).toEqual(['Bruno Lima']);

    const primeira = await repo.findAll(undefined, { limit: 2 });
    expect(primeira.map((p) => p.fullName)).toEqual(nomes.slice(0, 2));
  });

  it('lista de ids vazia devolve vazio sem abrir transação', async () => {
    const transaction = vi.spyOn(db, 'transaction');

    expect(await repo.findAll(undefined, { ids: [] })).toEqual([]);

    expect(transaction).not.toHaveBeenCalled();
    transaction.mockRestore();
  });
});
