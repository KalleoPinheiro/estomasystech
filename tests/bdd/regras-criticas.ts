/**
 * Regras de negócio críticas e o cenário executável que garante cada uma
 * (ADR-048, issue #407). Chave: id `*-RN-*` da tabela de `docs/domains/<d>/README.md`.
 *
 * Crítica = regra cuja falha causa dano que a clínica não desfaz: vazamento ou
 * adulteração de dado de saúde, dinheiro cobrado ou repassado errado, acesso
 * entre papéis ou empresas, conflito de agenda. Regra nova com esse perfil entra
 * aqui no mesmo PR que a cria; a tabela do domínio continua sendo a fonte da regra.
 *
 * Cada cenário aponta o arquivo e um trecho exato do título do `describe`/`it`
 * (Dado/Quando/Então). O teste de rastreabilidade falha se a regra não existe na
 * documentação, se ela não tem cenário, ou se o título citado sumiu do arquivo.
 */
export interface CenarioVinculado {
  arquivo: string;
  /** Trecho literal do título do describe/it, no formato Dado/Quando/Então. */
  titulo: string;
}

export const REGRAS_CRITICAS: Record<string, readonly CenarioVinculado[]> = {
  'ACE-RN-05': [
    {
      arquivo: 'tests/domain/role-hierarchy.test.ts',
      titulo: 'Cenário: só existe um super_admin (ADR-007)',
    },
    {
      arquivo: 'tests/domain/role-hierarchy.test.ts',
      titulo: 'Cenário: patient e partner nunca cadastram ninguém (RBAC-10)',
    },
  ],
  'ACE-RN-23': [
    {
      arquivo: 'tests/domain/cnpj.test.ts',
      titulo: 'Cenário: dígito verificador errado é recusado',
    },
  ],
  'ACE-RN-41': [
    {
      arquivo: 'tests/domain/password-policy.test.ts',
      titulo: 'Dada senha de 9 caracteres, Então recusa pelo tamanho',
    },
    {
      arquivo: 'tests/domain/password-policy.test.ts',
      titulo: 'Dada senha da lista, Então recusa como comum',
    },
  ],
  'AGE-RN-02': [
    {
      arquivo: 'tests/domain/appointment.test.ts',
      titulo:
        'Dado duas consultas com horários sobrepostos, Quando verificar conflictsWith, Então retorna true',
    },
    {
      arquivo: 'tests/domain/appointment.test.ts',
      titulo:
        'Dado consulta cancelada sobreposta, Quando verificar conflictsWith, Então retorna false',
    },
  ],
  'AGE-RN-04': [
    {
      arquivo: 'tests/domain/appointment.test.ts',
      titulo:
        'Dado consulta cancelada, Quando confirmar, Então lança InvalidStatusTransitionError',
    },
  ],
  'AGE-RN-07': [
    {
      arquivo: 'tests/domain/waitlist-policy.test.ts',
      titulo: 'Dado exatamente 24h antes, Então ainda não é tardio',
    },
  ],
  'AGE-RN-08': [
    {
      arquivo: 'tests/domain/waitlist-policy.test.ts',
      titulo: 'Dado janela de exatamente 180 dias, Quando criar, Então aceita',
    },
  ],
  'EST-RN-01': [
    {
      arquivo: 'tests/domain/inventory-followup.test.ts',
      titulo:
        'Dado saída maior que estoque, Quando registrar, Então lança InsufficientStockError',
    },
  ],
  'EST-RN-02': [
    {
      arquivo: 'tests/bdd/cenarios-criticos.test.ts',
      titulo:
        'Dado movimentação sem motivo, Quando registrar, Então é recusada e nada entra no histórico',
    },
  ],
  'EST-RN-03': [
    {
      arquivo: 'tests/bdd/cenarios-criticos.test.ts',
      titulo:
        'Dado saída com preço congelado, Quando o insumo é reajustado depois, Então o custo do atendimento não muda',
    },
  ],
  'FIN-RN-01': [
    {
      arquivo: 'tests/domain/invoice.test.ts',
      titulo:
        'Dado fatura já paga, Quando pagar de novo, Então lança InvalidStatusTransitionError',
    },
  ],
  'FIN-RN-02': [
    {
      arquivo: 'tests/domain/invoice-payments.test.ts',
      titulo:
        'Dado fatura de R$ 200, Quando receber R$ 50, Então continua pendente com saldo de R$ 150',
    },
  ],
  'FIN-RN-03': [
    {
      arquivo: 'tests/domain/invoice-payments.test.ts',
      titulo:
        'Dado R$ 150 já recebidos, Quando o desconto deixaria o líquido abaixo disso, Então ValidationError',
    },
  ],
  'FIN-RN-04': [
    {
      arquivo: 'tests/domain/invoice-payments.test.ts',
      titulo:
        'Dado pagamento parcial, Quando cancelar, Então ConflictError orientando o desconto',
    },
  ],
  'PRO-RN-02': [
    {
      arquivo: 'tests/bdd/cenarios-criticos.test.ts',
      titulo:
        'Dado evolução registrada, Quando procurar como alterá-la, Então o prontuário não oferece operação de edição',
    },
  ],
  'PRO-RN-05': [
    {
      arquivo: 'tests/application/clinical.test.ts',
      titulo:
        'Dado condição resolvida, Quando avaliar, Então lança ValidationError',
    },
  ],
  'PRO-RN-07': [
    {
      arquivo: 'tests/domain/image-sanitizer.test.ts',
      titulo:
        'Dado JPEG com APP1 (EXIF) e COM, Quando sanitizar, Então remove metadados',
    },
  ],
  'POR-RN-03': [
    {
      arquivo: 'tests/bdd/cenarios-criticos.test.ts',
      titulo:
        'Dada consulta a menos de 24 h, Quando o paciente tenta cancelar pelo portal, Então a recusa manda falar com a clínica',
    },
  ],
};
