import { describe, expect, it } from 'vitest';
import { ClinicChannel } from '@/domain/clinic/clinic-channel';
import { ValidationError } from '@/domain/shared/errors';

const configure = (overrides: Partial<{ sender: string; apiKey: string }>) =>
  ClinicChannel.configure({
    clinicId: 'c1',
    channel: 'email',
    provider: 'resend',
    sender: 'Clínica <contato@clinica.com.br>',
    apiKey: 're_chave_1234',
    by: 'admin@c1.test',
    ...overrides,
  });

describe('ClinicChannel (C3, #266)', () => {
  it.each(['contato@clinica.com.br', 'Clínica X <contato@clinicax.com.br>'])(
    'aceita o remetente "%s"',
    (sender) => {
      expect(configure({ sender }).sender).toBe(sender);
    },
  );

  it.each([
    'contato',
    'Nome <sem-arroba>',
    'a@b',
    'Nome contato@clinica.com.br',
    '<contato@clinica.com.br>',
    'Nome <contato@clinica.com.br',
  ])('recusa o remetente "%s"', (sender) => {
    expect(() => configure({ sender })).toThrow(/^Remetente inválido/);
    expect(() => configure({ sender })).toThrow(ValidationError);
  });

  it('remetente vazio e chave vazia têm mensagens próprias', () => {
    expect(() => configure({ sender: '  ' })).toThrow('Remetente obrigatório');
    expect(() => configure({ apiKey: '' })).toThrow('Chave de API obrigatória');
    expect(() => configure({ apiKey: '1234' })).toThrow(
      'Chave de API inválida',
    );
  });

  it('reconfigure sem chave mantém a chave, o id e o último teste', () => {
    const tested = configure({}).recordTest(
      { ok: true },
      new Date('2026-10-01T00:00:00Z'),
    );

    const changed = tested.reconfigure({
      provider: 'resend',
      sender: 'novo@clinica.com.br',
      apiKey: '  ',
      by: 'outro@c1.test',
    });

    expect(changed.id).toBe(tested.id);
    expect(changed.apiKey).toBe('re_chave_1234');
    expect(changed.sender).toBe('novo@clinica.com.br');
    expect(changed.lastStatus).toBe('ok');
    expect(changed.updatedBy).toBe('outro@c1.test');
  });

  it('reconfigure com chave nova substitui a chave e zera o status', () => {
    const failed = configure({}).recordTest({ ok: false, error: 'falhou' });

    const changed = failed.reconfigure({
      provider: 'resend',
      sender: 'novo@clinica.com.br',
      apiKey: 're_nova_ABCD',
      by: 'a',
    });

    expect(changed.secretLast4).toBe('ABCD');
    expect(changed.lastStatus).toBeNull();
    expect(changed.lastStatusAt).toBeNull();
    expect(changed.lastError).toBeNull();
  });

  it('recordTest trunca o erro a 300 caracteres e limpa o erro no sucesso', () => {
    const now = new Date('2026-10-02T10:00:00Z');
    const failed = configure({}).recordTest(
      { ok: false, error: 'e'.repeat(500) },
      now,
    );
    expect(failed.lastStatus).toBe('failed');
    expect(failed.lastError).toHaveLength(300);
    expect(failed.lastStatusAt).toEqual(now);

    const ok = failed.recordTest({ ok: true }, now);
    expect(ok.lastStatus).toBe('ok');
    expect(ok.lastError).toBeNull();
  });
});
