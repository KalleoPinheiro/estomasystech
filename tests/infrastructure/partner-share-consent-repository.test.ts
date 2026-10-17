import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzlePartnerRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-repository';
import { DrizzlePartnerShareConsentRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-share-consent-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

/** Campos do erro do Postgres, dentro ou fora do `DrizzleQueryError`. */
function constraintOf(error: unknown): string | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  return ((cause ?? error) as { constraint?: string }).constraint;
}

describe('Feature: Consentimento paciente × parceiro no banco (#292, migração 0048)', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let repo: DrizzlePartnerShareConsentRepository;
  let patientId: string;
  let otherPatientId: string;
  let partnerId: string;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;

    await new DrizzleClinicRepository(appDb).create(
      Clinic.restore({
        id: 'clinic-b',
        name: 'Clínica B',
        createdBy: 'test',
        createdAt: new Date(),
      }),
    );
    const patients = new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER);
    const partner = Partner.create({
      fullName: 'Dra. Parceira',
      email: 'parceira-292@x.com',
      phone: '11955550000',
    });
    await new DrizzlePartnerRepository(appDb, CLINIC).save(partner);
    partnerId = partner.id;
    const patient = Patient.create({
      fullName: 'Paciente 292',
      email: 'p292@x.com',
      phone: '11999990000',
      referredByPartnerId: partnerId,
    });
    const other = Patient.create({
      fullName: 'Outro 292',
      email: 'o292@x.com',
      phone: '11999990001',
      referredByPartnerId: partnerId,
    });
    await patients.save(patient);
    await patients.save(other);
    patientId = patient.id;
    otherPatientId = other.id;

    repo = new DrizzlePartnerShareConsentRepository(appDb, CLINIC);
    await repo.save(
      PartnerShareConsent.restore({
        id: 'psc-accept',
        patientId,
        partnerId,
        kind: 'accept',
        textHash: 'hash',
        textVersion: 'v1',
        actor: 'patient',
        recordedBy: null,
        ipAddress: '10.0.0.1',
        recordedAt: new Date('2026-01-01T10:00:00Z'),
      }),
    );
    await repo.save(
      PartnerShareConsent.restore({
        id: 'psc-revoke',
        patientId,
        partnerId,
        kind: 'revoke',
        textHash: '',
        textVersion: null,
        actor: 'staff',
        recordedBy: 'recepcao@clinica.com',
        ipAddress: null,
        recordedAt: new Date('2026-02-01T10:00:00Z'),
      }),
    );
  });

  it('Dado aceite e revogação, Quando ler por paciente, Então volta tudo, mais recente primeiro', async () => {
    const records = await repo.findByPatientId(patientId);

    expect(records.map((r) => [r.id, r.kind, r.actor])).toEqual([
      ['psc-revoke', 'revoke', 'staff'],
      ['psc-accept', 'accept', 'patient'],
    ]);
    expect(records[1]).toMatchObject({
      partnerId,
      textHash: 'hash',
      textVersion: 'v1',
      ipAddress: '10.0.0.1',
    });
  });

  it('Dado lote de pacientes, Quando ler por parceiro, Então só os registros deles com esse parceiro', async () => {
    const records = await repo.findByPartnerAndPatientIds(partnerId, [
      patientId,
      otherPatientId,
    ]);

    expect(records).toHaveLength(2);
    expect(
      await repo.findByPartnerAndPatientIds('outro-parceiro', [patientId]),
    ).toEqual([]);
    expect(await repo.findByPartnerAndPatientIds(partnerId, [])).toEqual([]);
  });

  it('Dado outra empresa, Quando ler, Então não vê nada (escopo de empresa)', async () => {
    const otherClinic = new DrizzlePartnerShareConsentRepository(
      appDb,
      'clinic-b',
    );

    expect(await otherClinic.findByPatientId(patientId)).toEqual([]);
    expect(
      await otherClinic.findByPartnerAndPatientIds(partnerId, [patientId]),
    ).toEqual([]);
  });

  it('Dado papel de sistema, Quando salvar, Então lança erro', async () => {
    const system = new DrizzlePartnerShareConsentRepository(appDb, null);

    await expect(
      system.save(
        PartnerShareConsent.revoke({ patientId, partnerId, actor: 'staff' }),
      ),
    ).rejects.toThrow('Papel de sistema não pode salvar consentimento');
  });

  it.each([
    ['kind', "'apagar'", "'patient'", 'partner_share_consents_kind_check'],
    ['actor', "'accept'", "'robo'", 'partner_share_consents_actor_check'],
  ])(
    'Dado %s inválido, Quando inserir direto no banco, Então o CHECK recusa',
    async (_field, kind, actor, constraint) => {
      const error = await db
        .execute(
          sql.raw(`INSERT INTO partner_share_consents
          (id, clinic_id, patient_id, partner_id, kind, text_hash, actor, recorded_at)
          VALUES ('psc-${constraint}', '${CLINIC}', '${patientId}', '${partnerId}',
                  ${kind}, '', ${actor}, now())`),
        )
        .then(
          () => null,
          (caught: unknown) => caught,
        );

      expect(constraintOf(error)).toBe(constraint);
    },
  );
});
