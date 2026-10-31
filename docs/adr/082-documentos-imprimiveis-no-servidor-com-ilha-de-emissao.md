---
title: "ADR 082 — Documentos imprimíveis no servidor, com ilha de emissão e trava por documento"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
related:
  - docs/adr/069-performance-front-linha-de-base.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/domains/pacientes-prontuario/README.md
  - docs/domains/financeiro/README.md
---

# ADR 082 — Documentos imprimíveis no servidor, com ilha de emissão e trava por documento

- **Data:** 2026-10-31
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#546](https://github.com/KalleoPinheiro/estomasystech/issues/546)). Aplica o [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md) aos documentos.
- **Domínios afetados:** pacientes-prontuário (atestado, consentimento, plano de cuidados, relatório) e financeiro (recibo, repasse).

## Contexto

As seis páginas `/documentos/{atestado,consentimento,plano-cuidados,recibo,relatorio,repasse}/…` eram `'use client'` e buscavam tudo por `/api` depois da hidratação (clínica, consulta, paciente, fatura, plano…), esperando ainda a emissão (`POST /api/documents/issue`) para só então desenhar o documento: FCP de 2 956 ms no celular. A emissão grava (número e trilha de auditoria), e a regra «achar ou criar» não tinha restrição única: duas abas abertas ao mesmo tempo podiam criar dois eventos, e o documento reimpresso trocar de número.

## Decisão

1. **A página inteira renderiza no servidor.** Cada `page.tsx` é Server Component: `requireStaffPage` (sessão ausente vai a `/login?next=…`), leituras em paralelo com `loadBlock`, guardas decididas antes de renderizar (clínica incompleta, consulta não realizada, recibo sem CPF/CNPJ, plano ou relatório vazio, documento de outra empresa = 404). O conteúdo e a mensagem de bloqueio saem no HTML, com status 200 como antes. `DocumentFrame` virou componente de servidor.
2. **Emissão não acontece no render.** Server Component não grava em GET: o render pode repetir e a pré-busca do Next o dispararia. A ilha de cliente `IssueDocument` (`src/components/issue-document.tsx`) chama a Server Action `issueDocument` (`src/app/documentos/actions.ts`, `defineAction`, `access: staff`) **uma vez** ao montar, com guarda `useRef` contra o disparo duplo do modo estrito. Só o botão Imprimir (`print-button.tsx`) e o número/data são ilhas. Número e data ficam em espaço reservado com o mesmo texto, invisível (CLS 0); o Imprimir só liga com a emissão feita; falha de emissão aparece no alerta e nunca imprime sem número. **Página bloqueada não monta a ilha**, então não emite nem audita (#468).
3. **Reimpressão já sai com o número.** A página lê (`findDocumentIssuance`, só leitura) a emissão que já existe e a entrega à moldura: o número aparece no HTML e a ilha não chama a ação. A primeira abertura emite pela ilha.
4. **Uma regra de emissão para a rota e para a ação.** `src/lib/server/document-issuance.ts` (`issueDocumentFor`) guarda tipos, prefixos, `zod`, a guarda do recibo (`ResolveReceipt`, FIN-RN-15) e o «achar ou criar». `POST /api/documents/issue` continua e chama a mesma função. A ação usa `audit: false` (a emissão **é** o evento `create` do documento, gravado dentro da própria função) e `refresh: false` (novo campo de `defineAction`: reler a página repetiria a leitura auditada do prontuário).
5. **«Achar ou criar» sem duplicar (pergunta aberta do brief, decidida aqui).** A emissão roda numa transação com `pg_advisory_xact_lock` por empresa + tipo + recurso (`AuditEventRepository.lockResource`). A segunda chamada espera a primeira confirmar e então encontra o evento dela. Provado em Postgres real: 12 emissões simultâneas, sem a trava dá 2 eventos, com a trava dá 1 (`tests/integracao/documentos-emissao-concorrente.integracao.ts`). **Por que não um índice único:** a trilha é append-only e eventos duplicados que já existam em produção (a corrida era possível) fariam a migração falhar; e `audit_events` é genérica. A trava não muda dado nem exige migração. **Correção junto:** a emissão passa a ser o evento `create` **mais antigo** do documento; antes valia o mais recente de qualquer ação, e o `read` que o recibo grava ao ler o CPF (mesmo tipo e id) podia trocar o número na reimpressão.
6. **Leituras por função de dados, divididas com a rota.** `src/lib/server/data/clinic-info.ts` (`GET /api/clinic-info` e `…/legal-controller` chamam a mesma função), `care-plan.ts` (`GET /api/care-plans/[id]`) e `documents.ts` (consulta, fatura, partes do recibo com a leitura do CPF auditada, comprovante de repasse, condição, avaliações, profissional do plano). R4 do Profissional e auditoria de leitura ficam como nas rotas. Valor de recibo e repasse não muda (`invoices.ts`, `payouts.ts`, #547).
7. **Assinatura do plano de cuidados (DOC-11).** A página busca o profissional que prescreveu o plano (`getPrescribingProfessionalFor`). Antes a tela pedia `GET /api/professionals/:id`, que não existe (só `PATCH`), e a assinatura nunca saía com o nome dele em produção; os testes simulavam a rota. Agora sai como a regra sempre disse.

## Consequências

- As seis páginas saem de `scripts/server-first-allowlist.json`; `src/lib/use-document-issuance.ts` foi removido (substituído pela ilha).
- `AuditEventRepository` ganha `lockResource` (no-op em memória). Quem mocka o repositório precisa do método.
- Continua em aberto, fora do #546: a emissão não faz R4 do recurso (qualquer papel de equipe emite o evento de qualquer id da própria empresa, como na rota antes). O que protege é a leitura do conteúdo, que aplica R4.
