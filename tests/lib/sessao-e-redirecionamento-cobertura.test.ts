// @vitest-environment jsdom

import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifySessionToken } from '@/lib/auth/session';
import { outcomeStatusLabel, pesSentence } from '@/lib/format';
import {
  loginPath,
  redirectToLoginOnExpiredSession,
  safeNextPath,
} from '@/lib/login-redirect';

const SECRET = 'segredo-de-teste-da-sessao';
const NOW = Date.parse('2026-10-20T12:00:00Z');

/** Token assinado de verdade, mas com o conteúdo que o teste escolher. */
const signedToken = (payload: unknown): string => {
  const body = Buffer.from(
    typeof payload === 'string' ? payload : JSON.stringify(payload),
  ).toString('base64url');
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('hex')}`;
};

const valid = {
  exp: NOW + 60_000,
  sub: 'ana@clinica.com',
  role: 'atendente',
  clinicId: 'c-1',
  professionalId: null,
  sv: 0,
};

describe('Feature: Token de sessão rejeita conteúdo malformado mesmo com assinatura válida (ADR-005)', () => {
  it.each([
    ['sem prazo de validade', { ...valid, exp: undefined }],
    ['sem identificação da conta', { ...valid, sub: undefined }],
    ['com papel desconhecido', { ...valid, role: 'superusuario' }],
    ['com empresa que não é texto', { ...valid, clinicId: 42 }],
    ['com profissional que não é texto', { ...valid, professionalId: 7 }],
    ['com versão de sessão negativa', { ...valid, sv: -1 }],
    ['com versão de sessão fracionária', { ...valid, sv: 1.5 }],
    ['que não é JSON', 'isto não é json'],
  ])(
    'Dado token %s, Quando verificar, Então nega o acesso',
    (_nome, payload) => {
      expect(verifySessionToken(SECRET, signedToken(payload), NOW)).toBeNull();
    },
  );

  it('Dado token antigo sem versão de sessão, Quando verificar, Então vale como versão 0', () => {
    const session = verifySessionToken(
      SECRET,
      signedToken({ ...valid, sv: undefined }),
      NOW,
    );
    expect(session?.sessionVersion).toBe(0);
  });
});

describe('Feature: Volta ao lugar depois do login (#207)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('Dado caminho com caractere de controle, Quando validar o next, Então descarta', () => {
    expect(safeNextPath('/agenda\t/evil.com')).toBeNull();
    expect(safeNextPath('/agenda\n')).toBeNull();
  });

  it('Dado sessão expirada em tela interna, Quando redirecionar sem navegador injetado, Então usa a navegação da janela', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', {
      pathname: '/pacientes',
      search: '?aba=1',
      hash: '',
      assign,
    });
    window.history.pushState({}, '', '/pacientes?aba=1');

    expect(redirectToLoginOnExpiredSession()).toBe(true);
    expect(assign).toHaveBeenCalledWith(
      loginPath({ error: 'session_expired', next: '/pacientes?aba=1' }),
    );
  });
});

describe('Feature: Redirecionamento fora do navegador', () => {
  it('Dado ambiente sem janela (servidor), Quando a sessão expira, Então não navega', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    const mod = await import('@/lib/login-redirect');
    const navigate = vi.fn();

    expect(mod.redirectToLoginOnExpiredSession(navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('Feature: Texto do plano de cuidados', () => {
  const base = {
    diagnosisLabel: 'Integridade da pele prejudicada',
    relatedFactors: 'pressão prolongada',
    definingCharacteristics: 'ferida sacral',
  };

  it('Dado diagnóstico de risco, Quando montar a frase PES, Então não cita sinais e sintomas', () => {
    expect(pesSentence({ ...base, type: 'risco' } as never)).toBe(
      'Risco de Integridade da pele prejudicada relacionado a pressão prolongada',
    );
  });

  it.each([
    [{ isAchieved: null, attainment: null }, 'Sem avaliação'],
    [{ isAchieved: true, attainment: 2 }, 'Meta atingida'],
    [{ isAchieved: false, attainment: -1 }, 'Em regressão'],
    [{ isAchieved: false, attainment: 1 }, 'Em progresso'],
    [{ isAchieved: false, attainment: null }, 'Em progresso'],
  ])('Dado resultado %j, Quando rotular, Então "%s"', (outcome, label) => {
    expect(outcomeStatusLabel(outcome)).toBe(label);
  });
});
