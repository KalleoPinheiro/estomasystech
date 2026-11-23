import { eq, sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzlePatientRepository,
  hashOrNull,
  PATIENT_SCAN_CAP,
} from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleRetentionRepository } from '@/infrastructure/persistence/drizzle/drizzle-retention-repository';
import {
  reencryptPatientIdentity,
  rewriteLocked,
} from '@/infrastructure/persistence/drizzle/reencrypt-patient-identity';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { DataCipher } from '@/lib/data-cipher';
import { logger } from '@/lib/observability/logger';
import { encodeCursor } from '@/lib/pagination';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const OTHER = 'clinic-pii-b';
const PEPPER = 'pepper-de-teste-do-indice-cego-0000000001';
const BLIND = new BlindIndex({ current: PEPPER });
const CPF = '52998224725';

describe('Feature: PII do paciente cifrada em repouso (ADR-096, #735/#736/#737)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let repo: DrizzlePatientRepository;

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    appDb = db as unknown as AppDb;
    repo = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER, BLIND);
    await db
      .insert(schema.clinics)
      .values({
        id: OTHER,
        name: 'Clínica B',
        createdBy: 'test',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.patients);
    await db.delete(schema.guardians);
  });

  const rawRow = async (id: string) =>
    (
      await db.select().from(schema.patients).where(eq(schema.patients.id, id))
    )[0];

  // A coluna legada `birth_date` saiu do schema do código (contração do ADR-096), mas segue no banco até o DROP.
  const legacyBirth = async (id: string) =>
    (
      await db.execute<{ birth_date: Date | null }>(
        sql`SELECT birth_date FROM patients WHERE id = ${id}`,
      )
    ).rows[0]?.birth_date ?? null;
  const setLegacyBirth = (id: string, iso: string) =>
    db.execute(
      sql`UPDATE patients SET birth_date = ${iso}::timestamptz WHERE id = ${id}`,
    );

  const joao = () =>
    Patient.create({
      fullName: 'João da Silva',
      email: 'Joao@Example.com',
      phone: '11999990000',
      cpf: CPF,
      birthDate: new Date('1980-03-10T00:00:00Z'),
    });

  it('Dado paciente salvo, Quando ler o banco direto, Então nome, e-mail, telefone, CPF e nascimento só existem cifrados', async () => {
    const patient = joao();
    await repo.save(patient);

    const row = await rawRow(patient.id);
    for (const value of [
      row.fullName,
      row.email,
      row.phone,
      row.cpf,
      row.birthDateEnc,
    ]) {
      expect(value).toMatch(/^v1\./);
    }
    expect(JSON.stringify(row)).not.toMatch(
      /Jo[ãa]o|example\.com|11999990000|52998224725|1980/,
    );
    expect(await legacyBirth(patient.id)).toBeNull();
    expect(row.cpfHash).toMatch(/^b1\./);
    expect(row.phoneHash).toMatch(/^b1\./);
    expect(row.emailHash).toMatch(/^b1\./);

    const back = await repo.findById(patient.id);
    expect(back?.fullName).toBe('João da Silva');
    expect(back?.email).toBe('joao@example.com');
    expect(back?.phone).toBe(patient.phone);
    expect(back?.birthDate).toEqual(new Date('1980-03-10T00:00:00Z'));
  });

  it('Dado paciente sem e-mail, CPF e nascimento, Quando salvar, Então não grava hash nem cifra de vazio', async () => {
    const patient = Patient.create({
      fullName: 'Sem Dados',
      phone: '11999990001',
    });
    await repo.save(patient);

    const row = await rawRow(patient.id);
    expect(row).toMatchObject({
      email: null,
      cpf: null,
      birthDateEnc: null,
      cpfHash: null,
      emailHash: null,
    });
    expect((await repo.findById(patient.id))?.birthDate).toBeNull();
  });

  // TESTE-ALTERADO: contração do ADR-096; o nascimento em claro (`birth_date`) não é mais lido.
  it('Dado linha legada em claro, Quando ler, Então tolera o texto em claro e ignora o nascimento da coluna legada', async () => {
    await db.insert(schema.patients).values({
      id: 'legado',
      clinicId: CLINIC,
      fullName: 'Maria Legada',
      email: 'maria@legado.com',
      phone: '+5511988887777',
      createdAt: new Date(),
    });
    await setLegacyBirth('legado', '1970-01-02T00:00:00Z');

    const patient = await repo.findById('legado');
    expect(patient?.fullName).toBe('Maria Legada');
    expect(patient?.birthDate).toBeNull();
  });

  describe('busca em memória e índice cego', () => {
    beforeEach(async () => {
      await repo.save(joao());
      await repo.save(
        Patient.create({ fullName: 'Ana Souza', phone: '11999990002' }),
      );
      await repo.save(
        Patient.create({ fullName: 'josé Alves', phone: '11999990003' }),
      );
    });

    it('"jose" acha "José" e "João" não, sem acento nem caixa; "silva" acha por trecho', async () => {
      expect((await repo.findAll('JOSE')).map((p) => p.fullName)).toEqual([
        'josé Alves',
      ]);
      expect((await repo.findAll('silva')).map((p) => p.fullName)).toEqual([
        'João da Silva',
      ]);
      expect(await repo.findAll('inexistente')).toHaveLength(0);
    });

    it('acha por CPF, telefone e e-mail exatos, com ou sem máscara', async () => {
      expect((await repo.findAll('529.982.247-25'))[0]?.fullName).toBe(
        'João da Silva',
      );
      expect((await repo.findAll('(11) 99999-0000'))[0]?.fullName).toBe(
        'João da Silva',
      );
      expect((await repo.findAll(' JOAO@example.com '))[0]?.fullName).toBe(
        'João da Silva',
      );
      expect(await repo.findAll('529.982')).toHaveLength(0);
    });

    it('paciente sem CPF continua achável pelo nome', async () => {
      expect((await repo.findAll('ana'))[0]?.fullName).toBe('Ana Souza');
    });

    it('outra clínica não acha nem lista', async () => {
      const other = new DrizzlePatientRepository(
        appDb,
        OTHER,
        TEST_CIPHER,
        BLIND,
      );
      expect(await other.findAll(CPF)).toHaveLength(0);
      expect(await other.findAll('joão')).toHaveLength(0);
      expect(await other.findAll()).toHaveLength(0);
    });

    it('papel de sistema (sem empresa) não usa o índice cego', async () => {
      const system = new DrizzlePatientRepository(
        appDb,
        null,
        TEST_CIPHER,
        BLIND,
      );
      expect(await system.findAll(CPF)).toHaveLength(0);
    });

    it('lista em ordem de nome e pagina por cursor sem nome, sem repetir nem pular', async () => {
      const collected: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 5; guard += 1) {
        const page = await repo.findAll(undefined, { limit: 1, cursor });
        if (page.length === 0) break;
        collected.push(page[0].fullName);
        cursor = encodeCursor({ id: page[0].id });
      }
      expect(collected).toEqual(['Ana Souza', 'João da Silva', 'josé Alves']);
      expect(
        await repo.findAll(undefined, {
          cursor: encodeCursor({ id: 'sumiu' }),
        }),
      ).toEqual([]);
    });

    it('restringe aos ids da página (escopo do profissional)', async () => {
      const ana = (await repo.findAll('ana'))[0];
      expect(
        (await repo.findAll(undefined, { ids: [ana.id] })).map(
          (p) => p.fullName,
        ),
      ).toEqual(['Ana Souza']);
      expect(await repo.findAll(undefined, { ids: [] })).toEqual([]);
    });

    it('acima do teto avisa sem dado pessoal e trunca', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const rows = Array.from({ length: PATIENT_SCAN_CAP + 1 }, (_, i) => ({
        id: `bulk-${String(i).padStart(6, '0')}`,
        clinicId: OTHER,
        fullName: 'Bulk',
        phone: '1',
        createdAt: new Date(),
      }));
      for (let i = 0; i < rows.length; i += 2000) {
        await db.insert(schema.patients).values(rows.slice(i, i + 2000));
      }
      const other = new DrizzlePatientRepository(
        appDb,
        OTHER,
        TEST_CIPHER,
        BLIND,
      );
      const late = Patient.create({
        fullName: 'Zélia Tardia',
        phone: '11999990009',
        cpf: CPF,
      });
      await other.save(late);
      await db
        .update(schema.patients)
        .set({ id: 'zzz-tardio' })
        .where(eq(schema.patients.id, late.id));
      // Achado exato fora do teto de varredura ainda aparece (e respeita o escopo de ids).
      expect((await other.findAll(CPF)).map((p) => p.id)).toEqual([
        'zzz-tardio',
      ]);
      expect(await other.findAll(CPF, { ids: ['outro'] })).toEqual([]);
      const page = await other.findAll(undefined, { limit: 5 });
      expect(page).toHaveLength(5);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('busca truncada'),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('Bulk');
      warn.mockRestore();
    }, 60_000);
  });

  it('Dado linha removida entre a seleção e a carga, Quando carregar a página, Então ignora o id que sumiu', async () => {
    const loaded = await (
      repo as unknown as {
        loadInOrder(ids: string[]): Promise<unknown[]>;
      }
    ).loadInOrder(['fantasma']);
    expect(loaded).toEqual([]);
  });

  it('Dado linha legada sem hash, Quando buscar por CPF, telefone ou e-mail exatos, Então acha antes do backfill', async () => {
    await db.insert(schema.patients).values({
      id: 'sem-hash',
      clinicId: CLINIC,
      fullName: TEST_CIPHER.encrypt('Legada Sem Hash'),
      email: 'legada@x.com',
      phone: '+5511955554444',
      cpf: TEST_CIPHER.encrypt(CPF),
      createdAt: new Date(),
    });
    for (const term of [CPF, '(11) 95555-4444', 'LEGADA@x.com']) {
      expect((await repo.findAll(term)).map((p) => p.id)).toEqual(['sem-hash']);
    }
    expect(await repo.findAll('52998224700')).toEqual([]);
  });

  it('Dado paciente removido entre o lote e a trava, Quando reescrever, Então ignora a linha', async () => {
    expect(await rewriteLocked(appDb, TEST_CIPHER, BLIND, 'sumiu')).toBe(false);
  });

  it('Dado valor legado inválido, Quando indexar, Então fica sem hash em vez de travar o save', async () => {
    expect(hashOrNull(BLIND, CLINIC, 'phone', 'abc')).toBeNull();
    expect(hashOrNull(BLIND, CLINIC, 'phone', null)).toBeNull();
    expect(hashOrNull(BLIND, CLINIC, 'cpf', CPF)).toMatch(/^b1\./);
    const broken = {
      hash: () => {
        throw new Error('boom');
      },
    } as unknown as BlindIndex;
    expect(() => hashOrNull(broken, CLINIC, 'cpf', CPF)).toThrow('boom');
  });

  describe('maioridade (#372) com nascimento cifrado', () => {
    it('filtra em memória pelo corte, só entre os pacientes do responsável', async () => {
      await db.insert(schema.guardians).values({
        id: 'g1',
        clinicId: CLINIC,
        fullName: 'Resp',
        relationship: 'mae',
        phone: '1',
        createdAt: new Date(),
      });
      const adult = Patient.create({
        fullName: 'Bia Adulta',
        phone: '11999990004',
        guardianId: 'g1',
        birthDate: new Date('2000-01-01T00:00:00Z'),
      });
      const child = Patient.create({
        fullName: 'Caio Criança',
        phone: '11999990005',
        guardianId: 'g1',
        birthDate: new Date('2015-01-01T00:00:00Z'),
      });
      const noBirth = Patient.create({
        fullName: 'Dani',
        phone: '11999990006',
        guardianId: 'g1',
      });
      await repo.save(adult);
      await repo.save(child);
      await repo.save(noBirth);

      const found = await repo.findAdultsAwaitingMajorityReview(
        ['g1'],
        new Date('2008-01-01T00:00:00Z'),
      );
      expect(found.map((p) => p.fullName)).toEqual(['Bia Adulta']);
      expect(
        await repo.findAdultsAwaitingMajorityReview([], new Date()),
      ).toEqual([]);
      expect((await repo.findByGuardian('g1')).map((p) => p.fullName)).toEqual([
        'Bia Adulta',
        'Caio Criança',
        'Dani',
      ]);
    });
  });

  describe('anonimização (retenção, ADR-013/017)', () => {
    it('decifra, trunca para o ano e recifra; zera os hashes e deixa só cifra', async () => {
      const patient = joao();
      await repo.save(patient);
      const retention = new DrizzleRetentionRepository(
        appDb,
        CLINIC,
        TEST_CIPHER,
      );
      const old = new Date('2000-01-01T00:00:00Z');
      await db
        .update(schema.patients)
        .set({ createdAt: old })
        .where(eq(schema.patients.id, patient.id));

      expect(
        await retention.anonymizePatient(
          patient.id,
          new Date(),
          new Date('2010-01-01T00:00:00Z'),
        ),
      ).toBe(1);

      const row = await rawRow(patient.id);
      // TESTE-ALTERADO: `birth_date` saiu do schema do código (contração do ADR-096).
      expect(await legacyBirth(patient.id)).toBeNull();
      expect(row).toMatchObject({
        cpfHash: null,
        phoneHash: null,
        emailHash: null,
        cpf: null,
      });
      expect(TEST_CIPHER.decrypt(row.birthDateEnc ?? '')).toBe(
        '1980-01-01T00:00:00.000Z',
      );
    });

    // TESTE-ALTERADO: contração do ADR-096; o nascimento só existe cifrado, e é ele que vira só o ano.
    it('sem nascimento informado, segue sem nascimento; nascimento cifrado vira só o ano cifrado', async () => {
      const retention = new DrizzleRetentionRepository(
        appDb,
        CLINIC,
        TEST_CIPHER,
      );
      const old = new Date('2000-01-01T00:00:00Z');
      await db.insert(schema.patients).values([
        {
          id: 'sem',
          clinicId: CLINIC,
          fullName: 'x',
          phone: '1',
          createdAt: old,
        },
        {
          id: 'leg',
          clinicId: CLINIC,
          fullName: 'y',
          phone: '1',
          createdAt: old,
          birthDateEnc: TEST_CIPHER.encrypt('1975-06-15T00:00:00.000Z'),
        },
      ]);
      const cutoff = new Date('2010-01-01T00:00:00Z');
      await retention.anonymizePatient('sem', new Date(), cutoff);
      await retention.anonymizePatient('leg', new Date(), cutoff);

      expect((await rawRow('sem')).birthDateEnc).toBeNull();
      const leg = await rawRow('leg');
      expect(TEST_CIPHER.decrypt(leg.birthDateEnc ?? '')).toBe(
        '1975-01-01T00:00:00.000Z',
      );
    });
  });

  describe('backfill (data:reencrypt): cifra o legado, preenche o índice e é idempotente', () => {
    // TESTE-ALTERADO: contração do ADR-096; o reencrypt não converte mais o nascimento em claro.
    it('cifra nome, e-mail e telefone em claro, calcula os hashes e não toca na coluna legada do nascimento', async () => {
      await db.insert(schema.patients).values({
        id: 'bf',
        clinicId: CLINIC,
        fullName: 'Rita Claro',
        email: 'rita@x.com',
        phone: '+5511977776666',
        cpf: TEST_CIPHER.encrypt(CPF),
        createdAt: new Date(),
      });
      await setLegacyBirth('bf', '1990-05-05T00:00:00Z');

      expect(await reencryptPatientIdentity(appDb, TEST_CIPHER, BLIND)).toBe(1);

      const row = await rawRow('bf');
      expect(
        [row.fullName, row.email, row.phone].every((v) => v?.startsWith('v1.')),
      ).toBe(true);
      expect(row.birthDateEnc).toBeNull();
      expect(row.cpfHash).toBe(BLIND.hash(CLINIC, 'cpf', CPF));
      expect(row.emailHash).toBe(BLIND.hash(CLINIC, 'email', 'rita@x.com'));
      expect((await repo.findById('bf'))?.birthDate).toBeNull();
      expect(await reencryptPatientIdentity(appDb, TEST_CIPHER, BLIND)).toBe(0);
    });

    // TESTE-ALTERADO: contração do ADR-096; a coluna legada do nascimento não é mais zerada pelo reencrypt.
    it('recifra chave antiga, inclusive do nascimento, e recalcula pepper antigo', async () => {
      const oldCipher = new DataCipher({
        current: 'chave-antiga-de-pii-00000000000000000001',
      });
      const rotated = new DataCipher({
        current: 'chave-nova-de-pii-000000000000000000002',
        previous: ['chave-antiga-de-pii-00000000000000000001'],
      });
      const oldBlind = new BlindIndex({
        current: 'pepper-antigo-do-indice-cego-000000001',
      });
      const newBlind = new BlindIndex({
        current: PEPPER,
        previous: ['pepper-antigo-do-indice-cego-000000001'],
      });
      await db.insert(schema.patients).values({
        id: 'rot',
        clinicId: CLINIC,
        fullName: oldCipher.encrypt('Rot Ação'),
        email: null,
        phone: oldCipher.encrypt('+5511966665555'),
        birthDateEnc: oldCipher.encrypt('1960-01-01T00:00:00.000Z'),
        phoneHash: oldBlind.hash(CLINIC, 'phone', '+5511966665555'),
        createdAt: new Date(),
      });

      expect(await reencryptPatientIdentity(appDb, rotated, newBlind)).toBe(1);

      const row = await rawRow('rot');
      expect(rotated.isCurrent(row.fullName)).toBe(true);
      expect(rotated.isCurrent(row.birthDateEnc ?? '')).toBe(true);
      expect(newBlind.isCurrent(row.phoneHash ?? '')).toBe(true);
      expect(await reencryptPatientIdentity(appDb, rotated, newBlind)).toBe(0);
    });
  });
});
