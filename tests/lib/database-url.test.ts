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
