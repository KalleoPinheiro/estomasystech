---
title: "ADR 089 — R4 na emissão de documento clínico"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-02
related:
  - docs/adr/079-r4-nas-acoes-de-consulta.md
  - docs/adr/082-documentos-imprimiveis-no-servidor-com-ilha-de-emissao.md
  - docs/domains/acesso/README.md
  - docs/domains/pacientes-prontuario/README.md
---

# ADR 089 — R4 na emissão de documento clínico

- **Data:** 2026-11-01
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#636](https://github.com/KalleoPinheiro/estomasystech/issues/636), achada na revisão do #635 / [ADR-082](082-documentos-imprimiveis-no-servidor-com-ilha-de-emissao.md)).
- **Domínios afetados:** acesso, pacientes-prontuário (documentos).

## Contexto

`issueDocumentFor` (`POST /api/documents/issue` e Server Action `issueDocument`) só exigia papel de equipe. Um Profissional emitia, e gravava o evento de emissão, de documento de paciente sem vínculo com ele, ou de recurso que nem existia. O mesmo vale para o repasse de outro profissional.

## Decisão

1. **Um só lugar:** `src/lib/server/document-authorization.ts` (`authorizeDocumentIssuance`), chamado por `issueDocumentFor` antes da transação. Rota e ação passam pela mesma guarda, e a tentativa negada não grava nem audita.
2. **Resolução por tipo** (`documentType` + `resourceId`, no escopo da empresa): atestado → consulta; consentimento → paciente; plano de cuidados → plano; relatório → condição; recibo → fatura (`invoiceId`); repasse → repasse.
3. **Regra (PO):** recurso inexistente ou de outra empresa é `404` **para todos os papéis** (emenda da [#674](https://github.com/KalleoPinheiro/estomasystech/issues/674)), sem gravar evento; Profissional sem vínculo R4 com o paciente do recurso é `403`; no repasse, o Profissional só emite o **próprio** (de outro é `403`). Admin e Atendente com recurso válido: sem mudança. O vínculo R4 continua só do Profissional.
4. **Recibo sem `invoiceId`** segue como erro de validação (`400`) da própria emissão.
5. **Cópia (#657):** `NotFoundError` concorda no feminino para «Fatura» («Fatura não encontrada»). O status 200 das páginas fica (decisão do PO).

## Alternativas

- **Checar a existência só para o Profissional (versão inicial):** deixava Admin e Atendente gravarem evento e gerarem número para id inventado. Substituída pela decisão do PO na [#674](https://github.com/KalleoPinheiro/estomasystech/issues/674): a resolução do recurso vale para todos os papéis.
- **404 para Profissional sem vínculo (como na leitura da ficha):** decisão do PO foi `403` na emissão.

## Consequências

- Profissional deixa de emitir documento de paciente alheio pela tela e pela API.
- Não há mais evento de emissão órfão: Admin e Atendente também recebem `404` para recurso inexistente ou de outra empresa, e o número ATST/TCLE/PLAN/REL/REP/REC só sai para documento que existe (#674).
- Custo: uma leitura do recurso a mais por emissão de Admin e Atendente, antes da transação.
