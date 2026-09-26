import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEmailGateway } from '@/application/ports/email-gateway';

/**
 * AUTH-01: existe uma porta de e-mail transacional com implementação nula/dry-run,
 * usada quando não há credenciais — registra em log em vez de enviar.
 */
describe('Feature: Porta de e-mail transacional (gateway nulo)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('Dado gateway nulo, Quando ler enabled, Então é false (canal desativado)', () => {
    expect(new NullEmailGateway().enabled).toBe(false);
  });

  it('Dado gateway nulo, Quando send, Então resolve sem lançar', async () => {
    await expect(
      new NullEmailGateway().send({
        to: 'a@b.com',
        subject: 'Convite',
        text: 'link',
      }),
    ).resolves.toBeUndefined();
  });

  const inviteBody =
    'Olá, Maria Silva! Sua consulta é em 10/10 às 14:00.\n' +
    'Defina sua senha em https://app.local/definir-senha?token=abc_DEF-123\n' +
    'O link expira em 24 horas.';

  const sendAndCapture = async (text: string): Promise<string> => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await new NullEmailGateway().send({
      to: 'pessoa@clinica.com',
      subject: 'Defina sua senha',
      text,
    });
    expect(info).toHaveBeenCalledTimes(1);
    return String(info.mock.calls[0][0]);
  };

  it('Dado gateway nulo, Quando send, Então loga destinatário mascarado e assunto, sem o corpo (CWE-532)', async () => {
    const logged = await sendAndCapture(inviteBody);

    expect(logged).toContain('[e-mail desativado] Para pe***@clinica.com');
    expect(logged).toContain('Defina sua senha');
    expect(logged).not.toContain('pessoa@clinica.com');
    expect(logged).not.toContain('Maria Silva');
    expect(logged).not.toContain('14:00');
    expect(logged).not.toContain('expira');
  });

  it('Dado fora de produção, Quando send com link de senha, Então loga só o link além dos metadados', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const logged = await sendAndCapture(inviteBody);

    expect(logged).toContain(
      'https://app.local/definir-senha?token=abc_DEF-123',
    );
  });

  it('Dado produção, Quando send com link de senha, Então o link (credencial) não vai para o log', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const logged = await sendAndCapture(inviteBody);

    expect(logged).not.toContain('definir-senha');
    expect(logged).not.toContain('abc_DEF-123');
    expect(logged).toBe(
      '[e-mail desativado] Para pe***@clinica.com — Defina sua senha',
    );
  });

  it('Dado corpo sem link de senha (lembrete), Quando send fora de produção, Então loga só os metadados', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const logged = await sendAndCapture('Olá, Maria! Sua consulta é amanhã.');

    expect(logged).toBe(
      '[e-mail desativado] Para pe***@clinica.com — Defina sua senha',
    );
  });
});
