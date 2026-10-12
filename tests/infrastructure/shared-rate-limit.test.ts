import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleRateLimitStore } from '@/infrastructure/persistence/drizzle/drizzle-rate-limit-store';
import { rateLimitWindows } from '@/infrastructure/persistence/drizzle/schema';
import { type RateLimitStore, SharedRateLimiter } from '@/lib/auth/rate-limit';
import { loggedLines } from '../support/log-lines';

process.env.VITTA_DB_DRIVER = 'pglite';

const WINDOW = 60_000;
const T0 = Date.parse('2026-09-23T12:00:00Z');

describe('Feature: Rate limit compartilhado entre réplicas (issue #77)', () => {
  let store: DrizzleRateLimitStore;

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(rateLimitWindows);
    store = new DrizzleRateLimitStore(db);
  });

  describe('Contador no Postgres', () => {
    it('Dados acessos na mesma janela, Então conta cada um; chaves diferentes são independentes', async () => {
      expect(await store.hit('login:1.1.1.1', WINDOW, T0)).toBe(1);
      expect(await store.hit('login:1.1.1.1', WINDOW, T0 + 10)).toBe(2);
      expect(await store.hit('login:2.2.2.2', WINDOW, T0 + 20)).toBe(1);
    });

    it('Dada a janela vencida, Quando acessar de novo, Então recomeça do 1 com nova janela', async () => {
      await store.hit('login:ip', WINDOW, T0);
      await store.hit('login:ip', WINDOW, T0 + 1);

      expect(await store.hit('login:ip', WINDOW, T0 + WINDOW)).toBe(1);
      expect(await store.hit('login:ip', WINDOW, T0 + WINDOW + 5)).toBe(2);
    });

    it('Dados acessos simultâneos, Então nenhum incremento se perde', async () => {
      const counts = await Promise.all(
        Array.from({ length: 8 }, () => store.hit('login:ip', WINDOW, T0)),
      );

      expect([...counts].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
    });

    it('Dado um lote de acessos, Então soma o lote de uma vez; na janela nova, recomeça do lote', async () => {
      expect(await store.hit('api:ip', WINDOW, T0, 3)).toBe(3);
      expect(await store.hit('api:ip', WINDOW, T0 + 1, 2)).toBe(5);
      expect(await store.hit('api:ip', WINDOW, T0 + WINDOW, 4)).toBe(4);
    });

    it('Quando podar, Então apaga só as janelas vencidas', async () => {
      await store.hit('velha', WINDOW, T0);
      await store.hit('nova', WINDOW, T0 + WINDOW);

      await store.prune(T0 + WINDOW + 1);

      const keys = (await (await getDb()).select().from(rateLimitWindows)).map(
        (r) => r.key,
      );
      expect(keys).toEqual(['nova']);
    });
  });

  describe('SharedRateLimiter', () => {
    const shared = (name = 'login') =>
      new SharedRateLimiter(name, 5, WINDOW, async () => store);

    it('Dadas duas réplicas, Quando o mesmo IP tenta 6 vezes alternando entre elas, Então a 6ª é barrada', async () => {
      const replicaA = shared();
      const replicaB = shared();
      const results: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        const replica = i % 2 === 0 ? replicaA : replicaB;
        results.push(await replica.allow('9.9.9.9', T0 + i));
      }

      expect(results).toEqual([true, true, true, true, true, false]);
    });

    it('Dados limites diferentes, Então o mesmo IP tem contadores separados por endpoint', async () => {
      const login = shared('login');
      const forgot = shared('forgot-password');
      for (let i = 0; i < 5; i++) await login.allow('ip', T0);

      expect(await login.allow('ip', T0)).toBe(false);
      expect(await forgot.allow('ip', T0)).toBe(true);
    });

    it('Dada a janela vencida, Então o IP volta a ser aceito', async () => {
      const limiter = shared();
      for (let i = 0; i < 6; i++) await limiter.allow('ip', T0);

      expect(await limiter.allow('ip', T0 + WINDOW)).toBe(true);
    });

    it('Dada falha no banco, Então usa o limite da réplica em vez de liberar tudo, e loga', async () => {
      const broken: RateLimitStore = {
        hit: vi.fn().mockRejectedValue(new Error('banco fora')),
        prune: vi.fn(),
      };
      const limiter = new SharedRateLimiter(
        'login',
        2,
        WINDOW,
        async () => broken,
      );
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});

      const results = [
        await limiter.allow('ip', T0),
        await limiter.allow('ip', T0),
        await limiter.allow('ip', T0),
      ];

      expect(results).toEqual([true, true, false]);
      expect(loggedLines(log)).toContainEqual(
        expect.objectContaining({
          msg: expect.stringContaining('Rate limit login'),
          error: expect.objectContaining({
            name: 'Error',
            stack: expect.any(String),
          }),
        }),
      );
      log.mockRestore();
    });

    it('Dados vários acessos, Então poda no máximo uma vez por janela', async () => {
      const prune = vi.spyOn(store, 'prune');
      const limiter = shared();

      await limiter.allow('a', T0);
      await limiter.allow('b', T0 + 1_000);
      await limiter.allow('c', T0 + WINDOW);

      expect(prune).toHaveBeenCalledTimes(2);
    });
  });

  describe('SharedRateLimiter em lote (limite geral da API)', () => {
    const SYNC = 1_000;
    const batched = (max: number) =>
      new SharedRateLimiter('api', max, WINDOW, async () => store, SYNC);

    it('Dados vários acessos no mesmo segundo, Então vai ao banco uma vez só e conta o resto localmente', async () => {
      const hit = vi.spyOn(store, 'hit');
      const limiter = batched(3);

      const results: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(await limiter.allow('ip', T0 + i));
      }

      expect(results).toEqual([true, true, true, false, false]);
      expect(hit).toHaveBeenCalledTimes(1);
    });

    it('Passado o intervalo, Quando acessar, Então envia ao banco o acumulado mais o acesso atual', async () => {
      const hit = vi.spyOn(store, 'hit');
      const limiter = batched(100);
      await limiter.allow('ip', T0);
      await limiter.allow('ip', T0 + 10);
      await limiter.allow('ip', T0 + 20);

      await limiter.allow('ip', T0 + SYNC);

      expect(hit).toHaveBeenLastCalledWith('api:ip', WINDOW, T0 + SYNC, 3);
      const [row] = await (await getDb()).select().from(rateLimitWindows);
      expect(row.count).toBe(4);
    });

    it('Dadas duas réplicas, Então o teto vale somado (com deriva de no máximo um intervalo)', async () => {
      const replicaA = batched(4);
      const replicaB = batched(4);

      expect(await replicaA.allow('ip', T0)).toBe(true); // banco: 1
      expect(await replicaA.allow('ip', T0 + 10)).toBe(true); // A local: 2
      expect(await replicaB.allow('ip', T0 + 20)).toBe(true); // banco: 2
      expect(await replicaB.allow('ip', T0 + 30)).toBe(true); // B local: 3
      expect(await replicaA.allow('ip', T0 + 1_100)).toBe(true); // banco: 4
      expect(await replicaB.allow('ip', T0 + 1_200)).toBe(false); // banco: 6
      expect(await replicaA.allow('ip', T0 + 1_300)).toBe(false); // A vê 4 + 1
    });

    it('Dada falha no banco, Então usa o limite da réplica e tenta sincronizar de novo no próximo acesso', async () => {
      const hit = vi
        .spyOn(store, 'hit')
        .mockRejectedValueOnce(new Error('banco fora'));
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const limiter = batched(5);

      expect(await limiter.allow('ip', T0)).toBe(true);
      expect(await limiter.allow('ip', T0 + 1)).toBe(true);

      expect(hit).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });

    it('Dada chave parada por mais de uma janela, Quando podar, Então sai da memória da réplica', async () => {
      const limiter = batched(5);
      await limiter.allow('parado', T0);
      await limiter.allow('ativo', T0 + SYNC + WINDOW);

      const local = Reflect.get(limiter, 'local') as Map<string, unknown>;
      expect([...local.keys()]).toEqual(['api:ativo']);
    });
  });
});
