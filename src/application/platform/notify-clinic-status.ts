import type { EmailGateway } from '@/application/ports/email-gateway';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { Clinic } from '@/domain/clinic/clinic';
import { logger } from '@/lib/observability/logger';
import { maskEmail } from '@/lib/redact';

export interface ClinicStatusNotifyServices {
  /** Escopado à clínica-alvo. */
  admins: UserAccountRepository;
  /** Canal da plataforma (ADR-011): a clínica suspensa não usa o próprio. */
  email: EmailGateway;
}

const MESSAGES = {
  suspend: {
    subject: (clinic: string) =>
      `Vitta Flow: o acesso da clínica ${clinic} foi suspenso`,
    text: (clinic: string) =>
      `O acesso da clínica ${clinic} ao Vitta Flow foi suspenso pela plataforma.\n\n` +
      'Equipe, pacientes e parceiros não conseguem entrar e os lembretes automáticos ' +
      'estão pausados. Nenhum dado foi apagado.\n\n' +
      'Para regularizar o acesso, fale com o responsável pela plataforma.',
  },
  reactivate: {
    subject: (clinic: string) =>
      `Vitta Flow: o acesso da clínica ${clinic} foi reativado`,
    text: (clinic: string) =>
      `O acesso da clínica ${clinic} ao Vitta Flow foi reativado.\n\n` +
      'As contas voltam a entrar com e-mail e senha; as sessões anteriores à ' +
      'suspensão não voltam, então cada pessoa precisa entrar de novo. Os lembretes ' +
      'automáticos retomam no próximo disparo.',
  },
} as const;

/**
 * Avisa por e-mail cada `company_admin` ativo da clínica que ela foi suspensa
 * ou reativada (#251, AD-039). O e-mail **nunca** leva o motivo, só a situação.
 * Melhor esforço: o estado já foi gravado, então falha de envio é registrada
 * (com o e-mail mascarado) e não desfaz nem derruba a operação.
 */
export async function notifyClinicStatusChange(
  services: ClinicStatusNotifyServices,
  clinic: Clinic,
  action: keyof typeof MESSAGES,
): Promise<void> {
  const message = MESSAGES[action];
  const recipients = (await services.admins.findByRole('company_admin')).filter(
    (account) => account.isActive,
  );
  const results = await Promise.allSettled(
    recipients.map((account) =>
      services.email.send({
        to: account.email,
        subject: message.subject(clinic.name),
        text: message.text(clinic.name),
      }),
    ),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warn(
        `Aviso de ${action} da clínica ${clinic.id} não enviado para ${maskEmail(recipients[index].email)}`,
      );
    }
  });
}
