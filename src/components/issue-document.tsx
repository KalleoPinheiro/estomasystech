'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { issueDocument } from '@/app/documentos/actions';
import { appTimeZone } from '@/domain/shared/time-zone';
import { unwrapAction } from '@/lib/action-result';
import type {
  DocumentIssuance,
  IssueDocumentInput,
} from '@/lib/server/document-issuance';

type IssueState =
  | { status: 'issued'; issuance: DocumentIssuance }
  | { status: 'pending' }
  | { status: 'error'; message: string };

const IssueContext = createContext<IssueState>({ status: 'pending' });

/** Estado da emissão do documento em que o componente está montado. */
export const useIssuance = (): IssueState => useContext(IssueContext);

interface IssueDocumentProps {
  /** Documento a emitir ao montar; sem ele (e sem `initial`) o papel não é emitido. */
  request?: IssueDocumentInput;
  /** Emissão que já existe (reimpressão): a página já sai com o número, sem chamar a ação. */
  initial?: DocumentIssuance | null;
  children: ReactNode;
}

/**
 * Ilha de emissão (#546, ADR-082). A página inteira renderiza no servidor, mas
 * Server Component não grava em GET (o render repete e a pré-busca o dispara):
 * quem emite é esta ilha, chamando a Server Action UMA vez ao montar. A guarda
 * `useRef` impede o disparo duplo do modo estrito. Reimprimir devolve o mesmo
 * registro (idempotente). Número, data e botão Imprimir leem o estado daqui.
 */
export function IssueDocument({
  request,
  initial = null,
  children,
}: IssueDocumentProps) {
  const [state, setState] = useState<IssueState>(
    initial ? { status: 'issued', issuance: initial } : { status: 'pending' },
  );
  const started = useRef(false);

  useEffect(() => {
    if (initial || !request || started.current) return;
    started.current = true;
    unwrapAction(issueDocument(request))
      .then((issuance) => setState({ status: 'issued', issuance }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Erro ao emitir documento',
        }),
      );
  }, [initial, request]);

  return (
    <IssueContext.Provider value={state}>{children}</IssueContext.Provider>
  );
}

interface IssuedLabels {
  dateLabel: string;
  timeLabel: string;
}

function labelsOf(issuedAt: string): IssuedLabels {
  const issued = new Date(issuedAt);
  // Fuso explícito (#205): documento impresso nunca herda o fuso do processo.
  return {
    dateLabel: issued.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: appTimeZone(),
    }),
    timeLabel: issued.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: appTimeZone(),
    }),
  };
}

/** Texto de largura máxima, invisível, que reserva o lugar até a emissão (CLS 0). */
const NUMBER_PLACEHOLDER = 'XXXX-XXXXXXXX';
const DATE_PLACEHOLDER = '00 de setembro de 0000';
const TIME_PLACEHOLDER = '00:00';

/**
 * Antes da emissão o texto sai com valores-modelo de mesma largura, invisíveis:
 * o lugar fica reservado e nada se mexe quando o número chega (CLS 0).
 */
function useIssuedText() {
  const state = useIssuance();
  if (state.status !== 'issued') {
    return {
      pending: state.status === 'pending',
      number: NUMBER_PLACEHOLDER,
      dateLabel: DATE_PLACEHOLDER,
      timeLabel: TIME_PLACEHOLDER,
      issued: false,
    };
  }
  const { dateLabel, timeLabel } = labelsOf(state.issuance.issuedAt);
  return {
    pending: false,
    number: state.issuance.documentNumber,
    dateLabel,
    timeLabel,
    issued: true,
  };
}

/** «Cidade, 03 de setembro de 2026, 23:30.» — a data da emissão persistida. */
export function IssuedDateLine({ city }: { city: string | null }) {
  const { pending, issued, dateLabel, timeLabel } = useIssuedText();
  return (
    <p
      className={issued ? 'mb-10 text-sm' : 'invisible mb-10 text-sm'}
      aria-busy={pending}
    >
      {city ? `${city}, ` : ''}
      {dateLabel}, {timeLabel}.
    </p>
  );
}

/** Rodapé legal com o número e a data da emissão persistida. */
export function IssuedFootnote() {
  const { pending, issued, number, dateLabel, timeLabel } = useIssuedText();
  return (
    <p
      className={issued ? 'mt-6 text-xs' : 'invisible mt-6 text-xs'}
      aria-busy={pending}
    >
      Documento nº {number} — gerado eletronicamente em {dateLabel}, {timeLabel}
      , sem necessidade de assinatura manuscrita para validade administrativa.
    </p>
  );
}
