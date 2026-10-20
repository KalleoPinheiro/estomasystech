import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Matriz de exceções do prontuário (ADR-049): casos aplicáveis que não tinham
 * teste próprio.
 */
describe('Feature: Evolução SOAP imutável (PRO-RN-02)', () => {
  describe('Cenário: a API não oferece como alterar ou apagar uma evolução registrada', () => {
    it('Dada a rota de evoluções do paciente, Quando listar os métodos exportados, Então só existem GET e POST', async () => {
      const rota = await import('@/app/api/patients/[id]/evolutions/route');

      const metodos = Object.keys(rota)
        .filter((nome) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(nome))
        .sort();

      expect(metodos).toEqual(['GET', 'POST']);
    });

    it('Dado o código das rotas de paciente, Quando procurar rota por id de evolução, Então não existe', () => {
      const pasta = join(
        process.cwd(),
        'src/app/api/patients/[id]/evolutions/[evolutionId]',
      );

      expect(existsSync(pasta)).toBe(false);
    });
  });
});
