import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveLoginState } from '@/app/login/login-state';

const PAGINAS = [
  'src/app/login/page.tsx',
  'src/app/esqueci-senha/page.tsx',
  'src/app/definir-senha/page.tsx',
  'src/app/privacidade/page.tsx',
];

/** #554: página e textos no servidor; formulário como ilha cliente mínima. */
describe('Feature: telas públicas e de autenticação como Server Components', () => {
  it.each(PAGINAS)('Dado %s, Então a página não é cliente', (arquivo) => {
    expect(readFileSync(arquivo, 'utf8')).not.toMatch(/^['"]use client['"]/m);
  });

  it('Dado a tela de login, Então não consulta /api na carga', () => {
    expect(readFileSync('src/app/login/login-card.tsx', 'utf8')).not.toContain(
      '/api/auth/providers',
    );
  });

  describe('Cenário: estado do login resolvido no servidor', () => {
    it('Dado erro conhecido e next interno, Então mapeia a mensagem e o destino', () => {
      const state = resolveLoginState(
        { error: 'session_expired', next: '/pacientes/1' },
        true,
      );
      expect(state.errorMessage).toMatch(/sessão/i);
      expect(state.destination).toBe('/pacientes/1');
      expect(state.passwordEnabled).toBe(true);
    });

    it('Dado erro desconhecido, Então mensagem genérica e nunca o texto bruto', () => {
      const state = resolveLoginState({ error: '<b>golpe</b>' }, true);
      expect(state.errorMessage).toBe(
        'Não foi possível concluir a operação. Tente novamente.',
      );
    });

    it('Dado parâmetros repetidos, Então vale o primeiro', () => {
      const state = resolveLoginState({ next: ['/a', '/b'] }, false);
      expect(state.destination).toBe('/a');
      expect(state.passwordEnabled).toBe(false);
    });

    it('Dado next externo ou ausente, Então volta ao início', () => {
      expect(resolveLoginState({ next: '//evil.com' }, true).destination).toBe(
        '/',
      );
      expect(resolveLoginState({}, true).destination).toBe('/');
      expect(resolveLoginState({}, true).errorMessage).toBeNull();
    });
  });
});
