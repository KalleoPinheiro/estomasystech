import { describe, expect, it } from 'vitest';
import { enforceVerifyFull } from '@/lib/database-url';

describe('Feature: SSL do banco sempre verify-full (EST-20)', () => {
  it.each(['prefer', 'require', 'verify-ca', 'REQUIRE'])(
    'Dado sslmode=%s, Quando normalizar, Então vira verify-full explícito',
    (mode) => {
      expect(
        enforceVerifyFull(`postgres://u:p@db.neon.tech/app?sslmode=${mode}`),
      ).toBe('postgres://u:p@db.neon.tech/app?sslmode=verify-full');
    },
  );

  it('Dado sslmode no meio dos parâmetros, Quando normalizar, Então preserva os demais', () => {
    expect(
      enforceVerifyFull(
        'postgres://u:p@h/app?channel_binding=require&sslmode=require&connect_timeout=5',
      ),
    ).toBe(
      'postgres://u:p@h/app?channel_binding=require&sslmode=verify-full&connect_timeout=5',
    );
  });

  it('Dado sslmode repetido com apelidos, Quando normalizar, Então todas as ocorrências viram verify-full', () => {
    expect(
      enforceVerifyFull(
        'postgres://u:p@h/app?sslmode=require&x=1&sslmode=prefer&sslmode=verify-ca',
      ),
    ).toBe(
      'postgres://u:p@h/app?sslmode=verify-full&x=1&sslmode=verify-full&sslmode=verify-full',
    );
  });

  it('Dado sslmode repetido com apelido e modo explícito, Quando normalizar, Então só o apelido muda', () => {
    expect(
      enforceVerifyFull('postgres://u:p@h/app?sslmode=disable&sslmode=require'),
    ).toBe('postgres://u:p@h/app?sslmode=disable&sslmode=verify-full');
  });

  it('Dado a mesma URL normalizada duas vezes, Quando normalizar, Então o resultado é estável', () => {
    const url = 'postgres://u:p@h/app?sslmode=require&sslmode=require';
    const uma = enforceVerifyFull(url);
    expect(enforceVerifyFull(uma)).toBe(uma);
  });

  it.each([
    'postgres://u:p@db:5432/app',
    'postgres://u:p@h/app?sslmode=verify-full',
    'postgres://u:p@h/app?sslmode=disable',
    'postgres://u:p@h/app?sslmode=no-verify',
    'postgres://u:p@h/app?application_name=sslmode=require',
  ])('Dado %s, Quando normalizar, Então não altera', (url) => {
    expect(enforceVerifyFull(url)).toBe(url);
  });
});
