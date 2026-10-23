---
title: "Homologação — casos de validação e contas do seed"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/engineering/homologacao.md, docs/adr/049-matriz-de-excecoes-por-dominio.md, docs/adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md]
---

# Homologação: casos de validação e contas do seed

> **TL;DR:** quem testa a staging escolhe a conta na tabela abaixo e reproduz os casos de validação do
> domínio. A fonte de cada caso e do teste automatizado que o prova é a matriz de exceções do domínio
> ([ADR-049](../adr/049-matriz-de-excecoes-por-dominio.md)); este arquivo só diz **com qual conta e dado**
> reproduzir na staging. Contas e senha: [`homologacao.md`](homologacao.md) § 4. Sem segundo fator na staging
> ([ADR-054](../adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md)).

Legenda da coluna **Reproduz**: `UI` = dá para ver pela tela com a conta indicada; `UI + massa` = depende
de dado do seed (listado em `homologacao.md` § 4); `auto` = só o teste automatizado prova (corrida entre
requisições, falha de provedor, relógio), sem tela. Integrações da staging são simuladas (MSW): o
destinatário `erro@homologacao.invalid` faz o e-mail falhar (500) e uma chave S3 com `__erro__` devolve 403.

Contas (abreviadas, todas `@homologacao.invalid`): **super**, **admin** e **admin2** (clínica principal),
**atendente**, **profissional** (Ana) e **profissional2** (Bruno), **inativo**, **admin-suspensa**,
**admin-vizinha** (clínica vizinha), **paciente**, **paciente-novo**, **responsavel**, **parceiro**.

## Roteiro prioritário (fumaça de ~30 min)

Ordem pensada para pegar primeiro o que seria incidente em produção: vazamento entre empresas, papel
acessando o que não deve, dado de saúde sem consentimento e dinheiro. Cada linha aponta a seção com o detalhe.

