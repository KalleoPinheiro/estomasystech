import { type MockInstance, vi } from 'vitest';

import {
  type EmailMessage,
  NullEmailGateway,
} from '@/application/ports/email-gateway';

/**
 * invariant: depende de RESEND_API_KEY/EMAIL_FROM estarem vazios no processo
 * de teste (forçado em vitest.config.mts) — se vazarem do .env local,
 * buildEmailGateway() monta o gateway real e nenhum e-mail chega aqui.
 *
 * A suíte roda sem credenciais de e-mail, então o container monta o
 * `NullEmailGateway`. Espiar o `send` dele é o jeito de observar a mensagem
 * inteira sem enviar nada — o log do gateway nulo só traz metadados
 * mascarados (CWE-532), então não serve para conferir destinatário e corpo.
 */
export interface EmailSpy {
  /** Mensagens enviadas, na ordem de envio, como `destinatário — assunto\ncorpo`. */
  readonly bodies: string[];
  restore(): void;
}

export function spyOnSentEmails(): EmailSpy {
  const bodies: string[] = [];
  const spy: MockInstance = vi
    .spyOn(NullEmailGateway.prototype, 'send')
    .mockImplementation(async (message: EmailMessage) => {
      bodies.push(`${message.to} — ${message.subject}\n${message.text}`);
    });
  return {
    bodies,
    restore: () => spy.mockRestore(),
  };
}

/**
 * Espera até que `count` e-mails tenham sido capturados. Necessário porque
 * `POST /api/auth/forgot-password` dispara o envio SEM aguardar (o await
 * transformaria o tempo de resposta num oráculo de existência de conta), então
 * o e-mail chega depois que a rota já respondeu.
 */
export async function waitForEmails(
  spy: EmailSpy,
  count: number,
): Promise<void> {
  await vi.waitFor(() => {
    if (spy.bodies.length < count) {
      throw new Error(
        `Esperando ${count} e-mail(s), capturados ${spy.bodies.length}`,
      );
    }
  });
}

/** Extrai o segredo do link `/definir-senha?token=…` do último e-mail capturado. */
export function tokenFromLastEmail(spy: EmailSpy): string {
  const last = spy.bodies[spy.bodies.length - 1];
  const match = last?.match(/definir-senha\?token=([\w-]+)/);
  if (!match) {
    throw new Error(
      `Nenhum link de definição de senha no último e-mail: ${last ?? '(nenhum)'}`,
    );
  }
  return match[1];
}
