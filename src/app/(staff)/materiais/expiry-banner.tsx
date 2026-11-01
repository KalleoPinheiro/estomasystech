import { Alert, AlertDescription, Icon } from '@still-void/ui/react';
import { formatDate } from '@/lib/format';
import type { SupplyInsightsDto } from '@/lib/server/data/supplies';

export function ExpiryBanner({
  batches,
}: {
  batches: SupplyInsightsDto['expiringBatches'];
}) {
  if (batches.length === 0) {
    return null;
  }
  const expired = batches.filter((b) => b.isExpired);
  const expiring = batches.filter((b) => !b.isExpired);
  return (
    <>
      {expired.length > 0 && (
        <Alert variant="danger" className="mb-4" icon={<Icon name="blocked" />}>
          <AlertDescription>
            {expired.length}{' '}
            {expired.length === 1 ? 'lote vencido' : 'lotes vencidos'} com
            saldo:{' '}
            {expired
              .map((b) => `${b.supplyName}${b.label ? ` (${b.label})` : ''}`)
              .join(', ')}
          </AlertDescription>
        </Alert>
      )}
      {expiring.length > 0 && (
        <Alert
          variant="warning"
          className="mb-4"
          icon={<Icon name="pending" />}
        >
          <AlertDescription>
            {expiring.length}{' '}
            {expiring.length === 1 ? 'lote vence' : 'lotes vencem'} em até 30
            dias:{' '}
            {expiring
              .map(
                (b) =>
                  `${b.supplyName}${b.label ? ` (${b.label})` : ''} — ${formatDate(b.expiresAt)}`,
              )
              .join(', ')}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
