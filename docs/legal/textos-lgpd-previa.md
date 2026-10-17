---
title: "Textos LGPD — versão prévia (aviso de privacidade, termos de consentimento)"
status: draft
audience: [po, dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/026-textos-lgpd-previa-nao-ligada.md, docs/adr/018-transferencia-internacional-ue.md, docs/adr/013-retencao-por-anonimizacao.md]
---

# Textos LGPD — versão prévia

> **VERSÃO PRÉVIA — PENDENTE DE REVISÃO JURÍDICA.** Redigida por IA a pedido de @KalleoPinheiro
> (2026-10-17) para ele ajustar depois. **Não é parecer jurídico**, **não está ligada ao sistema**
> (nenhum paciente aceita estes textos hoje) e **não invalida nenhum aceite existente**
> ([ADR-026](../adr/026-textos-lgpd-previa-nao-ligada.md)). Quem for ao ar com dado real precisa
> da revisão de um(a) advogado(a) de proteção de dados e do responsável técnico da clínica.

Este arquivo reúne os cinco textos que a [#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216)
pede, na ordem em que o paciente os encontra. Cada texto é **autocontido**: pode ser copiado sozinho
para a constante do sistema (procedimento em § 8). O que o dono do produto decidiu (2026-10-11,
2026-10-12, 2026-10-17) está nas premissas; o que ainda é **decisão de produto ou do jurídico** está
em § 7, nunca escondido no texto.

## 1. Premissas usadas (todas já decididas, ver fontes)

| Premissa | Fonte |
| --- | --- |
| A **clínica** é a controladora; o VittaFlow é **operador** | #216, pergunta 1 (papéis a confirmar pelo jurídico, § 7) |
| Um texto-base com **nome, CNPJ e contato do encarregado da clínica** interpolados; consentimento de **imagem em aceite separado**; mudar o texto pede novo aceite (hash) | #216, decisão de 2026-10-11 |
| Parceiro vê dados clínicos **só com consentimento específico e revogável**, janela de **24 meses**; sem ele, só vê que o paciente foi atendido | #216, 2026-10-11; POR-RN-11 |
| Paciente **baixa cópia** dos dados; **correção e eliminação** viram pedido que a clínica analisa, em até **15 dias** | #216, 2026-10-11; PRO-RN-16 |
| Retenção: prontuário e fotos **20 anos**, trilha de auditoria **5 anos**, lista de espera e contas inativas **2 anos**; ao fim, **anonimizar** | #216, 2026-10-11; [ADR-013](../adr/013-retencao-por-anonimizacao.md), [ADR-017](../adr/017-retencao-decisoes-complementares.md) |
| Servidor na **Hetzner, Alemanha (UE)**; backup cifrado em outra localização da UE, **30 dias** de guarda | [ADR-018](../adr/018-transferencia-internacional-ue.md), ADR-017 A.7 |
| Dados que chegam a terceiros: e-mail e nome ao **Resend** (convites e lembretes); título e horário ao **Google Agenda**, só se a clínica conectar, e só com **iniciais** do paciente | ADR-018, [ADR-020](../adr/020-evento-do-google-agenda-so-com-iniciais.md) |

## 2. Variáveis (preenchidas por empresa)

| Campo | Conteúdo | Hoje existe no cadastro da empresa? |
| --- | --- | --- |
| `{{CLINICA_NOME}}` | razão social ou nome fantasia da clínica | sim |
| `{{CLINICA_CNPJ}}` | CNPJ da clínica | sim (PRO-RN-09) |
| `{{CLINICA_ENDERECO}}` | endereço completo | **não** |
| `{{ENCARREGADO_NOME}}` | nome do encarregado (DPO) | **não** |
| `{{ENCARREGADO_CONTATO}}` | e-mail ou telefone do canal do encarregado | **não** |
| `{{RESPONSAVEL_TECNICO}}` | enfermeiro(a) responsável técnico, com COREN | sim (PRO-RN-09) |
| `{{DATA_ACEITE}}` | preenchida pelo sistema no aceite | n/a (registro do aceite) |

Interpolar variáveis muda o texto por empresa; o hash deve ser calculado **sobre o texto-base com os
dados da empresa já aplicados** e gravado com a versão do texto-base (§ 8).

---

## 3. Aviso de privacidade

*Exibido em `/login`, no `/portal`, no rodapé dos e-mails e na ficha para impressão. É informação ao
titular (LGPD art. 9º), não pede aceite.*

```text
AVISO DE PRIVACIDADE — {{CLINICA_NOME}}
Versão prévia pendente de revisão jurídica · última atualização: {{DATA}}

1. Quem cuida dos seus dados
A {{CLINICA_NOME}}, CNPJ {{CLINICA_CNPJ}}, com sede em {{CLINICA_ENDERECO}}, é a controladora
dos seus dados pessoais: ela decide por que e como eles são usados. O sistema VittaFlow, que
a clínica usa para agenda e prontuário, atua como operador: trata os dados apenas para a
clínica e segundo as instruções dela.

Encarregado pelo tratamento de dados (canal para dúvidas e pedidos sobre seus dados):
{{ENCARREGADO_NOME}} — {{ENCARREGADO_CONTATO}}.

2. Que dados tratamos e para quê
- Cadastro: nome, telefone, e-mail (se você informar), data de nascimento, CPF (se necessário
  para recibo), dados do responsável ou cuidador, quando houver. Finalidade: identificar você,
  agendar e confirmar consultas, avisar sobre horários e emitir documentos e recibos.
- Saúde: anamnese, evoluções, estomias e feridas, avaliações, medidas, fotos clínicas,
  planos de cuidado e documentos clínicos. Finalidade: prestar e acompanhar o seu tratamento
  e cumprir o dever legal de manter o prontuário.
- Financeiro: faturas e recebimentos. Finalidade: cobrança e obrigações fiscais.
- Acesso: e-mail de login do portal, registros de acesso e de alterações (data, hora, quem
  fez e o que foi feito, sem repetir o conteúdo clínico). Finalidade: segurança e prova de
  quem acessou o quê.

3. Por que podemos tratar seus dados (bases legais)
- Dados de saúde: tutela da saúde, em procedimento realizado por profissional de saúde ou
  serviço de saúde (LGPD, art. 11, II, "f"), e cumprimento de obrigação legal e regulatória
  de manter o prontuário (art. 11, II, "a"; Lei nº 13.787/2018).
- Cadastro, agenda e financeiro: execução do contrato de prestação de serviços e
  cumprimento de obrigação legal (art. 7º, V e II).
- Fotos usadas além do prontuário e compartilhamento com o médico que indicou você: somente
  com o seu consentimento específico, que você pode recusar ou retirar (art. 11, I). Ver os
  termos de consentimento.

4. Com quem compartilhamos
- Médico ou parceiro que indicou você: só se você der consentimento específico e apenas para
  condições e avaliações dos últimos 24 meses. Sem consentimento, ele só sabe que você foi
  atendido(a). Você pode retirar o consentimento a qualquer momento pelo portal ou pedindo
  à equipe.
- Prestadores que ajudam a operar o sistema (operadores): provedor de servidor e backup
  (Hetzner, Alemanha); serviço de envio de e-mail (Resend), que recebe seu e-mail e nome
  para convites e lembretes; e, somente se a clínica ativar, o Google Agenda, que recebe
  apenas as iniciais do paciente, o horário e um link para a consulta.
- Autoridades: quando houver obrigação legal, ordem judicial ou pedido de autoridade de saúde.
- Não vendemos seus dados nem os usamos para publicidade.

5. Transferência internacional
Seus dados ficam em servidor na Alemanha (União Europeia). A transferência tem como base a
decisão de adequação entre Brasil e União Europeia (LGPD, art. 33, I), com as cláusulas-padrão
da ANPD como garantia de reserva. O backup é cifrado antes de sair do servidor. Prestadores
com sede fora da União Europeia (como o serviço de e-mail) recebem apenas os dados descritos
acima. [REVISAR: mecanismo do art. 33 para cada um — pendente do jurídico.]

6. Por quanto tempo guardamos
| Dado | Prazo | Ao fim do prazo |
| Prontuário e fotos clínicas | 20 anos após o último atendimento (Lei nº 13.787/2018) | anonimizado |
| Registros de acesso e alterações | 5 anos | anonimizado |
| Lista de espera e contas inativas | 2 anos | anonimizado |
| Faturas e recibos | prazo fiscal | valores e datas mantidos; dados pessoais anonimizados |
| Cópias de segurança (backup) | 30 dias | apagadas |
Anonimizar é remover o que identifica você, de modo que o dado não possa mais ser ligado à
sua pessoa.

7. Seus direitos (LGPD, art. 18)
Você pode, a qualquer momento: confirmar que tratamos seus dados; acessar e baixar uma
cópia (botão "Meus dados" no portal); pedir correção de dados incompletos ou desatualizados;
pedir anonimização ou eliminação de dados desnecessários ou tratados fora da lei; saber com
quem compartilhamos; retirar consentimentos; e reclamar à Autoridade Nacional de Proteção
de Dados (ANPD).
Os pedidos de correção e eliminação são analisados pela clínica e respondidos em até 15
dias. Alguns dados não podem ser eliminados antes do prazo legal (por exemplo, o
prontuário, que tem guarda obrigatória de 20 anos); nesse caso explicamos o motivo.

8. Como protegemos
Acesso por conta pessoal, com perfis de permissão; dados clínicos cifrados no servidor;
conexão protegida; metadados das fotos (como localização) removidos; registro de quem
acessa o prontuário; cada clínica enxerga apenas os seus próprios dados.

9. Crianças, adolescentes e pessoas sob cuidado
Os dados de menores de 18 anos e de pessoas que não podem decidir por si são tratados no
melhor interesse delas, com o consentimento de um dos pais ou do responsável legal quando
for necessário.

10. Mudanças neste aviso
Quando este aviso mudar de forma relevante, avisaremos pelo portal ou pelo e-mail que você
cadastrou. A versão em vigor é sempre a publicada nesta página.
```

---

## 4. Termo de consentimento livre e esclarecido (TCLE) — tratamento

*Aceite no portal ou em papel, **antes** do primeiro atendimento. Cobre o consentimento informado
para os procedimentos (dever ético, não só LGPD). **Não** contém autorização de imagem: ela é o termo
da § 5, aceito à parte.*

```text
TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO — TRATAMENTO (versão prévia, pendente de revisão jurídica)

Clínica: {{CLINICA_NOME}} — CNPJ {{CLINICA_CNPJ}}
Responsável técnico: {{RESPONSAVEL_TECNICO}}
Encarregado pelos dados: {{ENCARREGADO_NOME}} — {{ENCARREGADO_CONTATO}}

1. Sobre o tratamento
Declaro que fui informado(a), de forma clara e em linguagem que entendi, sobre a natureza,
os objetivos, os benefícios esperados, os riscos possíveis e as alternativas dos cuidados de
estomaterapia propostos a mim: avaliação e tratamento de feridas, cuidados com estomias,
curativos, desbridamento quando indicado, orientações e acompanhamento. Entendo que os
resultados dependem também do meu cuidado em casa e que não há garantia de cura.

2. Dúvidas e liberdade de decidir
Tive a oportunidade de fazer perguntas e elas foram respondidas. Sei que posso recusar ou
interromper o tratamento a qualquer momento, sem punição e sem perder o direito ao
atendimento, e que a decisão sobre cada procedimento é minha.

3. Meus dados de saúde
Autorizo a clínica a registrar e usar meus dados pessoais e de saúde (anamnese, evolução,
avaliações, medidas e documentos clínicos) para cuidar de mim, manter o meu prontuário pelo
prazo exigido em lei (20 anos) e emitir os documentos que eu pedir. O Aviso de Privacidade
da clínica explica, em detalhe, quem trata os dados, por quanto tempo e quais são os meus
direitos, e me foi apresentado antes deste aceite.

4. O que este termo não autoriza
Este termo não autoriza o registro ou o uso de fotos (termo próprio, separado), nem o
compartilhamento dos meus dados clínicos com o médico que me indicou (termo próprio,
separado). Posso recusar esses dois termos e continuar a ser atendido(a).

5. Retirada do consentimento
Posso retirar este consentimento a qualquer momento, pelo portal ou pedindo à equipe. A
retirada vale daí em diante e não desfaz o que já foi feito. Entendo que a clínica pode
precisar guardar o prontuário já registrado, porque a lei obriga (LGPD, art. 16, I).

6. Menores e pessoas que não podem decidir por si
Se o paciente tiver menos de 18 anos ou não puder decidir sozinho, este termo é aceito pelo
pai, pela mãe ou pelo responsável legal, que declara ter essa condição.

Aceite registrado em {{DATA_ACEITE}}, com data, hora e endereço de rede.
```

---

## 5. Termo de uso de imagem — fotos clínicas (aceite separado)

*Obrigatório para o sistema aceitar foto (PRO-RN-06). Recusar não impede o atendimento: só não há
registro fotográfico.*

```text
TERMO DE AUTORIZAÇÃO DE IMAGEM — FOTOS CLÍNICAS (versão prévia, pendente de revisão jurídica)

Clínica: {{CLINICA_NOME}} — CNPJ {{CLINICA_CNPJ}}
Encarregado pelos dados: {{ENCARREGADO_NOME}} — {{ENCARREGADO_CONTATO}}

1. O que autorizo
Autorizo a clínica a fotografar a região do meu corpo em tratamento (ferida, estomia e pele ao
redor), e a receber fotos que eu mesmo(a) enviar pelo portal, para acompanhar a evolução do
meu tratamento. Entendo que a foto, mesmo sem o rosto, é dado de saúde.

2. Para que as fotos servem
Somente para: (a) comparar a evolução da lesão ao longo do tempo; (b) documentar o meu
prontuário; (c) discutir o meu caso com os profissionais da própria clínica que me atendem.

3. Para que as fotos NÃO servem
Não serão usadas para divulgação, redes sociais, publicidade, aulas, congressos ou
publicações. Qualquer uso fora do tratamento exige um termo próprio, separado, que posso
recusar.

4. Cuidados
As fotos são guardadas cifradas, ficam ligadas ao meu prontuário, têm os metadados (como
localização) removidos e só são vistas por quem cuida de mim. Quando o prazo de guarda do
prontuário acabar (20 anos), o arquivo da foto é apagado.

5. Retirada
Posso retirar esta autorização pelo portal ou pedindo à equipe. Depois da retirada, a clínica
não registra novas fotos e não aceita novos envios pelo portal. As fotos já registradas
fazem parte do prontuário e ficam guardadas pelo prazo legal, mas não serão usadas para
mais nada. A retirada não prejudica o meu atendimento.

6. Menores e pessoas que não podem decidir por si
Se o paciente tiver menos de 18 anos ou não puder decidir sozinho, quem assina é o pai, a mãe
ou o responsável legal.

Aceite registrado em {{DATA_ACEITE}}, com data, hora e endereço de rede.
```

### 5.1. Termo opcional — uso didático ou de divulgação (**proposta, não decidida**)

*Só entra se o dono do produto decidir que a clínica quer usar fotos fora do tratamento (§ 7, item 4).
Sem essa decisão, nada disto é exibido e o item 3 do termo acima basta.*

```text
TERMO OPCIONAL — USO DIDÁTICO E CIENTÍFICO DE IMAGENS (proposta; pendente de decisão do dono do produto e do jurídico)

Autorizo, de forma opcional e sem que isso afete o meu atendimento, que fotos do meu
tratamento sejam usadas pela {{CLINICA_NOME}} em [ ] aulas e capacitação interna
[ ] congressos e publicações científicas [ ] divulgação da clínica, sempre sem rosto, nome
ou qualquer marca que me identifique, e que posso retirar a qualquer momento. A retirada
não alcança o que já foi publicado em meio impresso.
```

---

## 6. Consentimento para compartilhar dados clínicos com o médico que me indicou

*Substitui, quando for ligado, o texto `v0-placeholder` de `src/lib/partner-share-consent-text.ts`.
Aceite no portal ou em papel (POR-RN-16). Um aceite por paciente × parceiro.*

```text
CONSENTIMENTO PARA COMPARTILHAR DADOS CLÍNICOS COM O MÉDICO QUE ME INDICOU (versão prévia, pendente de revisão jurídica)

Clínica: {{CLINICA_NOME}} — CNPJ {{CLINICA_CNPJ}}
Encarregado pelos dados: {{ENCARREGADO_NOME}} — {{ENCARREGADO_CONTATO}}

1. O que autorizo
Autorizo a clínica a mostrar ao médico parceiro que me indicou, pelo portal do parceiro,
as minhas consultas, as minhas condições em acompanhamento (feridas e estomias) e as
avaliações registradas nos últimos 24 meses, para que ele acompanhe a evolução do meu tratamento.

2. O que ele não vê
Mesmo com esta autorização, o médico não vê os dados financeiros, a anamnese nem as
evoluções (SOAP). [REVISAR: conferir contra o que o portal do parceiro realmente entrega,
incluindo fotos, notas livres e contato do paciente, antes de ligar.]

3. Específico para esse médico
Esta autorização vale só para o médico que me indicou. Se eu mudar de médico indicador, a
autorização não passa para o novo.

4. Posso retirar
Posso retirar esta autorização a qualquer momento, pelo portal ou pedindo à equipe da clínica,
sem prejuízo do meu atendimento. Depois da retirada, o médico deixa de ver os meus dados
clínicos e passa a ver apenas que fui atendido(a).

5. Sem esta autorização
Se eu não autorizar, o médico que me indicou vê apenas que fui atendido(a), sem consultas,
condições ou avaliações.

6. Prazo
A autorização vale até eu retirá-la. A janela de visualização é sempre de 24 meses para trás.

Aceite registrado em {{DATA_ACEITE}}, com data, hora e endereço de rede; ou, se em papel,
registrado pela equipe, com o nome de quem lançou.
```

---

## 7. Pontos abertos para o jurídico e para o dono do produto

Nada abaixo foi decidido; o texto acima só mostra a posição usada para não ficar em branco.

| # | Ponto | Quem decide | Posição usada nesta prévia |
| --- | --- | --- | --- |
| 1 | A clínica é mesmo **controladora** e o VittaFlow **operador**, em todas as instalações? E quando a clínica é um consultório individual (CPF)? | jurídico | clínica controladora, VittaFlow operador |
| 2 | Quem é o **encarregado** e qual o canal. O sistema não guarda isso hoje (§ 2) | dono do produto | variável vazia |
| 3 | **Base legal** do prontuário: tutela da saúde (art. 11, II, "f") e obrigação legal (art. 11, II, "a"), em vez de consentimento. Se o jurídico preferir consentimento, o TCLE da § 4 muda de natureza | jurídico | tutela da saúde + obrigação legal; o TCLE é consentimento informado do tratamento |
| 4 | A clínica quer **usar fotos fora do tratamento** (aula, congresso, divulgação)? | dono do produto | não; termo opcional da § 5.1 fica desligado |
| 5 | **Mecanismo do art. 33** para Resend e Google Agenda (sede fora da UE) | jurídico | texto marcado `[REVISAR]` |
| 6 | Conferir o número e o texto do ato da ANPD sobre a **adequação Brasil ↔ UE** no Diário Oficial (a fonte do ADR-018 é secundária) | jurídico | citada sem número |
| 7 | **Menores de 18 anos** e responsável (art. 14): quem assina quando o responsável cadastrado (ADR-024) é só contato? | jurídico + produto | o responsável legal assina; o cadastro de responsável segue só de contato |
| 8 | O que o **parceiro não vê**: conferir se a § 6 item 2 bate com o que o portal do parceiro realmente entrega (hoje recebe cadastro do paciente, consultas, condições e avaliações) | dev | marcado `[REVISAR]` na § 6 |
| 9 | **Idioma e leitura**: o texto é longo para telefone; o jurídico pode aceitar um resumo em camadas (resumo + texto completo) | jurídico + UX | texto completo |
| 10 | Aviso de privacidade em `/login`, `/portal` e e-mails (critério da #216): ainda é código, só depois do texto final | dev | fora desta entrega |

## 8. Como promover um texto desta prévia ao sistema

1. Jurídico e dono do produto fecham o texto e as decisões da § 7.
2. Troque a constante e a **versão juntas** (`CONSENT_TEXT`/`CONSENT_TEXT_VERSION`,
   `PARTNER_SHARE_CONSENT_TEXT`/`..._VERSION`, `DATA_RIGHTS_PLACEHOLDER_NOTICE`). O hash SHA-256
   do texto muda e **todo aceite anterior deixa de valer** (decisão de 2026-10-11): paciente
   reaceita no portal e a equipe refaz o papel (#310).
3. Separar imagem do TCLE exige um **segundo tipo de aceite** (o `ConsentRecord` hoje tem um só):
   migração, caso de uso e tela. Abra ticket quando o texto estiver fechado.
4. Interpolar o cadastro da empresa exige as colunas `encarregado_nome`, `encarregado_contato` e
   `endereco` em `clinics`, e o hash sobre o texto já interpolado (ver § 2).
5. Abra os tickets de código da #216 (páginas de aviso, aceite separado, interpolação) e,
   depois da promoção, a [#323](https://github.com/KalleoPinheiro/vitta-flow/issues/323) (retenção)
   deixa de estar bloqueada pelo texto.
