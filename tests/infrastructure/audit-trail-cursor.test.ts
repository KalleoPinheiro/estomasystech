import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { encodeAuditCursor, nextAuditCursor } from '@/lib/audit-cursor';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'clinic-cursor';
const OTHER = 'clinic-cursor-other';

const t = (second: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, second));

const event = (
  id: string,
  clinicId: string | null,
  occurredAt: Date,
  actorRole = 'company_admin',
) =>
  AuditEvent.restore({
    id,
    clinicId,
    actorRole,
    actorId: `${actorRole}@x.test`,
    action: 'update',
    resourceType: 'clinic-info',
    resourceId: `r-${id}`,
    patientId: null,
    detail: null,
    occurredAt,
  });

/** Percorre a trilha inteira pelo cursor, `size` por página, como a tela faz. */
async function walk(
  read: (cursor?: string) => Promise<AuditEvent[]>,
  size: number,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await read(cursor);
    seen.push(...page.map((e) => e.id));
    const next = nextAuditCursor(page, size);
    if (next === null) return seen;
    cursor = next;
  }
  throw new Error('paginação não terminou');
}

describe('Feature: paginação por cursor da auditoria (#322)', () => {
  let db: AppDb;

  beforeEach(async () => {
    db = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;
    for (const id of [CLINIC, OTHER]) {
      await db.execute(
        sql`INSERT INTO clinics (id, name, created_at, created_by) VALUES (${id}, ${id}, now(), 'test')`,
      );
    }
  });

  type Make = (clinicId?: string | null) => AuditEventRepository;
  const backends: [string, () => Make][] = [
    [
      'Drizzle',
      () =>
        (clinicId = CLINIC) =>
          new DrizzleAuditEventRepository(db, clinicId),
    ],
    [
      'em memória',
      () => {
        const store: AuditEvent[] = [];
        return (clinicId = CLINIC) =>
          new InMemoryAuditEventRepository(clinicId, store);
      },
    ],
  ];

  describe.each(backends)('Cenário: %s', (_name, factory) => {
    let make: Make;
    beforeEach(() => {
      make = factory();
    });

    it('Dados eventos com a mesma data, Quando paginar por cursor, Então cada evento aparece uma vez, do mais novo ao mais antigo', async () => {
      const repo = make();
      const all = [
        event('e1', CLINIC, t(1)),
        event('e2', CLINIC, t(2)),
        event('e3', CLINIC, t(2)),
        event('e4', CLINIC, t(2)),
        event('e5', CLINIC, t(3)),
      ];
      for (const e of all) await repo.save(e);

      await make(null).save(event('outra', OTHER, t(9)));
      const seen = await walk(
        (cursor) => repo.findAll({}, { limit: 2, cursor }),
        2,
      );

      expect(seen).toEqual(['e5', 'e4', 'e3', 'e2', 'e1']);
    });

    it('Dados eventos novos entre duas páginas, Quando pedir a próxima, Então não duplica nem pula nenhum evento antigo', async () => {
      const repo = make();
      for (const e of [
        event('a1', CLINIC, t(1)),
        event('a2', CLINIC, t(2)),
        event('a3', CLINIC, t(3)),
        event('a4', CLINIC, t(4)),
      ]) {
        await repo.save(e);
      }

      const first = await repo.findAll({}, { limit: 2 });
      // Entram eventos mais novos (e um do mesmo instante) durante a navegação.
      await repo.save(event('novo-1', CLINIC, t(10)));
      await repo.save(event('novo-2', CLINIC, t(5)));
      const cursor = nextAuditCursor(first, 2) as string;
      const second = await repo.findAll({}, { limit: 2, cursor });

      expect(first.map((e) => e.id)).toEqual(['a4', 'a3']);
      expect(second.map((e) => e.id)).toEqual(['a2', 'a1']);
    });

    it('Dado cursor malformado ou com data inválida, Quando listar, Então volta à primeira página', async () => {
      const repo = make();
      await repo.save(event('x1', CLINIC, t(1)));
      await repo.save(event('x2', CLINIC, t(2)));
      const bad = [
        'não-é-base64-json',
        Buffer.from('{"id":"x1","occurredAt":"ontem"}').toString('base64url'),
        Buffer.from('{"occurredAt":"2026-10-01T12:00:00.000Z"}').toString(
          'base64url',
        ),
      ];

      for (const cursor of bad) {
        const page = await repo.findAll({}, { cursor });
        expect(page.map((e) => e.id)).toEqual(['x2', 'x1']);
      }
    });

    it('Dado cursor, Quando combinar com o filtro de período, Então as duas condições valem', async () => {
      const repo = make();
      for (const [i, s] of [1, 2, 3, 4].entries()) {
        await repo.save(event(`p${i}`, CLINIC, t(s)));
      }
      const page = await repo.findAll(
        { from: t(2), to: t(4) },
        { cursor: encodeAuditCursor(event('p2', CLINIC, t(3))) },
      );

      expect(page.map((e) => e.id)).toEqual(['p1']);
    });
  });

  it('Dada a trilha de plataforma, Quando paginar por cursor com evento novo no meio, Então não duplica nem pula e continua só-sistema', async () => {
    const system = new DrizzleAuditEventRepository(db, null);
    for (const e of [
      event('pl1', null, t(1), 'anonymous'),
      event('pl2', CLINIC, t(2), 'super_admin'),
      event('pl3', null, t(3), 'anonymous'),
      event('da-clinica', CLINIC, t(4)),
    ]) {
      await system.save(e);
    }

    const first = await system.findPlatformTrail({}, { limit: 2 });
    await system.save(event('pl-novo', null, t(20), 'anonymous'));
    const second = await system.findPlatformTrail(
      {},
      { limit: 2, cursor: nextAuditCursor(first, 2) as string },
    );

    expect(first.map((e) => e.id)).toEqual(['pl3', 'pl2']);
    expect(second.map((e) => e.id)).toEqual(['pl1']);
    await expect(
      new DrizzleAuditEventRepository(db, CLINIC).findPlatformTrail(
        {},
        { cursor: nextAuditCursor(first, 2) as string },
      ),
    ).rejects.toThrow('Trilha de plataforma exige escopo de sistema');
  });

  describe('Cenário: índices que atendem a consulta paginada', () => {
    const planOf = async (query: ReturnType<typeof sql>): Promise<string> => {
      // Com poucas linhas o planejador prefere varrer a tabela; desligar o
      // seq scan prova que existe um índice utilizável para a consulta.
      await db.execute(sql`SET enable_seqscan = off`);
      const result = (await db.execute(sql`EXPLAIN ${query}`)) as unknown as {
        rows: { 'QUERY PLAN': string }[];
      };
      return result.rows.map((row) => row['QUERY PLAN']).join('\n');
    };

    it('Dada a trilha da empresa, Quando listar por data, Então usa o índice composto, sem Sort', async () => {
      const plan = await planOf(sql`
        SELECT * FROM audit_events
        WHERE clinic_id = ${CLINIC}
          AND (occurred_at, id) < (${t(5).toISOString()}::timestamptz, 'z')
        ORDER BY occurred_at DESC, id DESC
        LIMIT 100`);

      expect(plan).toContain('idx_audit_events_clinic_trail');
      expect(plan).not.toContain('Sort');
    });

    it('Dada a trilha de plataforma, Quando listar por data, Então usa o índice parcial, sem Sort', async () => {
      const plan = await planOf(sql`
        SELECT * FROM audit_events
        WHERE (clinic_id IS NULL OR actor_role = 'super_admin')
          AND (occurred_at, id) < (${t(5).toISOString()}::timestamptz, 'z')
        ORDER BY occurred_at DESC, id DESC
        LIMIT 100`);

      expect(plan).toContain('idx_audit_events_platform_trail');
      expect(plan).not.toContain('Sort');
    });
  });
});
