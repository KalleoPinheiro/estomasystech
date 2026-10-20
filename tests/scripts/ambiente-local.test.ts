import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  assertLocalEnvironment,
  composeArgs,
  composeEnv,
  FICTIONAL_ACCOUNTS,
  localDatabaseUrl,
  newSecrets,
  parsePort,
  seedEnv,
  summary,
} from '../../scripts/ambiente/config';

const counter = () => {
  let n = 0;
  return (bytes: number) =>
    `${String(++n)
      .repeat(bytes * 2)
      .slice(0, bytes * 2)}`;
};

describe('Feature: Ambiente local completo (#404)', () => {
  describe('Cenário: guarda de banco de produção (ADR-041)', () => {
    it('Dado APP_ENV=production, Quando subir o ambiente local, Então recusa', () => {
      expect(() => assertLocalEnvironment({ APP_ENV: 'production' })).toThrow(
        /produção/,
      );
    });

    it('Dado NODE_ENV=production sem APP_ENV, Quando subir, Então recusa', () => {
      expect(() => assertLocalEnvironment({ NODE_ENV: 'production' })).toThrow(
        /produção/,
      );
    });

    it('Dado DATABASE_URL no host listado em PRODUCTION_DB_HOSTS, Quando subir, Então recusa', () => {
      expect(() =>
        assertLocalEnvironment({
          DATABASE_URL: 'postgres://u:p@db.prod.exemplo/estomasystech',
          PRODUCTION_DB_HOSTS: 'db.prod.exemplo',
        }),
      ).toThrow(/produção/);
    });

    it('Dado DATABASE_URL de um servidor remoto qualquer, Quando subir, Então recusa: só banco da própria máquina', () => {
      expect(() =>
        assertLocalEnvironment({
          DATABASE_URL: 'postgres://u:p@ep-x.neon.tech/estomasystech',
        }),
      ).toThrow(/própria máquina/);
    });

    it('Dado DATABASE_URL malformada, Quando subir, Então recusa', () => {
      expect(() =>
        assertLocalEnvironment({ DATABASE_URL: 'isto-nao-e-url' }),
      ).toThrow(/inválida/);
    });

    it.each([
      ['sem DATABASE_URL', {}],
      [
        'localhost',
        { DATABASE_URL: 'postgres://u:p@localhost:5432/estomasystech' },
      ],
      [
        '127.0.0.1',
        { DATABASE_URL: 'postgres://u:p@127.0.0.1:55432/estomasystech' },
      ],
      [
        'db do compose',
        { DATABASE_URL: 'postgres://u:p@db:5432/estomasystech' },
      ],
    ])('Dado %s, Quando subir, Então aceita', (_nome, env) => {
      expect(() =>
        assertLocalEnvironment({ APP_ENV: 'development', ...env }),
      ).not.toThrow();
    });

    it('Dado DATABASE_URL de produção, Quando rodo o comando, Então ele sai com erro antes de tocar no Docker', () => {
      const result = spawnSync(
        'npx',
        ['tsx', 'scripts/ambiente/local.ts', 'up'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: 'postgres://u:p@db.prod.exemplo/estomasystech',
            PRODUCTION_DB_HOSTS: 'db.prod.exemplo',
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/produção/);
    });
  });

  describe('Cenário: segredos descartáveis e variáveis do compose', () => {
    it('Dado a geração de segredos, Quando criados, Então a senha do seed cumpre o mínimo de 10 caracteres e os segredos diferem', () => {
      const secrets = newSecrets(counter());

      expect(secrets.seedPassword.length).toBeGreaterThanOrEqual(10);
      expect(new Set(Object.values(secrets)).size).toBe(4);
    });

    it('Dado o compose, Quando monto o ambiente, Então a senha do banco e as chaves vêm dos segredos e a URL aponta para a porta do app', () => {
      const secrets = newSecrets(counter());

      const env = composeEnv(secrets, { app: 3100, db: 55_432 });

      expect(env).toMatchObject({
        POSTGRES_PASSWORD: secrets.postgresPassword,
        AUTH_SECRET: secrets.authSecret,
        DATA_ENCRYPTION_KEY: secrets.dataEncryptionKey,
        APP_PORT: '3100',
        POSTGRES_PORT: '55432',
        APP_URL: 'http://localhost:3100',
      });
    });

    it('Dado o seed no host, Quando monto o ambiente, Então usa a mesma chave de dado clínico do app e declara APP_ENV=development', () => {
      const secrets = newSecrets(counter());

      const env = seedEnv(secrets, { app: 3000, db: 55_432 });

      expect(env.DATA_ENCRYPTION_KEY).toBe(secrets.dataEncryptionKey);
      expect(env.APP_ENV).toBe('development');
      expect(env.DATABASE_URL).toBe(localDatabaseUrl(secrets, 55_432));
      expect(() => assertLocalEnvironment(env)).not.toThrow();
    });

    it('Dado o projeto local, Quando monto os argumentos, Então usa projeto próprio e os dois arquivos do compose', () => {
      expect(composeArgs('down', '-v')).toEqual([
        'compose',
        '-p',
        'estomasystech-local',
        '-f',
        'docker-compose.yml',
        '-f',
        'docker-compose.local.yml',
        'down',
        '-v',
      ]);
    });
  });

  describe('Cenário: portas', () => {
    it('Dado variável ausente ou vazia, Quando leio a porta, Então usa o padrão', () => {
      expect(parsePort(undefined, 3000)).toBe(3000);
      expect(parsePort('', 3000)).toBe(3000);
    });

    it('Dado porta válida, Quando leio, Então a respeita', () => {
      expect(parsePort('3100', 3000)).toBe(3100);
    });

    it.each(['abc', '80', '70000', '3000.5'])(
      'Dado a porta inválida %s, Quando leio, Então recusa',
      (value) => {
        expect(() => parsePort(value, 3000)).toThrow(/Porta inválida/);
      },
    );
  });

  describe('Cenário: resumo impresso', () => {
    it('Dado o ambiente pronto, Quando imprimo o resumo, Então mostra a URL, a senha e as 5 contas fictícias sem vazar a senha do banco', () => {
      const secrets = newSecrets(counter());

      const text = summary(secrets, { app: 3000, db: 55_432 });

      expect(text).toContain('http://localhost:3000');
      expect(text).toContain(secrets.seedPassword);
      for (const [email] of FICTIONAL_ACCOUNTS) {
        expect(text).toContain(email);
      }
      expect(FICTIONAL_ACCOUNTS).toHaveLength(5);
      expect(text).not.toContain(secrets.postgresPassword);
    });
  });
});
