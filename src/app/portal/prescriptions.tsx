import { Card } from '@still-void/ui/react';
import type { PrescriptionSummaryDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';

/**
 * Receituários de enfermagem emitidos para o paciente (#956, ADR-116), para
 * baixar exatamente como a clínica emitiu. Sem nenhum, a seção não aparece.
 */
export function MyPrescriptions({
  prescriptions,
}: {
  prescriptions: PrescriptionSummaryDto[];
}) {
  if (prescriptions.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">Meus receituários</h2>
      <Card>
        <ul className="flex flex-col gap-2 text-sm">
          {prescriptions.map((prescription) => (
            <li key={prescription.id}>
              <a
                href={`/api/portal/patient/receituarios/${prescription.id}`}
                download
                className="font-medium text-accent-ink hover:underline"
              >
                Receituário {prescription.documentNumber} (PDF)
              </a>{' '}
              <span className="text-ink-3">
                de {formatDate(prescription.issuedAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
