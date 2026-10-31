import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ZodError, z } from 'zod';
import {
  InvalidStatusTransitionError,
  NotFoundError,
  SchedulingConflictError,
  ValidationError,
} from '@/domain/shared/errors';
import { describeFailure, fail, handleRequest, ok } from '@/lib/api-response';

describe('Feature: Envelope de resposta da API', () => {
  it('Dado dado de sucesso, Quando ok(), Então envelope success com status 200 por padrão', async () => {
    const response = ok({ id: '1' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { id: '1' }, error: null });
  });

  it('Dado status customizado, Quando ok(), Então usa o status informado', async () => {
    const response = ok({ id: '1' }, 201);

    expect(response.status).toBe(201);
  });

  it('Dado mensagem e status, Quando fail(), Então envelope de erro', async () => {
    const response = fail('Não encontrado', 404);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      data: null,
      error: 'Não encontrado',
    });
  });
});

describe('Feature: handleRequest — tradução de erros em envelope HTTP', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado action bem-sucedida, Quando handleRequest, Então 200 com o dado retornado', async () => {
    const response = await handleRequest(async () => ({ ok: true }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, data: { ok: true }, error: null });
  });

  it("Dado erro de validação Zod, Quando handleRequest, Então 400 com mensagem 'Dados inválidos' e detalhe", async () => {
    const schema = z.object({ email: z.string().email() });

    const response = await handleRequest(async () => {
      try {
        schema.parse({ email: 'invalido' });
      } catch (error) {
        throw error as ZodError;
      }
      return null;
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Dados inválidos');
    expect(body.error).toContain('email');
  });

  it('Dado NotFoundError, Quando handleRequest, Então 404 sem o id na mensagem; o id vai só para o log (#219)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const id = '4f3c105f-1111-4222-8333-944445555666';
    const response = await handleRequest(async () => {
      throw new NotFoundError('Paciente', id);
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Paciente não encontrado(a)');
    expect(body.error).not.toContain(id);
    expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
      msg: '[api] 404',
      entity: 'Paciente',
      entityId: id,
    });
    info.mockRestore();
  });

  it('Dado SchedulingConflictError, Quando handleRequest, Então 409', async () => {
    const response = await handleRequest(async () => {
      throw new SchedulingConflictError('Conflito de horário');
    });

    expect(response.status).toBe(409);
  });

  it('Dado InvalidStatusTransitionError, Quando handleRequest, Então 409', async () => {
    const response = await handleRequest(async () => {
      throw new InvalidStatusTransitionError('Transição inválida');
    });

    expect(response.status).toBe(409);
  });

  it('Dado outro DomainError (ex. ValidationError), Quando handleRequest, Então 400', async () => {
    const response = await handleRequest(async () => {
      throw new ValidationError('Campo obrigatório');
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Campo obrigatório');
  });

  it('Dado erro genérico não tratado, Quando handleRequest, Então 500 e loga no console', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handleRequest(async () => {
      throw new Error('Falha inesperada');
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Erro interno do servidor');
    expect(JSON.parse(String(consoleSpy.mock.calls[0][0]))).toMatchObject({
      level: 'error',
      msg: 'Erro inesperado na API:',
      error: { name: 'Error', stack: expect.any(String) },
    });
  });

  it('Dado erro de validação aninhado em body (Server Action), Quando descreve a falha, Então o campo vem sem «body.» e o texto em português', () => {
    const schema = z.object({
      id: z.string(),
      body: z.object({ title: z.string().min(1) }),
    });
    const parsed = schema.safeParse({ id: 'x', body: { title: '' } });
    if (parsed.success) throw new Error('esperava falhar');

    const { message, status } = describeFailure(parsed.error);

    expect(status).toBe(400);
    expect(message).toMatch(/^Dados inválidos: title: /);
    expect(message).not.toContain('body.');
    expect(message).not.toMatch(/Too small|expected string|Invalid input/);
  });

  it('Dado erro de validação no próprio campo body, Quando descreve a falha, Então o caminho de um nível não perde o nome', () => {
    const parsed = z.object({ body: z.string() }).safeParse({ body: 1 });
    if (parsed.success) throw new Error('esperava falhar');

    expect(describeFailure(parsed.error).message).toMatch(
      /^Dados inválidos: body: /,
    );
  });

  it('Dado erro aninhado em body com vários níveis, Quando descreve a falha, Então só o «body.» sai e o resto fica unido por ponto', () => {
    const parsed = z
      .object({
        id: z.string(),
        body: z.object({ a: z.object({ b: z.string() }) }),
      })
      .safeParse({ id: 'x', body: { a: { b: 1 } } });
    if (parsed.success) throw new Error('esperava falhar');

    expect(describeFailure(parsed.error).message).toMatch(
      /^Dados inválidos: a\.b: /,
    );
  });

  it('Dado erro em campo que não é body (rota), Quando descreve a falha, Então o caminho completo é mantido', () => {
    const parsed = z
      .object({ id: z.string(), pessoa: z.object({ nome: z.string() }) })
      .safeParse({ id: 'x', pessoa: { nome: 1 } });
    if (parsed.success) throw new Error('esperava falhar');

    expect(describeFailure(parsed.error).message).toMatch(
      /^Dados inválidos: pessoa\.nome: /,
    );
  });

  it('Dados dois erros, Quando descreve a falha, Então são separados por «; »', () => {
    const parsed = z
      .object({ a: z.string(), b: z.string() })
      .safeParse({ a: 1, b: 2 });
    if (parsed.success) throw new Error('esperava falhar');

    expect(describeFailure(parsed.error).message).toMatch(/a: .+; b: /);
  });
});
