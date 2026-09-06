import { Card, Icon, type IconName } from '@still-void/ui/react';
import Link from 'next/link';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';

interface SummaryCardHref {
  label: string;
  url: string;
  className?: string;
}

interface SummaryCardProps {
  title: React.ReactNode;
  titleClassName?: string;
  titleTag?: 'h2' | 'h3';
  headerClassName?: string;
  href?: SummaryCardHref;
  cardClassName?: string;
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  /**
   * `TriageQueue` some inteiro (nem o `<Card>` aparece) quando a fila está
   * vazia — é um banner opcional, não uma seção fixa do dashboard. Por
   * coerência, nesse modo loading/erro também renderizam sem moldura (igual
   * ao comportamento original): chrome só existe quando há dado de fato.
   */
  hideWhenEmpty?: boolean;
  emptyMessage?: string;
  emptyIcon?: IconName;
  children: React.ReactNode;
}

function SummaryCardHeader({
  title,
  titleClassName = 'font-semibold text-lg',
  titleTag: TitleTag = 'h2',
  headerClassName = 'mb-4 flex items-center justify-between',
  href,
}: Pick<
  SummaryCardProps,
  'title' | 'titleClassName' | 'titleTag' | 'headerClassName' | 'href'
>) {
  return (
    <div className={headerClassName}>
      <TitleTag className={titleClassName}>{title}</TitleTag>
      {href && (
        <Link
          href={href.url}
          className={
            href.className ??
            'inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent-ink text-sm hover:underline'
          }
        >
          {href.label} <Icon name="chevron-right" />
        </Link>
      )}
    </div>
  );
}

/**
 * Máquina de estados erro → loading → vazio → dado dos cartões do dashboard
 * staff (issue #140) — antes reimplementada 3x (`FollowUpsCard`,
 * `LowStockCard`, `TriageQueue`) com o mesmo ternário de 4 ramos. Cabeçalho
 * aceita overrides de estilo porque `TriageQueue` é um banner de aviso
 * (tema warning), não um card comum — a duplicação real estava no corpo.
 */
export function SummaryCard({
  title,
  titleClassName,
  titleTag,
  headerClassName,
  href,
  cardClassName = 'p-5',
  error,
  isLoading,
  onRetry,
  isEmpty,
  hideWhenEmpty = false,
  emptyMessage,
  emptyIcon = 'check-circle',
  children,
}: SummaryCardProps) {
  if (hideWhenEmpty) {
    if (isLoading) return <LoadingIndicator />;
    if (error) return <ErrorAlert message={error} onRetry={onRetry} />;
    if (isEmpty) return null;
    return (
      <Card className={cardClassName}>
        <SummaryCardHeader
          title={title}
          titleClassName={titleClassName}
          titleTag={titleTag}
          headerClassName={headerClassName}
          href={href}
        />
        {children}
      </Card>
    );
  }

  return (
    <Card className={cardClassName}>
      <SummaryCardHeader
        title={title}
        titleClassName={titleClassName}
        href={href}
      />
      {error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : isLoading ? (
        <LoadingIndicator />
      ) : isEmpty ? (
        <EmptyState message={emptyMessage ?? ''} icon={emptyIcon} />
      ) : (
        children
      )}
    </Card>
  );
}
