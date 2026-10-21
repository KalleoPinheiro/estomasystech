import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDACTED, redactFields, redactValue, scrubText } from '@/lib/redact';

describe('Feature: redação central de campos de log (#381, ADR-059)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    'cpf',
    'patientCpf',
    'email',
    'recipientEmail',
    'phone',
    'telefone',
    'whatsapp',
    'birthDate',
    'dataNascimento',
    'address',
    'anamnese',
    'diagnosis',
    'clinicalNotes',
    'password',
    'senha',
    'token',
    'accessToken',
    'authorization',
    'cookie',
    'apiKey',
    'passwordHash',
    'nome',
    'nomeCompleto',
    'patientName',
    'user_name',
    'body',
    'text',
    'html',
  ])('Dado o campo %s, Quando redigir, Então o valor some', (key) => {
    expect(redactFields({ [key]: 'Maria da Silva' })).toEqual({
      [key]: REDACTED,
    });
  });

  it.each([
    ['patientId', 'a1'],
    ['clinicId', 'c1'],
    ['status', 502],
    ['count', 3],
    ['route', '/api/patients'],
    ['contentType', 'image/png'],
  ])('Dado o campo %s, Quando redigir, Então o valor fica', (key, value) => {
    expect(redactFields({ [key]: value })).toEqual({ [key]: value });
  });

  it('Dado campo sensível nulo, Quando redigir, Então a ausência continua visível', () => {
    expect(redactFields({ cpf: null, email: undefined })).toEqual({
      cpf: null,
      email: undefined,
    });
  });

  it('Dado objeto aninhado e lista, Quando redigir, Então percorre e redige em todos os níveis', () => {
    const out = redactFields({
      patient: { id: 'p1', cpf: '123.456.789-09', tags: ['a', 'b@x.com'] },
      rows: [{ phone: '+5511999997777' }, 'CPF 12345678909'],
    });

    expect(out).toEqual({
      patient: { id: 'p1', cpf: REDACTED, tags: ['a', '[e-mail]'] },
      rows: [{ phone: REDACTED }, 'CPF [número]'],
    });
  });

  it('Dado erro como campo, Quando redigir, Então leva nome e mensagem limpa, sem stack', () => {
    const out = redactValue(new TypeError('falha para fulano@x.com'));

    expect(out).toEqual({ name: 'TypeError', message: 'falha para [e-mail]' });
  });

  it('Dado erro já sanitizado pelo logError, Quando redigir, Então name e stack ficam', () => {
    const stack =
      'at f (/app/chunks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js:1:2)';

    expect(
      redactFields({ error: { name: 'DatabaseError', code: '23505', stack } }),
    ).toEqual({ error: { name: 'DatabaseError', code: '23505', stack } });
  });

  it('Dado binário, data, função, símbolo e primitivos, Quando redigir, Então nunca imprime o conteúdo', () => {
    expect(
      redactFields({
        foto: new Uint8Array([1, 2, 3]),
        buffer: new ArrayBuffer(4),
        quando: new Date('2026-10-21T10:00:00.000Z'),
        fn: () => 1,
        sym: Symbol('x'),
        ok: true,
        n: BigInt(7),
      }),
    ).toEqual({
      foto: '[binário]',
      buffer: '[binário]',
      quando: '2026-10-21T10:00:00.000Z',
      fn: undefined,
      sym: undefined,
      ok: true,
      n: BigInt(7),
    });
  });

  it('Dado ciclo e objeto fundo demais, Quando redigir, Então corta sem estourar a pilha', () => {
    const ciclo: Record<string, unknown> = { id: 'a' };
    ciclo.self = ciclo;
    const fundo = { a: { b: { c: { d: { e: { f: 'x' } } } } } };

    expect(redactFields({ ciclo, fundo })).toEqual({
      ciclo: { id: 'a', self: '[circular]' },
      fundo: { a: { b: { c: { d: { e: '[profundo]' } } } } },
    });
  });

  it('Dado listas e objetos enormes, Quando redigir, Então limita a 50 itens', () => {
    const lista = Array.from({ length: 80 }, (_, i) => i);
    const objeto = Object.fromEntries(lista.map((i) => [`k${i}`, i]));

    expect(redactValue(lista)).toHaveLength(50);
    expect(Object.keys(redactFields(objeto))).toHaveLength(50);
  });

  it('Dado link de senha fora de produção, Quando redigir, Então o link do dev segue legível', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const link = 'http://localhost:3000/definir-senha?token=abc-123';

    expect(redactFields({ link })).toEqual({ link });
  });

  it('Dado o mesmo link em produção, Quando redigir, Então o token some', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      redactFields({
        link: 'https://app.test/definir-senha?token=abc-123',
      }),
    ).toEqual({ link: 'https://app.test/definir-senha?[redigido]' });
  });

  it('Dado outro valor no campo link fora de produção, Quando redigir, Então segue a regra geral', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(redactFields({ link: 'https://app.test/x?token=segredo' })).toEqual({
      link: 'https://app.test/x?[redigido]',
    });
    expect(redactFields({ link: 12 })).toEqual({ link: 12 });
  });
});

describe('Feature: credenciais em texto livre (#381)', () => {
  it.each([
    [
      'URL com token na query',
      'abrir https://x.test/definir-senha?token=abc123 agora',
      'abrir https://x.test/definir-senha?[redigido] agora',
    ],
    [
      'URL com fragmento',
      'veja https://x.test/p#segredo',
      'veja https://x.test/p?[redigido]',
    ],
    [
      'Bearer',
      'header Bearer abc.def-ghi falhou',
      'header Bearer [redigido] falhou',
    ],
    [
      'JWT',
      'jwt eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl fim',
      'jwt [redigido] fim',
    ],
    [
      'sequência opaca',
      'chave 0123456789abcdef0123456789abcdef0123 vazou',
      'chave [redigido] vazou',
    ],
  ])('Dado %s, Quando limpa, Então vira marcador', (_caso, input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it('Dado UUID, Quando limpa, Então o id fica', () => {
    const id = '12345678-90ab-4def-8123-4567890abcde';

    expect(scrubText(`conta ${id}`)).toBe(`conta ${id}`);
  });
});
