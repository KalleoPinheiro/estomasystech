---
title: "Comunicação — matriz de exceções"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
domain: comunicacao
related: [docs/adr/049-matriz-de-excecoes-por-dominio.md]
---

# Comunicação — matriz de exceções

> **TL;DR:** para cada categoria de exceção, o caso de lembretes, canal de e-mail e WhatsApp e o teste que o prova.
> Teste citado que sumiu ou mudou de título quebra `tests/bdd/matriz-excecoes.test.ts`. Regras em [`README.md`](README.md).

| Categoria | Caso | Regra | Teste |
| --- | --- | --- | --- |
| entrada inválida | Remetente inválido ou provedor fora da lista ao salvar o canal | COM-RN-11 | `tests/api/email-channel-settings.test.ts` › "remetente inválido num canal existente: 400 e o canal fica como estava" ; `tests/api/email-channel-settings.test.ts` › "provider fora da lista: 400" |
| entrada inválida | Corpo inválido no clique de WhatsApp | COM-RN-08 | `tests/api/reminders-routes.test.ts` › "C29 400 com corpo inválido" |
| entrada inválida | Telefone inválido não gera link nem conta como clique | PRO-RN-18 | `tests/api/reminders-routes.test.ts` › "C21b telefone inválido não gera link nem conta como clique, e o motivo chega à recepção" |
| entrada inválida | APP_URL sem esquema não gera link no e-mail | COM-RN-02 | `tests/application/send-reminders.test.ts` › "C4 APP_URL sem esquema não gera link" |
| sem permissão | Job de lembretes sem segredo ou com segredo errado | COM-RN-05 | `tests/api/reminders-run.test.ts` › "vercel cron bearer: GET sem Bearer ou com segredo errado → 401; com Bearer $CRON_SECRET executa" ; `tests/api/audit-lgpd-routes.test.ts` › "Dado CRON_SECRET não configurado, Quando POST reminders/run, Então retorna 503" |
| sem permissão | Paciente e parceiro no clique de WhatsApp | COM-RN-08 | `tests/api/reminders-routes.test.ts` › "C28 403 para paciente e parceiro" |
| sem permissão | Quem não é Admin de Empresa configura o canal | COM-RN-11 | `tests/api/email-channel-settings.test.ts` › "403 para quem não é company_admin" |
| outra clínica | Cada clínica envia pelo próprio canal e leva o próprio nome | COM-RN-07 | `tests/application/send-reminders.test.ts` › "Dado duas empresas, Quando rodar, Então cada e-mail leva o nome da própria clínica" ; `tests/api/reminders-run-channel.test.ts` › "canal de cada clínica: A sai pela chave dela, B (sem canal) pula sem log, e o resumo traz o canal por clínica" |
| outra clínica | Referência de outra empresa no clique de WhatsApp | COM-RN-08 | `tests/api/reminders-routes.test.ts` › "C30 404 para referência de outra empresa" |
| outra clínica | Admin de outra clínica não vê nem apaga o canal | COM-RN-11 | `tests/api/email-channel-settings.test.ts` › "outra clínica: o admin de B não vê nem apaga o canal de A" |
| duplicidade | Segunda execução do dia não reenvia a confirmação | COM-RN-03 | `tests/application/send-reminders.test.ts` › "C16 segunda execução do dia não reenvia" |
| duplicidade | Segundo clique de WhatsApp devolve o link e mantém um registro | COM-RN-03 | `tests/api/reminders-routes.test.ts` › "C24 segundo clique devolve o link e mantém um registro" |
| concorrência | Cliques simultâneos de WhatsApp deixam um registro | COM-RN-03 | `tests/api/reminders-routes.test.ts` › "C25 POSTs concorrentes deixam um registro" |
| falha de integração | Falha de envio conta failed, não grava log e o lote segue | COM-RN-07 | `tests/application/send-reminders.test.ts` › "C6 falha de envio conta failed, não grava log e o lote segue" |
| falha de integração | Falha numa empresa não impede as demais | COM-RN-07 | `tests/application/send-reminders.test.ts` › "C9 falha de uma empresa não impede as demais" ; `tests/api/reminders-run-clinic-failure.test.ts` › "C10 resposta traz a empresa que falhou com error e contadores zerados" |
| falha de integração | Clínica sem canal roda em dry-run e não falha | COM-RN-04 | `tests/application/send-reminders.test.ts` › "C7 dry-run loga, pula e não grava log" ; `tests/api/reminders-routes.test.ts` › "C7 run sem canal da clínica responde 200 com channel none" |
| falha de integração | Provedor recusa o e-mail de teste do canal | COM-RN-12 | `tests/api/email-channel-test.test.ts` › "provedor recusa: 200 com lastStatus failed e lastError ≤ 300 caracteres, com a mensagem e sem o destinatário" |
| estado terminal | Recall não envia depois da terceira tentativa | COM-RN-06 | `tests/application/send-reminders.test.ts` › "C13 após a 3ª tentativa não envia mais" |
| estado terminal | Retorno resolvido não recebe nova tentativa | COM-RN-06 | `tests/application/send-reminders.test.ts` › "C15 retorno resolvido não recebe próxima tentativa" |
| estado terminal | Clínica suspensa fica fora do job; reativada, volta | COM-RN-09 | `tests/api/reminders-run-suspended.test.ts` › "Dada clínica suspensa com consulta amanhã, Quando o job roda, Então nenhum e-mail sai para ela; reativada, o próximo disparo a processa" |
