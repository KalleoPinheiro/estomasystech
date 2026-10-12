import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AlertConfig,
  type AlertKey,
  type AlertProbes,
  alertConfigFromEnv,
  DEFAULT_DELIVERY_FAILURE_THRESHOLD,
  DEFAULT_SERVER_ERROR_THRESHOLD,
  EvaluateAlerts,
} from '@/application/monitoring/evaluate-alerts';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';

const NOW = new Date('2026-10-12T12:00:00Z');
const HOUR = 60 * 60_000;

class FakeEmail implements EmailGateway {
  sent: EmailMessage[] = [];
  constructor(
    private readonly enabled = true,
    private readonly failing = false,
  ) {}
  async isEnabled() {
    return this.enabled;
  }
  async send(message: EmailMessage) {
    if (this.failing) throw new Error('Resend 500');
    this.sent.push(message);
  }
}

const config = (overrides: Partial<AlertConfig> = {}): AlertConfig => ({
  ...alertConfigFromEnv({
    ALERT_EMAIL_TO: 'operador@vitta.test',
    APP_URL: 'https://clinica.exemplo.com.br',
  }),
  ...overrides,
});

const healthyProbes = (overrides: Partial<AlertProbes> = {}): AlertProbes => ({
  readiness: async () => ({ ready: true, database: 'ok', migrations: 'ok' }),
  lastRemindersRun: async () => new Date(NOW.getTime() - 2 * HOUR),
  countSignals: () => 0,
  ...overrides,
});

const run = (
  probes: AlertProbes,
  email: EmailGateway = new FakeEmail(),
  cfg: AlertConfig = config(),
  state = new Map<AlertKey, number>(),
) => new EvaluateAlerts(probes, email, cfg, state).execute(NOW);

