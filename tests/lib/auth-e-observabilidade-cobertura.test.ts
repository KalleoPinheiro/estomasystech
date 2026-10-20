import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCalendarOAuthState } from '@/lib/auth/google-calendar-oauth';
import { normalizeRecoveryCode } from '@/lib/auth/mfa-recovery-codes';
import { portalActorNoun } from '@/lib/auth/portal-actor';
import { RateLimiter } from '@/lib/auth/rate-limit';
import {
  requirePortalSession,
  requireStaffSession,
} from '@/lib/auth/require-session';
import type { Session } from '@/lib/auth/session';
import {
  clearSessionRevocationCache,
  forgetClinicSessionStatus,
  isSessionRevoked,
} from '@/lib/auth/staff-revocation';
import { DataCipher, dataKeyId } from '@/lib/data-cipher';
import { sanitizeError } from '@/lib/log-error';
import { buildEvent, scrubEvent } from '@/lib/observability/error-tracker';
import { cookieHeaderFor } from '../support/session';

const KEY = 'c'.repeat(64);

describe('Feature: Cifra de dado clínico (#195)', () => {
  it('Dado chave anterior igual à atual, Quando montar o chaveiro, Então a chave não é duplicada e o id atual é exposto', () => {
    const cipher = new DataCipher({ current: KEY, previous: [KEY] });

    expect(cipher.currentKeyId).toBe(dataKeyId(KEY));
  });

  it('Dado texto vazio, Quando cifrar, Então permanece vazio (nada a proteger)', () => {
    expect(new DataCipher({ current: KEY }).encrypt('')).toBe('');
  });
});

describe('Feature: Limite de requisições em memória', () => {
  it('Dado janela vencida, Quando uma chave nova chega depois de um período, Então as janelas vencidas são podadas da memória', () => {
    const limiter = new RateLimiter(2, 1_000);
    limiter.allow('antiga', 10_000);
    limiter.allow('recente', 10_900);

    limiter.allow('nova', 11_500);

    const windows = (limiter as unknown as { windows: Map<string, unknown> })
      .windows;
    expect([...windows.keys()].sort()).toEqual(['nova', 'recente']);
  });
});

describe('Feature: Pequenas regras de sessão e portal', () => {
  it('Dado sessão do responsável ou do paciente, Quando nomear quem age, Então diferencia os dois', () => {
    expect(portalActorNoun({ role: 'guardian' })).toBe('responsável');
    expect(portalActorNoun({ role: 'patient' })).toBe('paciente');
  });

  it('Dado estado do OAuth sem separador ou vazio, Quando decodificar, Então é inválido', () => {
    expect(decodeCalendarOAuthState(undefined)).toBeNull();
    expect(decodeCalendarOAuthState('')).toBeNull();
    expect(decodeCalendarOAuthState('semseparador')).toBeNull();
    expect(decodeCalendarOAuthState(':so-assunto')).toBeNull();
    expect(decodeCalendarOAuthState('abc:ana@clinica.com')).toEqual({
      state: 'abc',
      subject: 'ana@clinica.com',
    });
  });

  it('Dado código de recuperação digitado com tamanho diferente do padrão, Quando normalizar, Então só limpa o texto', () => {
    expect(normalizeRecoveryCode(' ABC-12 ')).toBe('abc12');
  });
});

describe('Feature: Mensagem de rota exclusiva por papel', () => {
  const saved = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = 'vitest-auth-secret-0000000000000000';
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
  });

  const request = (headers: Record<string, string>) =>
    new NextRequest('http://localhost/api/portal', { headers });

  it('Dado rota só de parceiro, Quando a equipe tenta entrar, Então 403 diz que é exclusiva do parceiro', async () => {
    const guard = requirePortalSession(
      request(cookieHeaderFor('atendente', 'ana@clinica.com', 'c-1')),
      'partner',
    );

    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(403);
    expect(((await guard.response.json()) as { error: string }).error).toBe(
      'Rota exclusiva do portal do parceiro',
    );
  });

  it('Dado rota de portal liberada a papéis de equipe, Quando o papel não está na lista, Então a mensagem é a da equipe', async () => {
    const guard = requirePortalSession(
      request(cookieHeaderFor('patient', 'pac@x.com', 'c-1')),
      ['atendente', 'profissional'],
    );

    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(403);
  });

  it('Dado sessão de paciente numa rota da equipe, Quando entrar, Então 403', () => {
    const guard = requireStaffSession(
      request(cookieHeaderFor('patient', 'pac@x.com', 'c-1')),
    );

    expect(guard.ok).toBe(false);
  });
});

describe('Feature: Revogação de sessão por conta e por clínica (#194, B5)', () => {
  beforeEach(() => clearSessionRevocationCache());

  const session: Session = {
    expiresAtMs: Date.now() + 60_000,
    subject: 'fantasma@clinica.com',
    role: 'atendente',
    clinicId: 'legacy-clinic',
    professionalId: null,
  };

  it('Dado e-mail sem conta na clínica, Quando consultar o banco, Então a sessão segue válida (lista negra, AD-001)', async () => {
    vi.stubEnv('ESTOMASYSTECH_DB_DRIVER', 'pglite');
    const falhas = vi.spyOn(console, 'error');

    expect(await isSessionRevoked(session)).toBe(false);
    expect(falhas).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('Dado suspensão de uma clínica, Quando esquecer o cache dela, Então o status das outras clínicas é preservado', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: true, sessionVersion: 0 });
    const other: Session = { ...session, clinicId: 'outra-clinica' };
    await isSessionRevoked(session, lookup);
    await isSessionRevoked(other, lookup);

    forgetClinicSessionStatus('legacy-clinic');
    await isSessionRevoked(session, lookup);
    await isSessionRevoked(other, lookup);

    expect(lookup).toHaveBeenCalledTimes(3);
  });
});

describe('Feature: Erro enviado ao GlitchTip só com dado seguro (ADR-014)', () => {
  it('Dado evento sem mensagem e sem exceção, Quando higienizar, Então devolve o evento sem campos sensíveis', () => {
    const event = { level: 'error', extra: { cpf: '123' } } as never;

    expect(scrubEvent(event)).toEqual({ level: 'error' });
  });

  it('Dado erro sem mensagem mas com código, Quando montar o evento, Então o código descreve a exceção; sem nada, o nome', () => {
    const comCodigo = buildEvent({
      context: 'job',
      error: { name: 'Error', code: 'ECONNREFUSED' },
    });
    const semNada = buildEvent({
      context: 'job',
      error: { name: 'TypeError' },
    });

    expect(comCodigo.exception?.values?.[0].value).toBe('ECONNREFUSED');
    expect(semNada.exception?.values?.[0].value).toBe('TypeError');
  });
});

describe('Feature: Log de erro sem dado pessoal (LGPD)', () => {
  it('Dado erro de banco com nome próprio e sem stack, Quando higienizar, Então mantém o nome e omite a query', () => {
    const error = Object.assign(new Error('select * from patients'), {
      name: 'DrizzleQueryError',
      query: 'select * from patients where cpf = $1',
      params: ['123.456.789-09'],
      stack: undefined,
    });

    const safe = sanitizeError(error);

    expect(safe.name).toBe('DrizzleQueryError');
    expect(safe.stack).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain('123.456.789-09');
    expect(JSON.stringify(safe)).not.toContain('select');
  });
});
