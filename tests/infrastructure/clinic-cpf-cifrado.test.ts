import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertCnpjAvailable,
  DUPLICATE_CNPJ_MESSAGE,
  DUPLICATE_CPF_MESSAGE,
  rethrowCnpjViolation,
} from '@/application/platform/clinic-cnpj';
import { Clinic } from '@/domain/clinic/clinic';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleClinicRepository,
  providerCpfHash,
} from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import {
  clinicCpfChanges,
  reencryptClinicIdentity,
} from '@/infrastructure/persistence/drizzle/reencrypt-clinic-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex, PROVIDER_INDEX_SCOPE } from '@/lib/blind-index';
import { DataCipher } from '@/lib/data-cipher';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const PEPPER = 'pepper-de-teste-do-indice-cego-0000000977';
const BLIND = new BlindIndex({ current: PEPPER });
const CPF = '52998224725';

const individual = (cpf = CPF) =>
  Clinic.create({
    kind: 'individual',
    name: 'Jeiciele Silva',
    cpf,
    contactPhone: '11 98888-7777',
    contactEmail: 'contato@exemplo.com',
    professionalRegistry: 'COREN-SP 123456',
    createdBy: 'super-admin',
  });

const company = () =>
  Clinic.create({
    name: 'Clínica Aurora',
    cnpj: '12.345.678/0001-95',
    contactPhone: '11 3333-4444',
    contactEmail: 'contato@aurora.test',
    createdBy: 'super-admin',
  });

const failing = () => {
  throw new Error('chave não deveria ser lida');
};

describe('Feature: CPF da autônoma cifrado e com índice cego (#977, ADR-096)', () => {
  let db: PgliteDatabase<typeof schema>;
  let repo: DrizzleClinicRepository;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    repo = new DrizzleClinicRepository(
      db as unknown as AppDb,
      TEST_CIPHER,
      BLIND,
    );
  });

  beforeEach(async () => {
    await db.delete(schema.clinics);
  });

  const rowOf = async (id: string) =>
    (
      await db.select().from(schema.clinics).where(eq(schema.clinics.id, id))
    )[0];

  it('Dada autônoma criada, Quando ler a linha, Então o CPF está cifrado, o hash é de escopo fixo e a leitura devolve o CPF', async () => {
    const clinic = individual();
    await repo.create(clinic);

    const row = await rowOf(clinic.id);
    expect(row?.kind).toBe('individual');
    expect(row?.cpf).not.toContain(CPF);
    expect(TEST_CIPHER.decrypt(row?.cpf as string)).toBe(CPF);
    expect(row?.cpfHash).toBe(
      BLIND.hash(PROVIDER_INDEX_SCOPE, 'provider-cpf', CPF),
    );
    expect(row?.cpfHash).not.toBe(BLIND.hash(clinic.id, 'cpf', CPF));

    const stored = await repo.findById(clinic.id);
    expect(stored?.kind).toBe('individual');
    expect(stored?.cpf).toBe(CPF);
    expect(stored?.professionalName).toBe('Jeiciele Silva');
    expect((await repo.findAll()).map((c) => c.cpf)).toEqual([CPF]);
  });

  it('Dado CPF com ou sem máscara, Quando procurar, Então acha pelo índice cego; CPF inválido ou ausente não acha', async () => {
    const clinic = individual();
    await repo.create(clinic);

    expect((await repo.findByCpf('529.982.247-25'))?.id).toBe(clinic.id);
    expect(await repo.findByCpf('11144477735')).toBeNull();
    expect(await repo.findByCpf('')).toBeNull();
  });

  it('Dada autônoma editada, Quando trocar o CPF, Então regrava cifra e hash', async () => {
    const clinic = individual();
    await repo.create(clinic);
    await repo.update(clinic.updateInfo({ cpf: '11144477735' }));

    const row = await rowOf(clinic.id);
    expect(TEST_CIPHER.decrypt(row?.cpf as string)).toBe('11144477735');
    expect(row?.cpfHash).toBe(providerCpfHash(BLIND, '11144477735'));
    expect(await repo.findByCpf(CPF)).toBeNull();
  });

  it('Dada clínica com CNPJ, Quando gravar e ler, Então nunca lê a chave nem o pepper', async () => {
    const semChave = new DrizzleClinicRepository(
      db as unknown as AppDb,
      failing,
      failing,
    );
    const clinic = company();
    await semChave.create(clinic);
    await semChave.update(clinic.updateInfo({ city: 'Santos' }));

    const stored = await semChave.findById(clinic.id);
    expect(stored?.cpf).toBeNull();
    expect(stored?.kind).toBe('company');
    const row = await rowOf(clinic.id);
    expect(row?.cpf).toBeNull();
    expect(row?.cpfHash).toBeNull();
  });

  it('Dado CPF já cadastrado, Quando cadastrar outra autônoma, Então recusa antes de gravar e o índice único segura a corrida', async () => {
    await repo.create(individual());
    const other = individual('529.982.247-25');

    await expect(assertCnpjAvailable(repo, other)).rejects.toThrow(
      DUPLICATE_CPF_MESSAGE,
    );
    const error = await repo.create(other).catch((e: unknown) => e);
    expect(() => rethrowCnpjViolation(error)).toThrow(DUPLICATE_CPF_MESSAGE);
  });

  it('Dada a própria autônoma, Quando conferir a disponibilidade, Então o CPF dela não conta como repetido', async () => {
    const clinic = individual();
    await repo.create(clinic);

    await expect(assertCnpjAvailable(repo, clinic)).resolves.toBeUndefined();
  });

  it('Dado outro erro de gravação, Quando traduzir, Então sobe sem mudar; o CNPJ repetido segue com a mensagem dele', async () => {
    const boom = new Error('falha qualquer');
    expect(() => rethrowCnpjViolation(boom)).toThrow(boom);
    await repo.create(company());
    const error = await repo.create(company()).catch((e: unknown) => e);
    expect(() => rethrowCnpjViolation(error)).toThrow(DUPLICATE_CNPJ_MESSAGE);
  });

  it('Dada a recifra, Quando o CPF está em chave anterior ou sem hash, Então regrava; numa segunda rodada nada muda', async () => {
    const previousCipher = new DataCipher({
      current: 'chave-anterior-somente-para-testes-0001',
    });
    const rotated = new DataCipher({
      current: 'chave-de-dados-somente-para-testes-0001',
      previous: ['chave-anterior-somente-para-testes-0001'],
    });
    const clinic = individual();
    await new DrizzleClinicRepository(
      db as unknown as AppDb,
      previousCipher,
      BLIND,
    ).create(clinic);
    await db
      .update(schema.clinics)
      .set({ cpfHash: null })
      .where(eq(schema.clinics.id, clinic.id));
    await new DrizzleClinicRepository(
      db as unknown as AppDb,
      TEST_CIPHER,
      BLIND,
    ).create(company());

    const appDb = db as unknown as AppDb;
    expect(await reencryptClinicIdentity(appDb, rotated, BLIND)).toBe(1);
    expect(await reencryptClinicIdentity(appDb, rotated, BLIND)).toBe(0);

    const row = await rowOf(clinic.id);
    expect(rotated.isCurrent(row?.cpf as string)).toBe(true);
    expect(row?.cpfHash).toBe(providerCpfHash(BLIND, CPF));
    expect(
      clinicCpfChanges(rotated, BLIND, { cpf: '', cpfHash: null }),
    ).toEqual({});
  });
});
