import { describeFailure } from '@/lib/api-response';

export type Loaded<T> =
  | { data: T; error: null }
  | { data: null; error: string };

/**
 * Cada bloco da tela Hoje trata o próprio erro (#199): um bloco que falha vira
 * um alerta com «Tentar novamente» e não derruba a tela inicial inteira. A
 * mensagem passa por `describeFailure`, a mesma tradução das rotas, então erro
 * inesperado nunca vaza detalhe.
 */
export async function loadBlock<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await load(), error: null };
  } catch (error) {
    return { data: null, error: describeFailure(error).message };
  }
}
