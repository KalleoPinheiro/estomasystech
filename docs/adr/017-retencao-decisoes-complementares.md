---
title: "ADR 017 — Retenção: decisões complementares ao ADR-013"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/013-retencao-por-anonimizacao.md, docs/adr/015-servidor-sem-cifra-de-disco.md]
---

# ADR 017 — Retenção: decisões complementares ao ADR-013

- **Data:** 2026-10-17
- **Status:** aceito. Completa o [ADR-013](./013-retencao-por-anonimizacao.md) sem alterá-lo.
  Reúne (A) as decisões de @KalleoPinheiro de 2026-10-12 que a #311 aplicou e (B) as perguntas que
  a #318 deixou abertas, que o dono delegou em 2026-10-17 a quem implementa, com a instrução de
  escolher o que for mais seguro, escalável e performático dentro do negócio.
- **Domínios afetados:** acesso, pacientes-prontuario, equipe-parceiros, agenda, financeiro

## Contexto

O ADR-013 definiu a anonimização por prazo e deixou pontos sem processar. A #311 (PR #318)
implementou as decisões de 2026-10-12 e levantou quatro perguntas. Duas delas existiam porque o
ADR-013 é `frozen`: a #318 acrescentou uma seção datada nele, contra a regra de
[`governance.md`](../governance.md) ("ADRs nunca editados; substituídos por outro ADR"). Este ADR
corrige isso: a seção saiu do ADR-013 e mora aqui.

## A. Decisões de 2026-10-12 (#311)

1. **Fila `waiting` vencida:** quando o período desejado termina, a entrada vira `expired`; daí
   contam os 2 anos e ela é anonimizada como as resolvidas (AGE-RN-14, AGE-RN-15).
2. **Contas de parceiro inativas:** mesma regra das contas da equipe, 2 anos após a desativação
   (ACE-RN-45, EQP-RN-07).
3. **Textos livres de fatura:** descrição e motivo do desconto são anonimizados junto com o
   paciente; valores, datas e status ficam pelo prazo fiscal (FIN-RN-13).
4. **Google Agenda:** o job apaga os eventos que o sistema criou para o paciente anonimizado. O id
   do evento é o marcador: só é limpo depois de apagar, e a falha fica para a próxima execução
   (AGE-RN-16). Complementa o §5 do ADR-013.
5. **Reativação de conta:** conta anonimizada não volta; a pessoa entra por convite novo, como
   conta nova (ACE-RN-47).
6. **Cadastro do profissional: guardado.** Nome e conselho aparecem na autoria do prontuário, que
   tem guarda de 20 anos (EQP-RN-08).
7. **Backups: 30 dias de guarda**, como o [runbook](../engineering/producao.md) (§ 5) já faz.
   Depois disso o dado anonimizado também some dos backups: uma cópia de antes da anonimização
   deixa de existir 30 dias depois dela, e restaurar um backup mais antigo desfaz a anonimização
   até o job rodar de novo (idempotente, ele a refaz).

## B. Perguntas da #318, decididas em 2026-10-17

| # | Pergunta | Opções | Decisão |
| --- | --- | --- | --- |
| 1 | ADR-013 `frozen` editado ou ADR novo? | Manter a seção no ADR-013 · ADR novo | **ADR novo (este).** A regra de governança é explícita, e o ADR-013 volta ao texto original com um ponteiro para cá |
| 2 | Anonimizar o cadastro `partners`? | Anonimizar · guardar | **Guardar**, como o cadastro do profissional (EQP-RN-08) |
| 3 | Bloquear a reativação do cadastro do paciente anonimizado? | Bloquear · permitir | **Bloquear** (`409`) |
| 4 | Recusar troca de senha e reenvio de convite em conta anonimizada? | Recusar · permitir | **Recusar**, e já recusa: ver abaixo |

**2 — Cadastro do parceiro fica.** Nome, e-mail e CRM do parceiro identificam um profissional
(pessoa jurídica ou médico em exercício), não são dado de saúde, e o cadastro sustenta registros
que têm prazo próprio: a indicação em `patients.referred_by_partner_id`, o consentimento do
paciente para esse parceiro (append-only, POR-RN-11) e as comissões e repasses (prazo fiscal,
FIN-RN-13). Anonimizá-lo quebraria esses vínculos ou os deixaria sem sentido. O dado pessoal que o
parceiro tem de fato exposto, a conta de acesso ao portal, já é anonimizada em 2 anos (EQP-RN-07).
O cadastro só é visível à equipe da própria empresa (ADR-001). Reabrir se: o parceiro pedir
eliminação (nesse caso trate como pedido do titular e anonimize o cadastro caso a caso, mantendo o
id) ou se a ANPD/jurídico exigir prazo para esse dado.

**3 — Paciente anonimizado não reativa.** Reativar devolveria à lista de fluxos ativos uma ficha
com o nome "Paciente anonimizado", sem contato e com o ano de nascimento apenas: agendar,
cobrar ou lembrar essa ficha não tem como funcionar, e o job a anonimizaria de novo. A regra
mora no domínio (`Patient.reactivate`, `ConflictError`), então vale para qualquer caminho, e a
tela de Pacientes mostra "Anonimizado" no lugar do botão. A pessoa que voltar é cadastrada de novo,
como paciente novo; o prontuário antigo segue anonimizado e fechado. É a mesma lógica da conta
(ADR-017 A.5), e falha fechado: a alternativa de permitir não tem caso de uso.

**4 — Conta anonimizada não recebe senha nem convite.** Já era recusado por camadas que a #318 não
precisou tocar, e passa a ter teste que prende o comportamento:

- a anonimização grava `active = false`, apaga os tokens de convite/redefinição e troca o hash por
  um inutilizável;
- `resend-invite` e `reset-link` recusam conta inativa (`400` e `409`), na API da clínica e no
  caminho da plataforma;
- `set-password` consome token, e conta inativa recebe a mensagem única de link inválido (AD-019).

Não há "trocar a senha" em conta anonimizada porque o `PATCH` não grava senha desde a #295 e a
conta não tem sessão (`session_version` incrementada). O caminho para a pessoa voltar é o convite
novo, que cria conta nova (ACE-RN-47).

## Consequências

- O ADR-013 fica como foi aceito; quem procura a regra completa de retenção lê os dois.
- Paciente anonimizado fica inativo para sempre. Se um dia houver "fusão de fichas", é decisão
  nova.
- O cadastro do parceiro continua com dado pessoal depois da anonimização da conta; a LGPD é
  atendida pela base de execução de contrato e obrigação fiscal, e o caminho de eliminação por
  pedido do titular (#293) continua existindo.

## Relacionado

- [ADR-013](./013-retencao-por-anonimizacao.md), [ADR-001](./001-multi-tenancy.md).
- Regras: ACE-RN-47, ACE-RN-50, PRO-RN-17, EQP-RN-07, EQP-RN-08.
- Spec da #311: [`.specs/features/retencao-restante/spec.md`](../../.specs/features/retencao-restante/spec.md).
- Decisão registrada em `.specs/STATE.md` (AD-034).
