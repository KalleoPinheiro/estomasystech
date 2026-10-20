import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionPackage } from '@/domain/billing/package';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import {
  InMemoryStockMovementRepository,
  InMemorySupplyBatchRepository,
  InMemorySupplyRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';

const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T10:00:00Z');

describe('Feature: Pacotes e estoque em memória espelham as regras do banco', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const pacote = (at: Date) => {
    vi.setSystemTime(at);
    return SessionPackage.create({
      patientId: 'p1',
      procedureId: 'proc1',
      totalSessions: 5,
      priceCents: 100000,
    });
  };

  it('Dado dois pacotes do paciente, Quando listar, Então o mais recente vem primeiro; para consumo, o mais antigo', async () => {
    const repo = new InMemorySessionPackageRepository();
    const velho = pacote(T1);
    const novo = pacote(T2);
    await repo.save(novo);
    await repo.save(velho);

    expect((await repo.findByPatientId('p1')).map((p) => p.id)).toEqual([
      novo.id,
      velho.id,
    ]);
    expect((await repo.findUsable('p1', 'proc1', T2))?.id).toBe(velho.id);
  });

  it('Dado consumo registrado, Quando perguntar o pacote da consulta, Então devolve o pacote; sem consumo, nulo', async () => {
    const repo = new InMemorySessionPackageRepository();
    const p = pacote(T1);
    await repo.save(p);
    await repo.recordConsumption(p.id, 'ap1');

    expect(repo.consumedBy('ap1')?.id).toBe(p.id);
    expect(repo.consumedBy('sem-consumo')).toBeNull();
  });

  it('Dado insumo, Quando ajustar com delta zero, Então devolve o insumo sem alterar; saldo negativo recusa', async () => {
    const repo = new InMemorySupplyRepository();
    const supply = Supply.create({
      name: 'Bolsa',
      unit: 'un',
      minQty: 1,
      priceCents: 3500,
    });
    await repo.save(supply);

    expect((await repo.adjustStock(supply.id, 0))?.stockQty).toBe(0);
    expect(await repo.adjustStock(supply.id, -1)).toBeNull();
  });

  it('Dado saídas de insumo, Quando listar por insumo e por consulta, Então a mais recente vem primeiro; saída sem preço custa zero', async () => {
    const repo = new InMemoryStockMovementRepository();
    const make = (at: Date, unitPriceCents?: number) => {
      vi.setSystemTime(at);
      return StockMovement.create({
        supplyId: 's1',
        type: 'out',
        quantity: 2,
        reason: 'Uso',
        appointmentId: 'ap1',
        unitPriceCents,
      });
    };
    const velha = make(T1);
    const nova = make(T2, 500);
    await repo.save(velha);
    await repo.save(nova);

    expect((await repo.findBySupplyId('s1')).map((m) => m.id)).toEqual([
      nova.id,
      velha.id,
    ]);
    expect((await repo.findByAppointmentId('ap1')).map((m) => m.id)).toEqual([
      nova.id,
      velha.id,
    ]);
    const custo = await repo.getOutflowCostInRange(
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-11-01T00:00:00Z'),
    );
    expect(custo).toEqual([{ appointmentId: 'ap1', totalCents: 1000 }]);
  });

  it('Dado lotes sem validade e com a mesma validade, Quando listar, Então vence primeiro o que expira antes, depois o mais antigo', async () => {
    const repo = new InMemorySupplyBatchRepository();
    const make = (at: Date, expiresAt?: Date) => {
      vi.setSystemTime(at);
      return SupplyBatch.create({ supplyId: 's1', quantity: 3, expiresAt });
    };
    const semValidade = make(T1);
    const validade = new Date('2027-01-01T00:00:00Z');
    const antigo = make(T1, validade);
    const recente = make(T2, validade);
    for (const b of [semValidade, recente, antigo]) await repo.save(b);

    expect((await repo.findActiveBySupplyId('s1')).map((b) => b.id)).toEqual([
      antigo.id,
      recente.id,
      semValidade.id,
    ]);
  });
});
