import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { encodeAuditCursor } from '@/lib/audit-cursor';
import { createPgliteFromTemplate } from '../support/pglite-template';

const A = 'clinic-audit-a';
const B = 'clinic-audit-b';

let db: AppDb;
const repo = (clinicId: string | null) =>
  new DrizzleAuditEventRepository(db, clinicId);

let seq = 0;
/** Evento com instante controlado (`restore`), para ordem e período. */
const event = (
  clinicId: string | null,
  actorRole: string,
  occurredAt = new Date(),
) => {
  seq += 1;
  return AuditEvent.restore({
    id: `ev-${String(seq).padStart(3, '0')}`,
    clinicId,
    actorRole,
    actorId: `${actorRole}@x.test`,
    action: 'update',
    resourceType: 'clinic-info',
    resourceId: `r-${seq}`,
    patientId: null,
    detail: null,
    occurredAt,
  });
};

const ids = (events: AuditEvent[]) => events.map((e) => e.id);

beforeEach(async () => {
  db = drizzle(await createPgliteFromTemplate(), {
    schema,
  }) as unknown as AppDb;
  for (const id of [A, B]) {
    await db.execute(
      sql`INSERT INTO clinics (id, name, created_at, created_by) VALUES (${id}, ${id}, now(), 'test')`,
    );
  }
});

describe('Feature: Repositório de auditoria escopado por empresa (B6, AD-017)', () => {
  it('Dado eventos de duas clínicas e de plataforma, Quando findAll escopado, Então a clínica só vê os dela e o sistema vê todos', async () => {
    const inA = event(A, 'company_admin');
    const inB = event(B, 'company_admin');
    const platform = event(null, 'anonymous');
    for (const e of [inA, inB, platform]) await repo(null).save(e);

    expect(ids(await repo(A).findAll())).toEqual([inA.id]);
    expect(ids(await repo(B).findAll())).toEqual([inB.id]);
    expect(ids(await repo(null).findAll()).sort()).toEqual(
      [inA.id, inB.id, platform.id].sort(),
    );
  });

  it('Dado repositório da clínica A, Quando save escopado de evento sem empresa e de evento da B, Então o primeiro grava na A e o segundo lança sem gravar', async () => {
    const fromSuperAdmin = event(null, 'super_admin');
    await repo(A).save(fromSuperAdmin);
    const [stored] = await repo(A).findAll();
    expect(stored.clinicId).toBe(A);

    await expect(repo(A).save(event(B, 'company_admin'))).rejects.toThrow(
      'Evento de auditoria de outra empresa',
    );
    expect(await repo(null).findAll()).toHaveLength(1);

    await repo(null).save(event(null, 'anonymous'));
    expect((await repo(null).findAll()).map((e) => e.clinicId)).toContain(null);
  });

  it('Dado eventos variados, Quando consultar a trilha de plataforma, Então só sem empresa ou do super_admin, com período e página; em escopo de clínica lança', async () => {
    const t = (min: number) => new Date(Date.UTC(2026, 8, 27, 12, min));
    const anonymous = event(null, 'anonymous', t(1));
    const superInA = event(A, 'super_admin', t(2));
    const adminInA = event(A, 'company_admin', t(3));
    const superNoClinic = event(null, 'super_admin', t(4));
    for (const e of [anonymous, superInA, adminInA, superNoClinic]) {
      await repo(null).save(e);
    }

    expect(ids(await repo(null).findPlatformTrail())).toEqual([
      superNoClinic.id,
      superInA.id,
      anonymous.id,
    ]);
    expect(
      ids(await repo(null).findPlatformTrail({ from: t(2), to: t(4) })),
    ).toEqual([superInA.id]);
    expect(
      ids(
        await repo(null).findPlatformTrail(
          {},
          { limit: 1, cursor: encodeAuditCursor(superNoClinic) },
        ),
      ),
    ).toEqual([superInA.id]);
    await expect(repo(A).findPlatformTrail()).rejects.toThrow(
      'Trilha de plataforma exige escopo de sistema',
    );
  });
});
