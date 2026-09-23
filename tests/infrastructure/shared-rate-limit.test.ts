import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleRateLimitStore } from '@/infrastructure/persistence/drizzle/drizzle-rate-limit-store';
import { rateLimitWindows } from '@/infrastructure/persistence/drizzle/schema';
import { type RateLimitStore, SharedRateLimiter } from '@/lib/auth/rate-limit';

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
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit login'),
        expect.any(Error),
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
});
