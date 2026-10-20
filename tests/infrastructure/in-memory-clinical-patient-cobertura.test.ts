import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { Patient } from '@/domain/patient/patient';
import {
  InMemoryConditionPhotoRepository,
  InMemoryConsentRecordRepository,
  InMemoryEvolutionNoteRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T10:00:00Z');

describe('Feature: Repositórios clínicos em memória ordenam como o banco', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Dado evoluções no mesmo instante, Quando listar, Então a gravada por último vem primeiro, mesmo após regravar a anterior', async () => {
    vi.setSystemTime(T1);
    const repo = new InMemoryEvolutionNoteRepository();
    const make = (subjective: string) =>
      EvolutionNote.create({
        patientId: 'p1',
        subjective,
        objective: '',
        assessment: '',
        plan: '',
      });
    const primeira = make('primeira');
    const segunda = make('segunda');
    await repo.save(primeira);
    await repo.save(segunda);
    await repo.save(primeira);

    const lista = await repo.findByPatientId('p1');

    expect(lista.map((n) => n.id)).toEqual([segunda.id, primeira.id]);
  });

  it('Dado fotos de ferida e fotos do paciente aguardando triagem, Quando listar, Então a mais recente vem primeiro', async () => {
    const repo = new InMemoryConditionPhotoRepository();
    const make = (at: Date, origin: 'staff' | 'patient') => {
      vi.setSystemTime(at);
      return ConditionPhoto.create({
        conditionId: 'c1',
        contentType: 'image/jpeg',
        sizeBytes: 10,
        origin,
      });
    };
    const velha = make(T1, 'patient');
    const nova = make(T2, 'patient');
    const equipe = make(T2, 'staff');
    for (const p of [velha, nova, equipe]) await repo.save(p);

    const daCondicao = await repo.findByConditionId('c1');
    const pendentes = await repo.findPendingTriage();

    expect(daCondicao.at(-1)?.id).toBe(velha.id);
    expect(pendentes.map((p) => p.id)).toEqual([nova.id, velha.id]);
  });

  it('Dado aceites do termo, Quando buscar o mais recente, Então devolve o último; sem aceite, nulo', async () => {
    const repo = new InMemoryConsentRecordRepository();
    expect(await repo.findLatestByPatientId('p1')).toBeNull();
    vi.setSystemTime(T1);
    await repo.save(
      ConsentRecord.create({
        patientId: 'p1',
        consentText: 'v1',
        textVersion: 'v1',
      }),
    );
    vi.setSystemTime(T2);
    const recente = ConsentRecord.create({
      patientId: 'p1',
      consentText: 'v2',
      textVersion: 'v2',
    });
    await repo.save(recente);

    expect((await repo.findLatestByPatientId('p1'))?.id).toBe(recente.id);
  });
});

describe('Feature: Pacientes em memória espelham a busca paginada do banco', () => {
  const novo = (fullName: string) =>
    Patient.create({ fullName, phone: '11999990000' });

  it('Dado lista de ids vazia na página, Quando buscar, Então não devolve ninguém', async () => {
    const repo = new InMemoryPatientRepository();
    await repo.save(novo('Ana'));

    expect(await repo.findAll(undefined, { ids: [] })).toEqual([]);
  });

  it('Dado pacientes com o mesmo nome, Quando listar, Então desempata por id; e restringe aos ids pedidos sem busca por termo', async () => {
    const repo = new InMemoryPatientRepository();
    const a = novo('Maria Souza');
    const b = novo('Maria Souza');
    const outra = novo('Zélia');
    for (const p of [a, b, outra]) await repo.save(p);

    const todas = await repo.findAll();
    const esperado = [a.id, b.id].sort((x, y) => x.localeCompare(y));
    expect(todas.slice(0, 2).map((p) => p.id)).toEqual(esperado);

    const so = await repo.findAll(undefined, { ids: [outra.id] });
    expect(so.map((p) => p.id)).toEqual([outra.id]);
  });

  it('Dado repositório sem noção de empresa, Quando perguntar a empresa do paciente, Então não sabe', async () => {
    expect(await new InMemoryPatientRepository().findClinicIdById()).toBeNull();
  });
});
