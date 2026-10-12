import type { EmailGateway } from '@/application/ports/email-gateway';
import { logError } from '@/lib/log-error';
import { logger } from '@/lib/observability/logger';
import type { SignalKind } from '@/lib/observability/signals';

/**
 * Alertas mínimos de produção (#212), por e-mail ao operador pelo canal da
 * plataforma (ADR-011). Decididos pelo dono: readiness falhando, 5xx acima
 * do limiar, job de lembretes sem rodar há 26 h e falha de entrega de e-mail
 * recorrente. Os limiares de 5xx e de entrega são configuráveis: o número
 * certo ainda é pergunta aberta (ver `docs/engineering/producao.md` § 9).
 */
export type AlertKey =
  | 'readiness'
  | 'server-errors'
  | 'reminders-stale'
  | 'delivery-failures';

export interface AlertConfig {
  /** Destinatário (`ALERT_EMAIL_TO`); nulo = sem destinatário, só log. */
  recipient: string | null;
  serverErrorThreshold: number;
  deliveryFailureThreshold: number;
  windowMs: number;
  remindersMaxAgeMs: number;
  /** Mesmo alerta não é reenviado antes disto, enquanto continuar ativo. */
  cooldownMs: number;
  /** URL da instância, para o operador saber de onde veio o alerta. */
  instanceUrl: string | null;
}

export interface AlertProbes {
  readiness(): Promise<{
    ready: boolean;
    database: string;
    migrations: string;
  }>;
  lastRemindersRun(): Promise<Date | null>;
  countSignals(kind: SignalKind, sinceMs: number): number;
}

export interface AlertCheck {
  key: AlertKey;
  firing: boolean;
  /** Sem dado pessoal: medida e limiar. */
  detail: string;
  /** E-mail enviado nesta execução. */
  notified: boolean;
}

export interface AlertRunSummary {
  channel: 'configured' | 'none';
  checks: AlertCheck[];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const DEFAULT_SERVER_ERROR_THRESHOLD = 10;
export const DEFAULT_DELIVERY_FAILURE_THRESHOLD = 3;
const WINDOW_MS = 15 * MINUTE_MS;
/** Decisão do dono (#212): 26 h, um ciclo diário mais folga. */
const REMINDERS_MAX_AGE_MS = 26 * HOUR_MS;
const COOLDOWN_MS = HOUR_MS;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function alertConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): AlertConfig {
  return {
    recipient: env.ALERT_EMAIL_TO?.trim() || null,
    serverErrorThreshold: positiveInt(
      env.ALERT_5XX_THRESHOLD,
      DEFAULT_SERVER_ERROR_THRESHOLD,
    ),
    deliveryFailureThreshold: positiveInt(
      env.ALERT_DELIVERY_FAILURE_THRESHOLD,
      DEFAULT_DELIVERY_FAILURE_THRESHOLD,
    ),
    windowMs: WINDOW_MS,
    remindersMaxAgeMs: REMINDERS_MAX_AGE_MS,
    cooldownMs: COOLDOWN_MS,
    instanceUrl: env.APP_URL?.trim() || null,
  };
}

const TITLES: Record<AlertKey, string> = {
  readiness: 'aplicação não está pronta (/api/health/ready)',
  'server-errors': 'erros 5xx acima do limiar',
  'reminders-stale': 'job de lembretes sem rodar',
  'delivery-failures': 'falhas de entrega de e-mail recorrentes',
};

type Evaluation = Omit<AlertCheck, 'notified'>;

const minutes = (ms: number) => Math.round(ms / MINUTE_MS);

/**
 * Avalia os quatro sinais e avisa o operador. Cada alerta ativo sai num
 * e-mail próprio, no máximo um por `cooldownMs` (estado em memória: uma
 * réplica). Sem destinatário ou sem canal da plataforma, o alerta ativo vira
 * linha de erro no log (e no GlitchTip, se configurado).
 */
export class EvaluateAlerts {
  constructor(
    private readonly probes: AlertProbes,
    private readonly email: EmailGateway,
    private readonly config: AlertConfig,
    private readonly lastNotified: Map<AlertKey, number>,
  ) {}

