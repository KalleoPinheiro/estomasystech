---
title: "Pacientes e prontuário — matriz de exceções"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
domain: pacientes-prontuario
related: [docs/adr/049-matriz-de-excecoes-por-dominio.md]
---

# Pacientes e prontuário — matriz de exceções

> **TL;DR:** para cada categoria de exceção, o caso do prontuário e o teste que o prova. Teste citado que sumiu
> ou mudou de título quebra `tests/bdd/matriz-excecoes.test.ts`. Regras em [`README.md`](README.md).

| Categoria | Caso | Regra | Teste |
| --- | --- | --- | --- |
| entrada inválida | Nome do paciente curto demais | PRO-RN-01 | `tests/domain/patient.test.ts` › "Dado nome muito curto, Quando criar, Então lança ValidationError" |
| entrada inválida | Telefone vazio, sem DDD ou internacional na criação ou atualização | PRO-RN-18 | `tests/domain/patient.test.ts` › "Dado telefone vazio, Quando criar, Então lança ValidationError" ; `tests/domain/patient.test.ts` › "Quando troca por um telefone inválido, Então rejeita" |
| entrada inválida | CPF com dígito verificador errado | PRO-RN-22 | `tests/domain/patient.test.ts` › "Dado CPF com dígito verificador errado, Quando criar, Então ValidationError" ; `tests/api/receipt-cpf-routes.test.ts` › "Dado CPF com dígito verificador errado, Quando cadastrar, Então 400 com a mensagem" |
| entrada inválida | Evolução SOAP sem nenhum campo | PRO-RN-02 | `tests/domain/clinical.test.ts` › "Dado todos os campos vazios, Quando criar, Então lança ValidationError" ; `tests/api/clinical-routes.test.ts` › "Dado todos os campos SOAP vazios, Quando POST /api/patients/:id/evolutions, Então retorna 400 de regra de negócio" |
| entrada inválida | Estomia sem tipo | PRO-RN-04 | `tests/domain/clinical.test.ts` › "Dado estomia sem tipo, Quando criar, Então lança ValidationError" |
| sem permissão | Atendente exporta os dados do titular | PRO-RN-11 | `tests/api/patient-export-access.test.ts` › "Dado atendente, Quando GET export, Então 403 sem dados" |
| sem permissão | Profissional sem vínculo abre o paciente ou atua nele | PRO-RN-08 | `tests/api/professional-patient-scope-guard.test.ts` › "Dado profissional SEM vínculo, Quando GET, Então 404 (não vaza existência)" ; `tests/api/professional-resource-scope.test.ts` › "Dado profissional sem vínculo, Quando DELETE foto, Então a foto continua existindo" |
| sem permissão | Profissional ou Atendente na fila de pedidos do titular | PRO-RN-16 | `tests/api/data-subject-rights.test.ts` › "Dada sessão de %s, Quando abre a fila ou decide, Então 403" |
| sem permissão | Profissional vincula ou edita responsável | PRO-RN-21 | `tests/api/guardian-routes.test.ts` › "Dado o Profissional, Quando vincular responsável pelo paciente, Então 403 e o vínculo não muda" |
| sem permissão | Super Admin lê foto de qualquer empresa | PRO-RN-13 | `tests/api/photo-binary-read.test.ts` › "Dada sessão super_admin, Quando GET binário de qualquer empresa, Então 403 (ADR-007, ACE-RN-10)" |
| sem permissão | Paciente envia foto sem consentimento vigente | PRO-RN-06 | `tests/api/auth-portal-gaps.test.ts` › "Dado paciente sem consentimento vigente, Quando POST photos no portal, Então 403 e nada é gravado (COMP3-01)" |
| outra clínica | Paciente de outra empresa por id ou na lista | PRO-RN-08 | `tests/api/patient-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando GET /api/patients/:id de paciente da clínica B, Então 404" |
| outra clínica | Foto de outra empresa (binário e triagem) | PRO-RN-13 | `tests/api/photo-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando GET binário de foto criada na clínica B, Então 404" |
| outra clínica | Evolução e consentimento de outra empresa | PRO-RN-12 | `tests/api/evolution-note-tenant-isolation.test.ts` › "Dada sessão da clínica A, Quando GET evoluções de paciente da clínica B, Então lista vazia (isolada pelo escopo do paciente)" ; `tests/infrastructure/consent-record-tenant-isolation.test.ts` › "Dado consentimento salvo pela clínica A, Quando a clínica B busca pelo mesmo patientId, Então não encontra nada" |
| outra clínica | Responsável e pedido do titular de outra empresa | PRO-RN-16 | `tests/api/guardian-routes.test.ts` › "Dado responsável de outra empresa, Quando ler, editar, excluir ou vincular, Então 404/400 e a lista não vaza" ; `tests/api/data-subject-rights.test.ts` › "Dado pedido na clínica B, Então a fila da clínica A não o mostra e o Admin de A recebe 404 ao decidir" |
| duplicidade | Segundo pedido do titular pendente do mesmo tipo | PRO-RN-16 | `tests/api/data-subject-rights.test.ts` › "Quando o paciente pede correção, Então o pedido fica pendente, auditado, e um segundo igual é 409" ; `tests/infrastructure/data-subject-request-repository.test.ts` › "dois pedidos pendentes do mesmo tipo: o índice único barra o segundo (409)" |
| duplicidade | E-mail de contato repetido entre pacientes é permitido | PRO-RN-20 | `tests/api/api-flow.test.ts` › "Dado e-mail já usado por outro paciente, Quando POST /api/patients, Então aceita: e-mail de contato é repetível (#325)" |
| duplicidade | Registrar de novo o consentimento em papel | PRO-RN-19 | `tests/api/partner-share-consent-routes.test.ts` › "Dado consentimento em papel ativo, Quando registrar de novo, Então idempotente (sem novo evento)" |
| concorrência | Duas decisões sobre o mesmo pedido do titular | PRO-RN-16 | `tests/infrastructure/data-subject-request-repository.test.ts` › "duas decisões sobre o mesmo pedido: só a primeira grava" |
| concorrência | Leitura do paciente com trava de linha (baixa e fatura concorrentes) | PRO-RN-01 | `tests/infrastructure/drizzle-patient-lock.test.ts` › "findByIdForUpdate trava a linha do paciente (SELECT … FOR UPDATE)" |
| falha de integração | Falha ao gravar metadados da foto: o arquivo órfão é removido | PRO-RN-07 | `tests/application/clinical-gaps.test.ts` › "Dado falha ao salvar metadados, Quando enviar foto, Então remove o arquivo órfão e propaga o erro" |
| falha de integração | Falha no e-mail ao abrir ou decidir pedido do titular não desfaz o pedido | PRO-RN-16 | `tests/api/data-subject-rights.test.ts` › "Dada falha no envio, Quando o paciente abre um pedido, Então o pedido é criado mesmo assim" ; `tests/application/data-subject-requests.test.ts` › "falha no envio não desfaz a decisão" |
| falha de integração | Falha na auditoria: nada é gravado nem enviado (write-ahead) | PRO-RN-16 | `tests/api/data-subject-rights.test.ts` › "Dada falha na auditoria, Quando o paciente abre ou o Admin decide, Então nada é gravado nem enviado (write-ahead)" |
| estado terminal | Evolução SOAP registrada não tem rota para alterar ou apagar | PRO-RN-02 | `tests/api/prontuario-excecoes.test.ts` › "Dada a rota de evoluções do paciente, Quando listar os métodos exportados, Então só existem GET e POST" |
| estado terminal | Condição resolvida não recebe avaliação nem resolve de novo | PRO-RN-05 | `tests/api/clinical-routes.test.ts` › "Dado condição resolvida, Quando POST assessments, Então retorna 400 de regra de negócio" ; `tests/api/clinical-routes.test.ts` › "Dado condição já resolvida, Quando PATCH resolve novamente, Então retorna 409" |
| estado terminal | Paciente anonimizado não é reativado | PRO-RN-17 | `tests/domain/patient.test.ts` › "Dado paciente anonimizado, Quando reativar, Então recusa com erro claro" ; `tests/api/accounts-anonymized.test.ts` › "Dado paciente anonimizado, Quando a equipe tenta reativar, Então 409 e o cadastro segue inativo" |
| estado terminal | Pedido do titular já decidido não é decidido de novo | PRO-RN-16 | `tests/infrastructure/data-subject-request-repository.test.ts` › "duas decisões sobre o mesmo pedido: só a primeira grava" |
