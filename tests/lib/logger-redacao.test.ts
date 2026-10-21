import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError } from '@/lib/log-error';
import { logger } from '@/lib/observability/logger';

const lastLine = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

describe('Feature: o logger nunca grava dado pessoal (#381, ADR-060)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado campos com CPF, e-mail, nome e conteúdo clínico, Quando loga, Então a linha sai redigida', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('Paciente atendido', {
      patientId: 'p-1',
      patientName: 'Maria da Silva',
      cpf: '123.456.789-09',
      anamnese: 'ferida venosa em MIE',
      detail: { contato: 'maria@clinica.com' },
    });

    expect(lastLine(info)).toMatchObject({
      msg: 'Paciente atendido',
      patientId: 'p-1',
      patientName: '[redigido]',
      cpf: '[redigido]',
      anamnese: '[redigido]',
      detail: { contato: '[e-mail]' },
    });
  });

  it('Dado mensagem com e-mail e número longo, Quando loga, Então o texto sai limpo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('Falha para maria@clinica.com CPF 12345678909');

    expect(lastLine(warn).msg).toBe('Falha para [e-mail] CPF [número]');
  });

  it('Dado campo que tenta sobrescrever time, level e msg, Quando loga, Então valem os do logger', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('real', { msg: 'falso', level: 'error', time: 'ontem' });

    const line = lastLine(info);
    expect(line.msg).toBe('real');
    expect(line.level).toBe('info');
    expect(Date.parse(String(line.time))).not.toBeNaN();
  });

  it('Dado erro de banco com dado pessoal, Quando logError, Então a linha leva só metadados', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbError = Object.assign(
      new Error('Key (email)=(maria@clinica.com) already exists'),
      { code: '23505', severity: 'ERROR', table: 'users', constraint: 'uq' },
    );

    logError('Cadastro', dbError, { patientId: 'p-1' });

    const text = String(error.mock.calls.at(-1)?.[0]);
    expect(text).not.toContain('maria');
    expect(lastLine(error)).toMatchObject({
      patientId: 'p-1',
      error: { name: 'DatabaseError', code: '23505', table: 'users' },
    });
  });
});
