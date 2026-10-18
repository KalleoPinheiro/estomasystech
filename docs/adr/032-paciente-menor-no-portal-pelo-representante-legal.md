---
title: "ADR 032 — Paciente menor acessa o portal só pelo representante legal, que assina os termos"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/027-responsavel-acessa-portal-em-nome-do-paciente.md, docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md, docs/legal/textos-lgpd.md, docs/domains/portal/README.md]
---

# ADR 032 — Paciente menor acessa o portal só pelo representante legal, que assina os termos

- **Data:** 2026-10-18
- **Status:** aceito. Implementa a [#372](https://github.com/KalleoPinheiro/vitta-flow/issues/372). @KalleoPinheiro aprovou em 2026-10-18 a proposta do coordenador: o menor não tem conta própria; quem acessa é o representante legal, com o aviso "Acessando em nome de X"; o aceite dos termos fica registrado no sistema em nome dele, no lugar do papel; aos 18 anos a clínica é avisada para passar o acesso ao paciente. É o "novo ADR" que o [ADR-027](027-responsavel-acessa-portal-em-nome-do-paciente.md) exigiu para ato personalíssimo do responsável, e fecha o limite "menores" do [ADR-030](030-textos-lgpd-ligados-sem-revisao-juridica.md).
- **Domínios afetados:** portal, acesso, pacientes-prontuario

## Contexto

O ADR-027 deixou o aceite dos termos só com o titular, e o ADR-030 aceitou um buraco: o termo de um menor é assinado em papel pelo pai, mãe ou tutor (item 6 de cada termo), mas o sistema não tem onde registrar esse aceite. Sem aceite de imagem, o responsável não envia foto da ferida pelo portal, que é justamente o caso de uma criança com estomia ou lesão crônica acompanhada em casa. A LGPD (art. 14, § 1º) pede o consentimento de pelo menos um dos pais ou do responsável legal para dado de criança, e o Código Civil (arts. 3º, 4º, 1.634 e 1.740) diz quem representa o menor: os pais ou o tutor.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Equipe registra o aceite em papel no sistema | sem mudança no portal | depende de digitação; o representante não vê nem revoga sozinho; continua o papel |
| B — Menor com conta própria e "aceite do responsável" à parte | o adolescente usa o portal | dá ao menor acesso sozinho a dado de saúde e a atos que ele não pode praticar; duas contas para o mesmo prontuário |
| C — Só o representante legal acessa e assina no portal (escolhida) | um ator só, já com trilha e aviso (ADR-027); o aceite tem autor identificável | o adolescente depende do representante até os 18 |

## Decisão

**Opção C.**

- **Menor é quem tem menos de 18 anos no dia de hoje** (fuso `APP_TIMEZONE`), pela data de nascimento do cadastro. Quem nasceu em 29/2 fica maior em 1º/3 nos anos não bissextos. **Sem data de nascimento vale como adulto**, como o portal já funcionava: a clínica precisa informar a data (o sistema não adivinha idade). Regra única em `src/domain/patient/majority.ts`, a mesma usada no filtro SQL.
- **Menor não tem conta própria.** Criar conta `patient` para menor responde `400`. Conta antiga (ou data corrigida depois) não entra: o portal responde `403` ao próprio menor.
- **Só representa o menor quem é representante legal:** parentesco `mae`, `pai` ou `representante_legal` (tutor). Avô, irmão ou cuidador só com tutela, e então a equipe cadastra como representante legal. O responsável de outro parentesco não vê o menor na lista, mesmo vinculado; a concessão de acesso é recusada (`400`) quando todos os pacientes ligados a ele são menores.
- **O representante aceita e revoga o TCLE e o termo de imagem do menor** no portal (`POST /api/portal/patient/consent` e `/consent/revoke`). O registro guarda **quem assinou**: `consent_records.signer_guardian_id` e `signer_relationship` (migração `0065`, sem FK para a evidência sobreviver à exclusão do cadastro); a trilha diz "pelo representante legal". Os textos não mudam (o item 6 já diz que o representante assina e declara ter essa condição), então nenhum aceite cai. O aviso de privacidade sobe para `v2` explicando o fluxo.
- **Ficam com o titular ou com a clínica** (`403` ao responsável, como no ADR-027): consentimento do parceiro indicador, cópia dos dados e pedidos de correção ou eliminação. Para o menor, o representante pede à clínica (pergunta aberta abaixo).
- **Adulto continua sem representação de aceite.** Responsável de paciente maior recebe `403` e a tela diz que o aceite é do paciente.
- **Aos 18 anos**, o painel inicial do Admin de Empresa e do Atendente lista os pacientes que já são maiores, cujo responsável tem conta ativa e que não têm conta própria. Sai da lista ao criar a conta do paciente, ao encerrar o acesso do responsável ou quando a equipe marca **"Manter com o responsável"** (curatela, pedido do paciente): `patients.majority_reviewed_at`, gravado com trilha antes (`update`/`patient`, write-ahead). Trocar o responsável zera a marca. O aviso é na tela, sem e-mail: não sai nome de paciente por e-mail nem há job novo.
- **O aceite do representante continua valendo depois dos 18.** Cortar o aceite no aniversário bloquearia o envio de fotos no meio do tratamento. Quando o paciente entra com a própria conta, o cartão mostra "aceito pelo representante legal" e oferece **"Aceitar em meu nome"**, que grava um aceite dele por cima; ele também pode revogar.

## Consequências

**Positivas**

- O aceite do menor sai do papel, com autor, parentesco, data, IP e o controlador exibido, e pode ser revogado pelo próprio representante.
- O representante envia fotos e acompanha a evolução do menor sem a equipe digitar nada.
- A clínica não esquece de passar o acesso ao paciente que fez 18 anos.

**Negativas / custos aceitos**

- O sistema não confere a guarda nem a tutela: a equipe atesta ao conceder o acesso (ADR-027) e ao escolher o parentesco. Parentesco errado no cadastro dá o acesso a quem não deveria.
- Paciente sem data de nascimento é tratado como adulto.
- Adolescente não usa o portal sozinho, nem para ver as próprias consultas.
- Só um representante por paciente (ADR-024): o outro genitor não tem acesso próprio.

**Perguntas abertas** (decisão do dono; o padrão acima é o mais seguro até lá):

- O representante do menor exerce no portal os direitos do art. 18 (cópia, correção, eliminação) e o consentimento do parceiro, ou isso segue pela clínica?
- O aceite do representante deve perder a validade algum tempo depois dos 18 anos se o paciente não confirmar?

## Relacionado

[#372](https://github.com/KalleoPinheiro/vitta-flow/issues/372), [ADR-024](024-responsavel-do-paciente.md), [ADR-027](027-responsavel-acessa-portal-em-nome-do-paciente.md), [ADR-028](028-paciente-encerra-acesso-do-responsavel.md), [ADR-030](030-textos-lgpd-ligados-sem-revisao-juridica.md), POR-RN-26, POR-RN-27, ACE-RN-59.
