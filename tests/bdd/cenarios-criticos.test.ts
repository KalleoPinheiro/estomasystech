import { describe, expect, it } from 'vitest';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { Appointment } from '@/domain/scheduling/appointment';
import {
  assertPatientCanChange,
  canPatientChange,
} from '@/domain/scheduling/patient-self-service';
import { ValidationError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';

/**
 * Cenários das regras críticas que não tinham teste próprio no formato de
 * negócio (ADR-048). Cada `describe` cita o id da regra em
 * `tests/bdd/regras-criticas.ts`; termos de `CONTEXT.md`.
 */
describe('Feature: Estoque de insumos (EST-RN-02, EST-RN-03)', () => {
  describe('Cenário: toda movimentação tem motivo (EST-RN-02)', () => {
    it('Dado movimentação sem motivo, Quando registrar, Então é recusada e nada entra no histórico', () => {
      const historico: StockMovement[] = [];

      const registrar = () =>
        historico.push(
          StockMovement.create({
            supplyId: 'insumo-1',
            type: 'out',
            quantity: 2,
            reason: '   ',
          }),
        );

      expect(registrar).toThrow(ValidationError);
      expect(historico).toHaveLength(0);
    });
  });

  describe('Cenário: preço congelado na saída (EST-RN-03)', () => {
    it('Dado saída com preço congelado, Quando o insumo é reajustado depois, Então o custo do atendimento não muda', () => {
      const insumo = Supply.create({
        name: 'Espuma com prata',
        unit: 'un',
        minQty: 1,
        priceCents: 1000,
      });
      const saida = StockMovement.create({
        supplyId: insumo.id,
        type: 'out',
        quantity: 3,
        reason: 'Curativo da consulta',
        unitPriceCents: insumo.priceCents,
      });

      const reajustado = insumo.update({ priceCents: 2500 });

      expect(reajustado.priceCents).toBe(2500);
      expect(saida.totalCostCents).toBe(3000);
    });
  });
});

describe('Feature: Evolução de enfermagem imutável (PRO-RN-02)', () => {
  describe('Cenário: evolução registrada não é editada', () => {
    it('Dado evolução registrada, Quando procurar como alterá-la, Então o prontuário não oferece operação de edição', () => {
      EvolutionNote.create({
        patientId: 'paciente-1',
        subjective: 'Refere dor 4/10 no curativo',
        objective: 'Leito com 80% de tecido de granulação',
        assessment: 'Evolução favorável',
        plan: 'Manter espuma, retorno em 3 dias',
      });

      const operacoes = Object.getOwnPropertyNames(
        EvolutionNote.prototype,
      ).filter((nome) => nome !== 'constructor');
      const mutadores = operacoes.filter(
        (nome) =>
          typeof Object.getOwnPropertyDescriptor(EvolutionNote.prototype, nome)
            ?.value === 'function',
      );

      expect(mutadores).toEqual([]);
    });
  });
});

describe('Feature: Paciente muda a consulta pelo portal (POR-RN-03)', () => {
  const consulta = (inicio: string, fim: string) =>
    Appointment.create({
      patientId: 'paciente-1',
      slot: TimeSlot.create(new Date(inicio), new Date(fim)),
      procedure: 'Troca de curativo',
      price: Money.fromCents(15000),
    });

  describe('Cenário: dentro do aviso mínimo a clínica decide', () => {
    it('Dada consulta a menos de 24 h, Quando o paciente tenta cancelar pelo portal, Então a recusa manda falar com a clínica', () => {
      const agendada = consulta('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z');
      const agora = new Date('2026-07-19T12:00:00Z');

      expect(canPatientChange(agendada, agora)).toBe(false);
      expect(() => assertPatientCanChange(agendada, agora)).toThrow(
        /fale com a clínica/,
      );
    });

    it('Dada consulta a mais de 24 h, Quando o paciente tenta cancelar pelo portal, Então é permitido', () => {
      const agendada = consulta('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z');
      const agora = new Date('2026-07-18T09:00:00Z');

      expect(canPatientChange(agendada, agora)).toBe(true);
    });
  });
});
