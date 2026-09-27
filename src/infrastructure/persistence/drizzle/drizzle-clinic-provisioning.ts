import type {
  ClinicProvisioning,
  ClinicProvisioningScope,
} from '@/application/ports/clinic-provisioning';
import type { AppDb } from './db';
import { DrizzleClinicRepository } from './drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from './drizzle-foundation-repositories';

/** `db.transaction` com os repositórios sobre o `tx`: erro em `fn` desfaz tudo. */
export class DrizzleClinicProvisioning implements ClinicProvisioning {
  constructor(private readonly db: AppDb) {}

  run<T>(
    clinicId: string,
    fn: (repos: ClinicProvisioningScope) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) =>
      fn({
        clinics: new DrizzleClinicRepository(tx),
        userAccounts: new DrizzleUserAccountRepository(tx, clinicId),
      }),
    );
  }
}
