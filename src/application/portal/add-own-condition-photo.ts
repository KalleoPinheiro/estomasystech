import { AddConditionPhoto } from '@/application/clinical/add-condition-photo';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import type { TransactionManager } from '@/application/ports/transaction-manager';
import type { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { assertPatientPhotoQuota } from './assert-photo-quota';

export interface AddOwnConditionPhotoInput {
  patientId: string;
  conditionId: string;
  data: Uint8Array;
  patientNote?: string | null;
  /** Relógio da operação — injetável para teste. */
  now?: Date;
}

/**
 * Foto enviada pelo próprio paciente (O4.2) com a cota diária atômica (#213,
 * #363): a transação tranca o paciente, confere a cota e grava a foto no mesmo
 * passo, então envios simultâneos esperam em fila e o teto vale para todos.
 * O arquivo vai ao storage dentro da transação; se o commit falhar, sobra no
 * máximo um arquivo órfão (nunca uma linha sem arquivo) — o mesmo risco de
 * qualquer gravação em storage externo.
 */
export class AddOwnConditionPhoto {
  constructor(
    private readonly storage: PhotoStorage,
    private readonly transactions: TransactionManager,
  ) {}

  execute(input: AddOwnConditionPhotoInput): Promise<ConditionPhoto> {
    return this.transactions.run(
      async ({ patients, conditions, conditionPhotos }) => {
        await patients.findByIdForUpdate(input.patientId);
        await assertPatientPhotoQuota(
          conditions,
          conditionPhotos,
          input.patientId,
          input.now,
        );
        return new AddConditionPhoto(
          conditionPhotos,
          conditions,
          this.storage,
        ).execute({
          conditionId: input.conditionId,
          data: input.data,
          origin: 'patient',
          patientNote: input.patientNote ?? null,
        });
      },
    );
  }
}