  async execute(now: Date = new Date()): Promise<AlertRunSummary> {
    const evaluations = [
      await this.readiness(),
      this.signal('server-errors', 'server-error', now),
      await this.reminders(now),
      this.signal('delivery-failures', 'delivery-failure', now),
    ];
    const channel =
      this.config.recipient && (await this.email.isEnabled())
        ? 'configured'
        : 'none';
    const checks: AlertCheck[] = [];
    for (const evaluation of evaluations) {
      checks.push({
        ...evaluation,
        notified: await this.notify(evaluation, channel, now),
      });
    }
    return { channel, checks };
  }

  private async readiness(): Promise<Evaluation> {
    const report = await this.probes.readiness();
    return {
      key: 'readiness',
      firing: !report.ready,
      detail: `banco: ${report.database}; migrações: ${report.migrations}`,
    };
  }

  private signal(
    key: 'server-errors' | 'delivery-failures',
    kind: SignalKind,
    now: Date,
  ): Evaluation {
    const threshold =
      key === 'server-errors'
        ? this.config.serverErrorThreshold
        : this.config.deliveryFailureThreshold;
    const count = this.probes.countSignals(
      kind,
      now.getTime() - this.config.windowMs,
    );
    return {
      key,
      firing: count >= threshold,
      detail: `${count} nos últimos ${minutes(this.config.windowMs)} min (limiar ${threshold})`,
    };
  }

  private async reminders(now: Date): Promise<Evaluation> {
    let lastRun: Date | null;
    try {
      lastRun = await this.probes.lastRemindersRun();
    } catch (error) {
      // Banco fora: quem avisa é o alerta de readiness.
      logError('Alertas: falha ao ler a última execução dos lembretes', error);
      return {
        key: 'reminders-stale',
        firing: false,
        detail: 'não verificado',
      };
    }
    const maxHours = minutes(this.config.remindersMaxAgeMs) / 60;
    if (!lastRun) {
      return {
        key: 'reminders-stale',
        firing: true,
        detail: `nenhuma execução registrada (limite ${maxHours} h)`,
      };
    }
    const ageMs = now.getTime() - lastRun.getTime();
    return {
      key: 'reminders-stale',
      firing: ageMs > this.config.remindersMaxAgeMs,
      detail: `última execução em ${lastRun.toISOString()} (limite ${maxHours} h)`,
    };
  }

  private inCooldown(key: AlertKey, now: Date): boolean {
    const last = this.lastNotified.get(key);
    return last !== undefined && now.getTime() - last < this.config.cooldownMs;
  }

  private async notify(
    evaluation: Evaluation,
    channel: AlertRunSummary['channel'],
    now: Date,
  ): Promise<boolean> {
    if (!evaluation.firing || this.inCooldown(evaluation.key, now)) {
      return false;
    }
    if (channel === 'none' || !this.config.recipient) {
      logger.error(`Alerta sem canal de e-mail: ${TITLES[evaluation.key]}`, {
        alert: evaluation.key,
        detail: evaluation.detail,
      });
      return false;
    }
    try {
      await this.email.send({
        to: this.config.recipient,
        subject: `[Vitta Flow] Alerta: ${TITLES[evaluation.key]}`,
        text: this.body(evaluation, now),
      });
    } catch (error) {
      logError(`Alertas: falha ao enviar o alerta ${evaluation.key}`, error);
      return false;
    }
    this.lastNotified.set(evaluation.key, now.getTime());
    return true;
  }

  private body(evaluation: Evaluation, now: Date): string {
    return [
      `Alerta: ${TITLES[evaluation.key]}.`,
      `Medida: ${evaluation.detail}.`,
      `Instância: ${this.config.instanceUrl ?? 'APP_URL não configurada'}.`,
      `Quando: ${now.toISOString()}.`,
      '',
      'Próximo alerta igual em no mínimo ' +
        `${minutes(this.config.cooldownMs)} min, se continuar ativo.`,
      'Roteiro: docs/engineering/producao.md § 9.',
    ].join('\n');
  }
}
