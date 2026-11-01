'use server';

import { defineAction } from '@/lib/server/define-action';
import {
  issueDocumentFor,
  issueDocumentSchema,
} from '@/lib/server/document-issuance';

/**
 * Emissão do documento impresso (#546, ADR-082): a página renderiza o conteúdo
 * no servidor e a ilha `IssueDocument` chama esta ação UMA vez ao montar, porque
 * Server Component não grava em GET (o render repete e a pré-busca o dispara).
 * Mesma regra de `POST /api/documents/issue`, incluindo o recibo sem CPF/CNPJ
 * (FIN-RN-15).
 *
 * `audit: false` é decisão explícita: a emissão É o evento de auditoria do
 * documento (`create`), gravado por `issueDocumentFor` na mesma transação que a
 * trava da emissão. `refresh: false`: reler a página repetiria a leitura
 * auditada do prontuário.
 */
export const issueDocument = defineAction({
  access: { kind: 'staff' },
  input: issueDocumentSchema,
  audit: false,
  refresh: false,
  handler: async ({ input, session }) => issueDocumentFor(session, input),
});
