import {
  Alert,
  AlertDescription,
  Button,
  CardSkeleton,
  Icon,
  type IconName,
} from '@still-void/ui/react';
import Link from 'next/link';

interface ErrorAlertProps {
  message: string;
  /**
   * Reexecuta a busca que falhou (tipicamente `refresh()` de `useApiQuery`).
   * Quando ausente, nenhum botão de retentativa é exibido (FASEA-04).
   */
  onRetry?: () => void;
  /**
   * `warning` distingue erro de conflito (409) de erro de validação (400) —
   * mesmo alerta vermelho pros dois exigia ações opostas (AGENDA-05).
   */
  variant?: 'danger' | 'warning';
}

/**
 * Alerta de erro com variante semântica do catálogo @still-void/ui v3.3+.
 * A variante `danger` automaticamente aplica role="alert", cores de erro
 * (danger -ink pra contrast 4.5:1), e ícone padrão (se necessário).
 * O token semântico garante que erros nunca colidem com a cor accent do site.
 */
export function ErrorAlert({
  message,
  onRetry,
  variant = 'danger',
}: ErrorAlertProps) {
  return (
    <Alert variant={variant} className="mb-4">
      <AlertDescription>{message}</AlertDescription>
      {onRetry && (
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto p-0"
          onClick={onRetry}
        >
          Tentar novamente
        </Button>
      )}
    </Alert>
  );
}

/**
 * Skeleton do design system no lugar de texto solto. O CardSkeleton é
 * aria-hidden, então o texto de carregamento fica como rótulo acessível —
 * anunciado por leitor de tela e ainda alcançável pelos testes.
 */
export function LoadingIndicator() {
  return (
    <div className="py-8" aria-busy="true" aria-live="polite">
      <CardSkeleton />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  icon?: IconName;
  action?: { label: string; href: string };
}

export function EmptyState({ message, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-ink-3 text-sm">
      {icon && <Icon name={icon} className="text-2xl text-ink-3" />}
      <p>{message}</p>
      {action && (
        <Link
          href={action.href}
          className="font-medium text-accent-ink hover:underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Texto que não foi salvo porque a sessão expirou, devolvido ao formulário
 * depois do login (issue #207).
 */
export function DraftRecoveredAlert({ action }: { action: string }) {
  return (
    <Alert variant="info" className="mb-4" data-draft-recovered>
      <AlertDescription>
        Recuperamos o texto que não foi salvo quando sua sessão expirou. Revise
        e {action} de novo.
      </AlertDescription>
    </Alert>
  );
}
