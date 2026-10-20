import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface SupplyPayload {
  id: string;
  stockQty: number;
}

/**
 * Matriz de exceções do estoque (ADR-049): permissão por papel e corrida entre
 * duas baixas, que não tinham teste de rota próprio.
 */
describe('Feature: Estoque — exceções de permissão e de concorrência (EST-RN-01, EST-RN-06)', () => {
  let suppliesRoute: typeof import('@/app/api/supplies/route');
  let movementsRoute: typeof import('@/app/api/supplies/[id]/movements/route');

  beforeAll(async () => {
    suppliesRoute = await import('@/app/api/supplies/route');
    movementsRoute = await import('@/app/api/supplies/[id]/movements/route');
  });

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  const criarInsumo = async (nome: string): Promise<string> => {
    const response = await suppliesRoute.POST(
      jsonRequest('/api/supplies', 'POST', {
        name: nome,
        unit: 'unidade',
        minQty: 1,
        priceCents: 1000,
      }),
    );
    return ((await response.json()) as Envelope<SupplyPayload>).data.id;
  };

  const movimentar = (
    id: string,
    type: 'in' | 'out',
    quantity: number,
    headers?: Record<string, string>,
  ) =>
    movementsRoute.POST(
      jsonRequest(
        `/api/supplies/${id}/movements`,
        'POST',
        { type, quantity, reason: 'Teste de exceção' },
        headers,
      ),
      context(id),
    );

  const saldoDe = async (id: string): Promise<number | undefined> => {
    const response = await suppliesRoute.GET(
      jsonRequest('/api/supplies', 'GET'),
    );
    const body = (await response.json()) as Envelope<SupplyPayload[]>;
    return body.data.find((supply) => supply.id === id)?.stockQty;
  };

  describe('Cenário: só o Admin de Empresa mexe no estoque', () => {
    it.each(['atendente', 'profissional'] as const)(
      'Dado %s, Quando cadastrar insumo ou registrar movimentação, Então 403 e nada é gravado',
      async (papel) => {
        const id = await criarInsumo(`Insumo permissão ${papel}`);
        const headers = cookieHeaderFor(papel, `${papel}@x.com`);

        const cadastro = await suppliesRoute.POST(
          jsonRequest(
            '/api/supplies',
            'POST',
            { name: 'Não deve existir', unit: 'un', minQty: 0, priceCents: 1 },
            headers,
          ),
        );
        const entrada = await movimentar(id, 'in', 5, headers);

        expect(cadastro.status).toBe(403);
        expect(entrada.status).toBe(403);
        expect(await saldoDe(id)).toBe(0);
      },
    );

    it('Dada sessão de paciente, Quando listar insumos, Então 403', async () => {
      const response = await suppliesRoute.GET(
        jsonRequest(
          '/api/supplies',
          'GET',
          undefined,
          cookieHeaderFor('patient', 'paciente@x.com'),
        ),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Cenário: duas baixas simultâneas nunca deixam o estoque negativo', () => {
    it('Dado saldo 10, Quando duas saídas de 6 chegam juntas, Então só uma passa e o saldo fica 4', async () => {
      const id = await criarInsumo('Insumo corrida');
      await movimentar(id, 'in', 10);

      const [a, b] = await Promise.all([
        movimentar(id, 'out', 6),
        movimentar(id, 'out', 6),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 400]);
      expect(await saldoDe(id)).toBe(4);
    });
  });
});