| # | Cenário | Conta | Resultado esperado | Seção |
| --- | --- | --- | --- | --- |
| 1 | Entrar sem segundo fator na staging | **admin** | entra só com e-mail e senha | ADR-054 |
| 2 | Conta inativa e clínica suspensa | **inativo**, **admin-suspensa** | 401 e 403 com a mensagem de suspensão | 1 |
| 3 | Isolamento entre empresas | **admin-vizinha** | só vê os 3 pacientes e a profissional da vizinha; nenhum id da principal abre | 1, 3, 4 |
| 4 | Papel sem permissão | **atendente**, **profissional** | 403 em financeiro, estoque, grade e exportação LGPD | 1, 2, 4, 5 |
| 5 | Último admin | **admin-vizinha**, depois **admin** e **admin2** | desativar o único admin: 409; com dois, um sai | 1 |
| 6 | Vínculo do profissional | **profissional**, **profissional2** | cada um só abre o paciente que atendeu | 3 |
| 7 | Consentimento no portal | **paciente-novo**, **paciente** | sem termo: foto bloqueada e aceite pedido; com termo: foto enviada | 8 |
| 8 | Portal: prazo e teto | **paciente** (tem uma consulta a < 24 h e outra daqui a ~10 dias; retorno pendente para "Agendar retorno"; o portal agenda só retorno, #483) | cancelar a de < 24 h recusado; 3ª consulta futura recusada | 8 |
| 9 | Responsável de menor | **responsavel** | vê o portal do menor (único paciente ligado a ele); o seed não liga responsável a adulto: o teste de "adulto negado" é por URL (8) | 8 |
| 10 | Conflito de agenda | **atendente** | mesmo horário e profissional: conflito; fim de semana e almoço (12:00–13:00, ligado no seed) recusados | 2 |
| 11 | Pagamento e recibo | **admin**, **admin-vizinha** | pagar mais que o saldo recusado; recibo da vizinha bloqueado (sem CNPJ) | 4 |
| 12 | Estoque | **admin** | saída maior que o saldo recusada; lote vencido e item zerado visíveis | 5 |
| 13 | Falhas de integração simuladas | **admin** | convite ou teste de canal para `erro@homologacao.invalid` cria a conta e devolve o link | 1, 6 |

## 1. Acesso ([excecoes](../domains/acesso/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Conta inativa não entra (401) | ACE-RN-08 | **inativo** com a senha certa | UI |
| Clínica suspensa: login com a senha certa é 403 | ACE-RN-28 | **admin-suspensa** | UI |
| Super Admin recebe 403 em rota da clínica | ACE-RN-10 | **super** abrindo agenda ou pacientes | UI |
| Atendente 403 em exportação LGPD e família administrativa | ACE-RN-14 | **atendente** | UI |
| Admin de Empresa não cadastra `super_admin`; atendente não cadastra profissional | ACE-RN-05 | **admin**, **atendente** em Equipe | UI |
| Profissional não desativa o Admin | ACE-RN-11 | **profissional** em Equipe | UI |
| Importar taxonomia é só do Super Admin | ACE-RN-17 | **super** (ok), **admin** (403) | UI |
| Desativar o último admin ativo: 409 | ACE-RN-25 | **admin-vizinha** desativa o único admin; com **admin** e **admin2** a desativação de um passa | UI |
| Mesmo e-mail em duas clínicas não colide; convidar admin com e-mail já cadastrado é 400 | ACE-RN-09, ACE-RN-16 | **admin** / **admin-vizinha** convidam o mesmo e-mail | UI |
| CNPJ inválido ou já usado por outra clínica | ACE-RN-22, ACE-RN-23 | **super** cadastra clínica com o CNPJ da principal | UI |
| Conta de outra empresa é 404; `clinicId` no corpo é ignorado; auditoria da outra clínica não aparece | ACE-RN-11, ACE-RN-26, ACE-RN-32 | **admin** x **admin-vizinha** | UI + massa |
| Convite expirado (24 h) ou usado duas vezes: link inválido; senha de 9 caracteres ou comum recusada | ACE-RN-03, ACE-RN-41 | convite de **admin** a novo e-mail (link na tela: clínica sem canal) | UI |
| Sessão revogada por logout, reset, troca de senha ou desativação | ACE-RN-08 | duas abas com **admin**; trocar a senha em uma | UI |
| Tema da clínica: só o Admin troca; cada clínica tem o seu; modo do aparelho vence o padrão | ACE-RN-61 | **admin** troca para escuro/menta e **atendente** (403 no PUT, vê desabilitado); **admin-vizinha** já nasce escura e âmbar; trocar claro/escuro no menu e recarregar mantém a escolha do aparelho | UI + massa |
| Provedor de e-mail falha no convite: conta criada, link devolvido | ACE-RN-33 | convidar `erro@homologacao.invalid` | UI |
| Bootstrap duplicado, tokens e recuperação em corrida, auditoria write-ahead, readiness 503 | ACE-RN-04, ACE-RN-20, ACE-RN-31, ACE-RN-46 | — | auto |
| Segundo fator ausente, em formato errado ou código de recuperação | ACE-RN-18 | **desligado na staging** (ADR-054) | auto |

## 2. Agenda ([excecoes](../domains/agenda/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Marcar fim de semana, na pausa de almoço, início ≥ fim | AGE-RN-01, AGE-RN-03 | **admin** ou **atendente** em Agenda | UI |
| Mesmo horário e profissional: conflito; mesmo horário em outra clínica não conflita | AGE-RN-02 | **admin** e **admin-vizinha** no mesmo horário | UI + massa |
| Profissional inativo ou de outra empresa | AGE-RN-12 | **admin** com profissional de outra clínica (não aparece) | UI |
| Atendente na configuração da grade; profissional cadastra ausência de colega ou remove feriado | AGE-RN-13 | **atendente**, **profissional** | UI |
| Profissional cria retorno ou fila para paciente sem vínculo | AGE-RN-17 | **profissional** com paciente sem consulta na agenda (Ana e Bruno atendem os mesmos 20 pacientes; os outros 20 não têm consulta, #465) | UI + massa |
| Lista de espera: janela maior que 180 dias; repetir o pedido não duplica; resolvida não aceita vaga | AGE-RN-08 | **atendente** em Lista de espera | UI |
| Consulta cancelada não confirma, conclui nem remarca; concluída não cancela nem marca falta | AGE-RN-04 | consultas passadas já concluídas/canceladas/falta do seed (últimas 5 semanas) | UI + massa |
| Concluir de novo não duplica a fatura; retorno concluído não cancela | AGE-RN-05 | **admin** concluindo consulta futura duas vezes | UI |
| Paciente cancela de novo consulta cancelada | AGE-RN-07 | **paciente** no portal | UI |
| Dois pedidos para o mesmo horário; exclusão no banco; Google Agenda falha | AGE-RN-02, AGE-RN-09, AGE-RN-16 | — | auto |

## 3. Pacientes e prontuário ([excecoes](../domains/pacientes-prontuario/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Nome curto, telefone sem DDD/internacional, CPF com dígito errado | PRO-RN-01, PRO-RN-18, PRO-RN-22 | **atendente** cadastrando paciente | UI |
| Paciente sem e-mail (lembrete impossível) e sem CPF (recibo bloqueado); menor com responsável; idoso | PRO-RN-18, PRO-RN-20 | massa de 40 pacientes (1 em 7 sem e-mail, 1 em 5 sem CPF, 1 em 13 menor) | UI + massa |
| Evolução SOAP sem campo; estomia sem tipo; evolução registrada não se altera | PRO-RN-02, PRO-RN-04 | **profissional** em paciente vinculado | UI |
| Condição resolvida não recebe avaliação; avaliações seriadas melhorando e piorando | PRO-RN-05 | 20 pacientes com condição e 5 avaliações cada | UI + massa |
| Profissional sem vínculo não abre o paciente | PRO-RN-08 | **profissional** ou **profissional2** abrindo, por id, paciente sem consulta com ele; quem está na própria agenda abre normalmente (#465) | UI + massa |
| Atendente exporta dados do titular; profissional/atendente na fila de pedidos do titular | PRO-RN-11, PRO-RN-16 | **atendente**, **profissional** | UI |
| Profissional vincula ou edita responsável | PRO-RN-21 | **profissional** em paciente menor | UI |
| Paciente de outra empresa por id ou na lista | PRO-RN-08, PRO-RN-12 | **admin-vizinha** (3 pacientes próprios) | UI + massa |
| Foto sem consentimento vigente | PRO-RN-06 | **paciente-novo** tenta enviar foto | UI |
| Consentimento em papel repetido; pedido do titular duplicado | PRO-RN-16, PRO-RN-19 | **admin** | UI |
| Super Admin lê foto de qualquer empresa | PRO-RN-13 | **super** | UI |
| Falha ao gravar foto (S3 403), e-mail de pedido do titular falha | PRO-RN-07, PRO-RN-16 | chave S3 com `__erro__`; e-mail `erro@` | UI |
| Anonimizado não reativa; decisões concorrentes; auditoria write-ahead | PRO-RN-16, PRO-RN-17 | — | auto |

## 4. Financeiro ([excecoes](../domains/financeiro/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Pagamento maior que o saldo, zero; desconto sem motivo ou que zera a fatura | FIN-RN-02, FIN-RN-03 | **admin** em fatura pendente (seed tem vencidas e pagas) | UI + massa |
| Fatura paga não paga/cancela de novo; cancelada não recebe pagamento; parcial não cancela (409) | FIN-RN-01, FIN-RN-04 | **admin**: pagar uma, pagar parcialmente outra | UI + massa |
| Recibo sem CNPJ da empresa ou sem CPF do paciente: bloqueado com orientação | FIN-RN-15 | **admin-vizinha** (clínica sem CNPJ); paciente sem CPF da principal | UI + massa |
| Pagador sem CPF válido | FIN-RN-15 | **admin** | UI |
| Atendente 403 em faturamento e repasses; profissional só vê o próprio extrato | FIN-RN-08, FIN-RN-14 | **atendente**, **profissional**, **profissional2** | UI |
| Fechamento de repasse: mês inválido, mês corrente, sem regra, sem saldo, mês já fechado | FIN-RN-08 | **admin** (Ana: 40%; Bruno: fixo de R$ 30,00) | UI + massa |
| Cancelar repasse (só o último ativo) e ler comprovante alheio negados | FIN-RN-10 | **profissional**, **atendente**, **admin-vizinha** | UI |
| Fatura/pacote/recibo de outra clínica: 404 | FIN-RN-01, FIN-RN-08, FIN-RN-11 | **admin-vizinha** | UI |
| Pagamentos simultâneos, locks, atomicidade da venda de pacote, estorno uma vez | FIN-RN-09, FIN-RN-11, FIN-RN-12 | — | auto |

## 5. Estoque ([excecoes](../domains/estoque/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Saída maior que o saldo; movimentação sem motivo ou preço negativo; unidade vazia | EST-RN-01, EST-RN-02 | **admin** em Estoque | UI |
| Só o Admin movimenta: atendente, profissional e paciente recebem 403 | — | **atendente**, **profissional** | UI |
| Insumo com lote vencido, estoque baixo e estoque zerado | EST-RN-06 | 5 insumos do seed, um por situação | UI + massa |
| Kit com insumo repetido recusado; insumo inativo no kit só avisa na conclusão | EST-RN-05 | **admin** editando o kit de *Curativo simples* ou *Troca de bolsa de estomia* (já têm kit no seed) e concluindo consulta | UI + massa |
| Insumo de outra clínica não aparece | — | **admin-vizinha** | UI |
| Baixas simultâneas, edição concorrente | EST-RN-01, EST-RN-06 | — | auto |

## 6. Comunicação ([excecoes](../domains/comunicacao/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Remetente inválido ou provedor fora da lista ao salvar o canal; quem não é Admin não configura | COM-RN-11 | **admin** (ok), **atendente** (negado) em Configurações | UI |
| Teste do canal recusado pelo provedor | COM-RN-12 | **admin** com destinatário `erro@homologacao.invalid` | UI |
| Clínica sem canal roda em dry-run; link para copiar no lugar do e-mail | COM-RN-04 | as duas clínicas do seed nascem sem canal | UI |
| Telefone inválido não gera link do WhatsApp; paciente/parceiro não clicam | PRO-RN-18, COM-RN-08 | **atendente** em paciente com telefone inválido; **paciente** | UI |
| Admin de outra clínica não vê nem apaga o canal | COM-RN-11 | **admin-vizinha** | UI |
| Job de lembretes: segredo errado, segunda execução do dia, falha por empresa, recall após a 3ª tentativa, clínica suspensa fora do lote | COM-RN-03, COM-RN-05, COM-RN-06, COM-RN-07, COM-RN-09 | cron com `CRON_SECRET` | auto |

## 7. Equipe e parceiros ([excecoes](../domains/equipe-parceiros/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Comissão acima de 100 ou negativa; nome vazio; atendente não escreve no cadastro | EQP-RN-01 | **admin**, **atendente** | UI |
| Horário semanal com janelas sobrepostas; consulta fora do horário ou na ausência | EQP-RN-02, EQP-RN-03 | **admin** em Ana ou Bruno | UI |
| Profissional só registra a própria ausência | EQP-RN-03 | **profissional**, **profissional2** | UI |
| Parceiro: e-mail inválido; repetido na mesma empresa (409) e em empresas diferentes (vale) | EQP-RN-04, EQP-RN-05 | **admin** e **admin-vizinha** com o mesmo e-mail | UI |
| Parceiro desativado não abre o portal | EQP-RN-07 | **admin** desativa **parceiro**; ele tenta entrar | UI |
| Profissional/parceiro de outra clínica: lista não inclui, PATCH 404 | EQP-RN-01, EQP-RN-05 | **admin-vizinha** | UI + massa |

## 8. Portal ([excecoes](../domains/portal/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| Cancelar/remarcar dentro de 24 h; agendar passado, fora da grade ou além de 60 dias | POR-RN-03, POR-RN-17 | **paciente** | UI |
| Teto de 2 consultas futuras | POR-RN-17 | **paciente** agenda a 3ª | UI |
| Foto: sem arquivo, > 5 MB, cota de 10 por 24 h | POR-RN-17 | **paciente** (termo de imagem aceito) | UI |
| Termos: primeiro aceite e revogação (revogar não é terminal) | POR-RN-25 | **paciente-novo** aceita; **paciente** revoga e aceita de novo | UI |
| Paciente e parceiro: 403 na rota do outro; equipe não usa o portal; paciente sai das páginas da equipe | POR-RN-01, POR-RN-02 | **paciente**, **parceiro**, **admin** | UI |
| Menor não ganha conta própria; responsável de adulto sem permissão (assinar, cópia, correção) | POR-RN-14, POR-RN-23 | **responsavel** (menor); consulta de adulto negada | UI |
| Pedido de correção sem descrição; segundo pedido pendente (409); cancelar de novo | POR-RN-14 | **paciente** | UI |
| Consentimento em papel: profissional 403; paciente de outra empresa 404 | POR-RN-16 | **profissional**, **admin-vizinha** | UI |
| Conta de portal só liga a cadastro da mesma empresa | POR-RN-09 | **admin** vinculando paciente da vizinha (não aparece) | UI |
| Horário ocupado ao agendar: 409 | POR-RN-05 | **paciente** em horário já tomado | UI |
| Profissional inativado: remarcar recusado | POR-RN-20 | **admin** inativa Ana; **paciente** remarca | UI |
| Cinco agendamentos simultâneos, cota de fotos concorrente, falha de e-mail/aviso/auditoria | POR-RN-17, POR-RN-14, POR-RN-24 | — | auto |
| Aceite do representante expira 90 dias após os 18 anos | POR-RN-21 | depende do relógio | auto |

## 9. Relatórios ([excecoes](../domains/relatorios/excecoes.md))

| Caso | Regra | Conta / dado | Reproduz |
| --- | --- | --- | --- |
| `month` mal formatado: 400 | REL-RN-04 | **admin** (parâmetro na URL) | UI |
| Atendente 403 em relatório e painel financeiro | — | **atendente** | UI |
| Mês corrente recalcula; mês encerrado e assentado é cacheado | REL-RN-04 | **admin**: mês passado x mês corrente | UI + massa |
| Fatura da outra clínica não muda o relatório | REL-RN-04 | **admin** x **admin-vizinha** | UI |

## Como manter

Caso novo de exceção entra na matriz do domínio (ADR-049); aqui só se acrescenta a linha com a conta e o
dado que o reproduz. Conta ou massa nova entra em `scripts/seed/seed.ts`, em `homologacao.md` § 4 e no
teste `tests/scripts/seed-cenarios.test.ts`.