describe('Feature: alertas ao operador (#212, OBS-11..OBS-14)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado tudo saudável, Quando avalia, Então nenhum alerta e nenhum e-mail', async () => {
    const email = new FakeEmail();

    const summary = await run(healthyProbes(), email);

    expect(summary.channel).toBe('configured');
    expect(summary.checks.map((c) => [c.key, c.firing, c.notified])).toEqual([
      ['readiness', false, false],
      ['server-errors', false, false],
      ['reminders-stale', false, false],
      ['delivery-failures', false, false],
    ]);
    expect(email.sent).toEqual([]);
  });

  it('Dado os quatro sinais ativos, Quando avalia, Então um e-mail por alerta, sem dado pessoal', async () => {
    const email = new FakeEmail();

    const summary = await run(
      healthyProbes({
        readiness: async () => ({
          ready: false,
          database: 'fail',
          migrations: 'unknown',
        }),
        lastRemindersRun: async () => new Date(NOW.getTime() - 27 * HOUR),
        countSignals: (kind) => (kind === 'server-error' ? 10 : 3),
      }),
      email,
    );

    expect(summary.checks.every((c) => c.firing && c.notified)).toBe(true);
    expect(email.sent.map((m) => m.subject)).toEqual([
      '[Vitta Flow] Alerta: aplicação não está pronta (/api/health/ready)',
      '[Vitta Flow] Alerta: erros 5xx acima do limiar',
      '[Vitta Flow] Alerta: job de lembretes sem rodar',
      '[Vitta Flow] Alerta: falhas de entrega de e-mail recorrentes',
    ]);
    expect(email.sent.every((m) => m.to === 'operador@vitta.test')).toBe(true);
    expect(email.sent[1].text).toContain('10 nos últimos 15 min (limiar 10)');
    expect(email.sent[2].text).toContain('limite 26 h');
    expect(email.sent[0].text).toContain(
      'Instância: https://clinica.exemplo.com.br.',
    );
  });

  it('Dado abaixo do limiar e lembretes há exatas 26 h, Quando avalia, Então não dispara', async () => {
    const summary = await run(
      healthyProbes({
        lastRemindersRun: async () => new Date(NOW.getTime() - 26 * HOUR),
        countSignals: (kind) => (kind === 'server-error' ? 9 : 2),
      }),
    );

    expect(summary.checks.some((c) => c.firing)).toBe(false);
  });

  it('Dado nenhuma execução registrada dos lembretes, Quando avalia, Então dispara', async () => {
    const summary = await run(
      healthyProbes({ lastRemindersRun: async () => null }),
    );

    expect(summary.checks[2]).toMatchObject({
      key: 'reminders-stale',
      firing: true,
      detail: 'nenhuma execução registrada (limite 26 h)',
    });
  });

  it('Dado falha ao ler os lembretes, Quando avalia, Então não dispara esse (quem avisa é a readiness)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await run(
      healthyProbes({
        lastRemindersRun: () => Promise.reject(new Error('banco fora')),
      }),
    );

    expect(summary.checks[2]).toMatchObject({
      firing: false,
      detail: 'não verificado',
    });
  });

  it('Dado alerta enviado há menos de 60 min, Quando continua ativo, Então não reenvia; depois, reenvia', async () => {
    const email = new FakeEmail();
    const state = new Map<AlertKey, number>();
    const probes = healthyProbes({
      readiness: async () => ({
        ready: false,
        database: 'fail',
        migrations: 'unknown',
      }),
    });

    await new EvaluateAlerts(probes, email, config(), state).execute(NOW);
    const again = await new EvaluateAlerts(
      probes,
      email,
      config(),
      state,
    ).execute(new Date(NOW.getTime() + 59 * 60_000));
    const later = await new EvaluateAlerts(
      probes,
      email,
      config(),
      state,
    ).execute(new Date(NOW.getTime() + 60 * 60_000));

    expect(again.checks[0]).toMatchObject({ firing: true, notified: false });
    expect(later.checks[0]).toMatchObject({ firing: true, notified: true });
    expect(email.sent).toHaveLength(2);
  });

  it('Dado sem destinatário, Quando dispara, Então loga erro e responde canal none', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await run(
      healthyProbes({ countSignals: () => 99 }),
      new FakeEmail(),
      config({ recipient: null }),
    );

    expect(summary.channel).toBe('none');
    expect(summary.checks[1]).toMatchObject({ firing: true, notified: false });
    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        alert: 'server-errors',
        msg: 'Alerta sem canal de e-mail: erros 5xx acima do limiar',
      }),
    );
  });

  it('Dado canal da plataforma desativado, Quando dispara, Então canal none', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await run(
      healthyProbes({ countSignals: () => 99 }),
      new FakeEmail(false),
    );

    expect(summary.channel).toBe('none');
  });

  it('Dado envio que falha, Quando dispara, Então não marca como avisado e tenta na próxima', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = new Map<AlertKey, number>();

    const summary = await run(
      healthyProbes({ countSignals: () => 99 }),
      new FakeEmail(true, true),
      config(),
      state,
    );

    expect(summary.checks[1]).toMatchObject({ firing: true, notified: false });
    expect(state.size).toBe(0);
  });

  it('Dado o ambiente, Quando lê a configuração, Então aplica padrões e recusa valor inválido', () => {
    expect(alertConfigFromEnv({})).toEqual({
      recipient: null,
      serverErrorThreshold: DEFAULT_SERVER_ERROR_THRESHOLD,
      deliveryFailureThreshold: DEFAULT_DELIVERY_FAILURE_THRESHOLD,
      windowMs: 15 * 60_000,
      remindersMaxAgeMs: 26 * HOUR,
      cooldownMs: HOUR,
      instanceUrl: null,
    });
    expect(
      alertConfigFromEnv({
        ALERT_5XX_THRESHOLD: '25',
        ALERT_DELIVERY_FAILURE_THRESHOLD: 'abc',
      }),
    ).toMatchObject({
      serverErrorThreshold: 25,
      deliveryFailureThreshold: DEFAULT_DELIVERY_FAILURE_THRESHOLD,
    });
  });

  it('Dado sem APP_URL, Quando envia, Então o e-mail diz que falta a URL', async () => {
    const email = new FakeEmail();

    await run(
      healthyProbes({ countSignals: () => 99 }),
      email,
      config({ instanceUrl: null }),
    );

    expect(email.sent[0].text).toContain('Instância: APP_URL não configurada.');
  });
});
