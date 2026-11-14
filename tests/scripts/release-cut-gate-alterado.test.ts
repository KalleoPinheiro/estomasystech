import { describe, expect, it } from 'vitest';
import { findGateReason } from '../../scripts/gate/test-integrity';
import {
  consolidatedGateAlterado,
  integrityArgs,
  motivoSemRotulo,
  releasePrBody,
} from '../../scripts/release/cut-lib';

describe('Feature: GATE-ALTERADO do lote no corte (#845)', () => {
  it('Dado PRs com e sem GATE-ALTERADO, Então junta numa linha só que o check:testes aceita', () => {
    const line = consolidatedGateAlterado([
      {
        number: 814,
        body: 'texto\nGATE-ALTERADO: o limite de complexidade cognitiva passou a valer em src/; regra nova\n',
      },
      { number: 815, body: 'sem motivo' },
      {
        number: 833,
        body: 'GATE-ALTERADO: o timeout do job de mutação passou de 45 para 120 minutos',
      },
    ]);
    expect(line).toBe(
      'GATE-ALTERADO: #814 o limite de complexidade cognitiva passou a valer em src/, regra nova; #833 o timeout do job de mutação passou de 45 para 120 minutos',
    );
    expect(findGateReason(line ?? '')).not.toBeNull();
  });

  it('Dado motivo curto ou nenhum PR, Então não há linha', () => {
    expect(
      consolidatedGateAlterado([{ number: 1, body: 'GATE-ALTERADO: curto' }]),
    ).toBeNull();
    expect(consolidatedGateAlterado([])).toBeNull();
  });

  it('Dado o TESTE-ALTERADO de um PR, Então o consolidado do gate o ignora', () => {
    expect(
      consolidatedGateAlterado([
        {
          number: 2,
          body: 'TESTE-ALTERADO: um motivo de negócio bem explicado',
        },
      ]),
    ).toBeNull();
  });

  it('Dado as duas linhas, Então os argumentos do check-test-integrity levam --motivo e --motivo-gate sem o rótulo', () => {
    expect(
      integrityArgs(
        'TESTE-ALTERADO: #1 motivo de teste bem explicado',
        'GATE-ALTERADO: #2 motivo de gate bem explicado',
      ),
    ).toEqual([
      '--motivo',
      '#1 motivo de teste bem explicado',
      '--motivo-gate',
      '#2 motivo de gate bem explicado',
    ]);
    expect(
      integrityArgs(null, 'GATE-ALTERADO: #2 motivo de gate bem explicado'),
    ).toEqual(['--motivo-gate', '#2 motivo de gate bem explicado']);
    expect(
      integrityArgs('TESTE-ALTERADO: #1 motivo de teste bem explicado', null),
    ).toEqual(['--motivo', '#1 motivo de teste bem explicado']);
    expect(integrityArgs(null, null)).toEqual([]);
  });

  it('Dado uma linha rotulada, Então motivoSemRotulo devolve só o texto, e null vira vazio', () => {
    expect(motivoSemRotulo('GATE-ALTERADO: abc def', 'GATE-ALTERADO')).toBe(
      'abc def',
    );
    expect(motivoSemRotulo('TESTE-ALTERADO:   abc', 'TESTE-ALTERADO')).toBe(
      'abc',
    );
    expect(motivoSemRotulo(null, 'GATE-ALTERADO')).toBe('');
  });

  it('Dado o GATE-ALTERADO do lote, Então o corpo do PR release → main o repete ao final', () => {
    const body = releasePrBody({
      version: '0.3.0',
      receipt: 'E2E-GATE: x',
      prs: [814],
      testeAlterado: 'TESTE-ALTERADO: #538 motivo de negócio bem explicado',
      gateAlterado: 'GATE-ALTERADO: #814 motivo do gate bem explicado',
    });
    expect(
      body
        .trimEnd()
        .endsWith(
          'TESTE-ALTERADO: #538 motivo de negócio bem explicado\n\nGATE-ALTERADO: #814 motivo do gate bem explicado',
        ),
    ).toBe(true);
    expect(findGateReason(body)).toBe('#814 motivo do gate bem explicado');
  });

  it('Dado lote sem GATE-ALTERADO, Então o corpo não o traz', () => {
    const body = releasePrBody({
      version: '0.3.0',
      receipt: 'x',
      prs: [],
      testeAlterado: null,
      gateAlterado: null,
    });
    expect(body).not.toContain('GATE-ALTERADO');
    const semCampo = releasePrBody({
      version: '0.3.0',
      receipt: 'x',
      prs: [],
      testeAlterado: null,
    });
    expect(semCampo).not.toContain('GATE-ALTERADO');
  });
});
