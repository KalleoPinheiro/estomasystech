---
title: "Aceleradores de estomaterapia: estudo e propostas"
status: draft
audience: [po, dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-20
---

# Aceleradores de estomaterapia: estudo e propostas

> **TL;DR.** A clínica usa um kit de modelos de uma mentoria de enfermagem (página pública no
> Notion com 30 "aceleradores" em Google Docs, Planilhas e Canva). Os modelos clínicos descrevem,
> campo a campo, o prontuário que a clínica já preenche em papel: avaliação inicial de ferida e de
> estomia, diagnósticos NANDA-I com código, prescrição NIC por diagnóstico, metas em três níveis,
> registro do curativo em etapas, termos por procedimento e documentos timbrados. O sistema já
> cobre o esqueleto (TIME, DET, PUSH, plano de cuidados PES, documentos imprimíveis, pacotes), mas
> faltam campos, a clínica não consegue cadastrar os diagnósticos que usa e os documentos não
> seguem esses modelos. A seção 5 traz 14 propostas de issue já triadas. Nada aqui é requisito
> até o Kalléo decidir (regra 5).

Fontes lidas em 2026-11-20: a página pública do Notion da mentoria (base "Todos os aceleradores")
e todos os documentos clínicos ligados a ela, a pasta de marca da clínica no Google Drive e o site
público do NurseUp (sem login). O conteúdo de terceiros foi **resumido**, não copiado; os textos
originais pertencem aos autores. Dados pessoais de autoras e pacientes ficaram de fora.

## 1. Inventário

A base tem 30 itens em 5 trilhas. Os da trilha 2 (negócio) e 5 (marketing) estão fora do escopo
clínico e entram só como contexto.

| Tipo | Item | Formato | Lido | Relevância |
| --- | --- | --- | --- | --- |
| Avaliação | Avaliação inicial da pessoa com lesões cutâneas (com acompanhamento) | Doc | inteiro | alta |
| Avaliação | Avaliação inicial da pessoa com estomia (eliminação e alimentação) | Doc | inteiro | alta |
| Avaliação | Modelo de prontuário físico para feridas (versão anterior, com exames e laser) | Doc | inteiro | alta |
| Avaliação | Consulta de enfermagem ginecológica | Doc | só título | baixa |
| Escala / régua | Régua medidora de feridas | sem link | — | baixa |
| NANDA/NIC | Lista de diagnósticos NANDA-I para estomia | Doc | inteiro | alta |
| NANDA/NIC | Banco de prescrições de enfermagem para feridas (NANDA-I 2024-2026 + NIC 7ª ed.) | Planilha | inteiro | alta |
| Protocolo | Template de protocolo assistencial de lesões cutâneas (seções A a J) | Doc | estrutura | média |
| Protocolo | Kit de POPs (17 procedimentos operacionais padrão) | Doc | estrutura | média |
| Plano | Proposta de plano de acompanhamento (plano terapêutico com preço) | Doc | inteiro | alta |
| Plano | Modelo de plano terapêutico | Canva | não aberto | média |
| Termo | TCLE de desbridamento instrumental conservador | Canva | inteiro | alta |
| Termo | TCLE de laserterapia de baixa potência | Canva | inteiro | alta |
| Termo | Termo de autorização de uso de imagem e registros visuais | Canva | inteiro | alta |
| Declaração | Declaração de comparecimento em consulta de enfermagem | Canva | inteiro | média |
| Documento | Receituário de enfermagem (papel timbrado) | Canva | inteiro | alta |
| Documento | Encaminhamento médico e multiprofissional (2 modelos) | Canva | inteiro | média |
| Estoque | Lista de materiais essenciais (atendimento domiciliar) | Canva | inteiro | média |
| Estoque | Planilha de gestão de estoque ("prateleira" com ~45 insumos) | Planilha | inteiro | média |
| Preço | Planilha de precificação (custo, hora técnica, deslocamento, margem, imposto, planos de 5/10/15) | Planilha | inteiro | média |
| Negócio | Gestão financeira, recibo, Business Model Canvas, persona, oferta, script de vendas, cartão digital, apresentação de terapias adjuvantes | vários | só títulos | baixa |

Todos os termos da mentoria abrem com um aviso: são modelos educacionais e precisam de revisão
por advogado antes do uso. Isso reforça a dependência do jurídico (#376).

## 2. O que cada modelo ensina sobre o prontuário

### 2.1 Avaliação inicial de ferida

Roteiro em blocos: identificação e quem encaminhou; histórico socioeconômico; estado nutricional
(peso, altura, IMC, perda ponderal de 5% ou mais em 3 meses como alerta); hábitos; comorbidades em
lista fechada (DM, HAS, DAP, IVC, neuropatia, renal com diálise, hepática, imunossupressão, câncer
com tratamento) e medicamentos que atrasam a cicatrização (corticoide, anticoagulante,
imunossupressor); exame físico com dor em repouso **e** dor no curativo; sensibilidade
(monofilamento 10 g, diapasão 128 Hz, térmica); pulsos por artéria (presente, reduzido, impalpável,
temperatura comparada); TEC; **ITB** com faixas (0,9 normal até menor que 0,4 grave); edema em
cruzes; sinais vitais.

A ferida em si: aguda ou crônica (mais de 90 dias), tempo de evolução, recidiva; **etiologia com a
classificação própria de cada tipo** (LP E1-E4/não classificável/tissular profunda, queimadura por
grau, deiscência por grau, ferida neoplásica, radiodermite, lesão por fricção tipo 1-3, DAI 1A-2B,
MARSI por subtipo, dermatite periestomal L1-L4/LX, úlcera terminal de Kennedy, venosa, arterial,
mista, pé diabético); **várias feridas** numeradas num mapa do corpo, cada uma com comprimento,
largura, profundidade e área; túneis; **leito em percentual por tecido** (epitelização,
granulação saudável e não saudável, hipergranulação, esfacelo, necrose, fibrina, estrutura
exposta); bordas (formato, epíbole, maceração, hiperqueratose, cor); pele adjacente de 10 a 20 cm;
exsudato por tipo, consistência, odor e **quantidade medida pela saturação da cobertura** (menos de
25%, 25-75%, mais de 75%, cada faixa com a frequência de troca correspondente); infecção pelos
mnemônicos **NERDS** (superficial) e **STONEES** (profunda) mais sinais sistêmicos (que mandam
encaminhar na hora); biofilme por sinais diretos e indiretos.

Depois vêm diagnósticos (seção 2.3), metas (2.4) e as **condutas em 8 etapas**, que são o registro
do curativo: dor antes, posição, técnica e EPI; remoção da cobertura anterior; limpeza (método,
solução, pressão de 8-15 psi com seringa de 20 ml e agulha 19G); desbridamento (tipo e resultado);
terapia adjuvante; proteção perilesional; cobertura primária; cobertura secundária com fixação e
frequência de troca; orientações, dor depois comparada à de antes e próxima troca. Fecha com
encaminhamento multiprofissional, retorno com periodicidade e assinatura com COREN.

A versão anterior (prontuário físico) acrescenta: checklist de **termos assinados**; pergunta
aberta sobre o que o paciente sente e **motivação de 0 a 10** para cicatrizar; sono; glicemia
capilar; **exames laboratoriais em série** (hemograma, PCR, VHS, relações NLR/PLR, HbA1c,
albumina, ferritina, vitaminas, zinco e outros, com valor de referência e cinco datas lado a lado);
e o **registro de laser por atendimento** (comprimento de onda 660 ou 830 nm, joules por ponto em
leito, borda e periferida, número de pontos, se houve PDT ou ILIB).

### 2.2 Avaliação inicial de estomia

Histórico igual ao da ferida mais a **cirurgia de confecção** (eletiva ou urgência, tipo de
cirurgia, hospital, se houve demarcação pré-operatória). A estomia: tipo (íleo, cólon direito,
transverso, cólon esquerdo, urostomia, gastrostomia), temporária ou definitiva, quadrante,
alça/terminal/duplo barril, distância de proeminência óssea, cor da mucosa, formato e diâmetro,
**altura** (protusa, plana, retraída, prolapsada, com medida), ângulo de drenagem, efluente e
**débito em 24 h** (acima de 1000 ml é alto débito), haste ou splinter com data de retirada,
irrigação; equipamento (1 ou 2 peças, drenável, placa plana ou convexa, recortável ou moldável) e
frequência de troca. Para gastrostomia: tipo e calibre do cateter, balão, anteparo, rotação e data
da última troca. Pele periestomal, **complicações** em lista, **autocuidado** (limpeza, troca,
esvaziamento), de onde vem o equipamento (polo, convênio, compra) e **adjuvantes em uso** (pó,
pasta, anel, spray, cinto, filtro e outros).

### 2.3 Diagnósticos NANDA-I

* A lista de estomia traz cerca de 20 diagnósticos com definição, características definidoras e
  fatores relacionados, **sem código numérico**. Os formulários de avaliação os oferecem como
  checklist dividido em **foco no problema, risco, síndrome e promoção da saúde**, sempre com um
  campo "Outros" para escrever à mão. É exatamente o que a clínica relatou não conseguir fazer no
  sistema.
* O banco de prescrições cobre 15 diagnósticos de feridas **com código NANDA-I 2024-2026**
  (ex.: 00044, 00046, 00047, 00248, 00304, 00312, 00004, 00204, 00291), domínio e classe, as
  intervenções **NIC 7ª ed. com código**, a prescrição da equipe, os **cuidados para paciente e
  família em linguagem leiga** e a fonte de cada linha. Ele declara as próprias lacunas (sem
  diretriz recente de prevenção de LP nem de compressão).
* A edição usada pela clínica é **NANDA-I 2024-2026**; o subset do sistema está marcado como
  2021-2023 e alguns títulos mudaram (ex.: "Ansiedade excessiva", "Síndrome da habilidade de
  autocuidado diminuída", "Lesão por pressão no adulto").

**Direitos autorais.** NANDA-I, NIC e NOC são obras protegidas. O repositório é público e já
segue essa regra (`stomatherapy-seed.ts` é um subset ilustrativo; a implantação real importa o
catálogo licenciado). Por isso a proposta não embute a lista da clínica no repo: **a clínica
cadastra os códigos que usa** (seção 5, P1-1).

### 2.4 Metas e prescrição

Metas em **três níveis com prazo de referência**: segurança (0-15 dias), transição e treino do
paciente ou cuidador (15-45 dias) e reabilitação (60 dias em diante). Na estomia, as metas são
concretas e conferíveis (zero vazamento entre trocas, placa por pelo menos 3 dias, recorte 1-2 mm
maior que o estoma, paciente esvazia a bolsa sozinho). O protocolo usa como indicador a **redução
de 30% da área em 4 semanas**, medida semanal e as escalas **PUSH** e **RESVECH 2.0**.

### 2.5 Termos, declarações e documentos

| Documento | Estrutura e campos (texto final depende do jurídico, #376) |
| --- | --- |
| TCLE de desbridamento | paciente (nome, CPF, RG, idade, responsável legal), enfermeira (nome, COREN); objetivo; materiais e se o material é novo ou esterilizado (com data); contraindicações absolutas e relativas; riscos; cuidados depois; plano de tratamento proposto (texto livre); responsabilidades e consentimento revogável; remissão ao termo de imagem; local, data, assinaturas de paciente ou responsável, testemunha e enfermeira |
| TCLE de laser | igual, mais **equipamento utilizado**, contraindicações próprias (fotossensibilizantes, gestação, câncer em tratamento) e uso de imagem dividido em registro clínico obrigatório e divulgação (autoriza ou não) |
| Termo de imagem | **quatro finalidades, cada uma com autorizo/não autorizo**: registro no prontuário (indispensável), uso científico e educacional sem identificação, divulgação de imagens técnicas sem identificação, divulgação com rosto ou voz; revogação total ou parcial por escrito, que impede novos usos mas não apaga o que já foi publicado |
| Declaração de comparecimento | paciente, CPF, data, **hora de início e fim**, modalidade (consultório, domicílio, remoto), base legal (Lei 7.498/86), aviso de que não é atestado médico, enfermeira e COREN, local, contato, data de emissão |
| Receituário | papel timbrado: logo no topo, rodapé com nome, COREN, CNPJ ou CPF, modalidades, telefone e e-mail; corpo livre |
| Encaminhamento | carta ao médico ou outro profissional: paciente, etiologia e local da ferida, achados da avaliação, condutas já feitas, hipótese, o que se pede, disponibilidade para plano conjunto, assinatura e contato |
| Proposta de plano de acompanhamento | objetivo clínico e prioridades; frequência (2x/semana a mensal), duração estimada (4 a 12 semanas), modalidade, data de reavaliação; terapias indicadas com uma linha leiga cada; **preço da consulta avulsa e do plano de N consultas** (com preço por consulta só no plano), materiais inclusos ou à parte, formas de pagamento, próxima consulta, contato para intercorrência, validade de 7 dias |

O protocolo cita a base normativa que interessa ao sistema: Lei 7.498/86, Res. COFEN 736/2024
(Processo de Enfermagem), 754/2024 (prontuário eletrônico e plataformas digitais), 696/2022 e
717/2023 (telenfermagem) e RDC ANVISA 63/2011.

### 2.6 Estoque e preço

A "prateleira" tem ~45 insumos típicos (alginato, hidrofibra com prata, PHMB em solução, espuma e
sabonete, bota de Unna, ataduras por largura, SF 0,9% de 100 e 500 ml, bisturi 11 e 15, cureta,
kit de pinças) com nível mínimo e máximo. O POP de curativo lista o material de um atendimento,
que é o **kit do procedimento**. A precificação calcula o preço por atendimento a partir de
complexidade, tempo, insumos, deslocamento, custo fixo, margem e imposto, e oferece **planos de
5, 10 ou 15 atendimentos com desconto**. Isso é o que a clínica chama de "pacote".

## 3. Marca da clínica (Drive)

Pasta com 16 subpastas de uma agência de identidade visual: logomarca (AI, PDF, JPG), símbolo
(monograma), submarca, paleta e tipografia, fontes, timbrado (DOCX, PDF, PNG, AI), marcas d'água,
padrões, fundos e peças de rede social e cartão.

* **Paleta:** rosé `#D4A4A0`, malva `#A05B62`, nude `#D9C8C1`, caramelo `#B36F30`, marrom
  `#814C3A` e dourado em gradiente.
* **Tipografia:** uma script, uma serifada display e uma sans. **Os arquivos de fonte na pasta são
  versões DEMO**, sem licença de uso comercial: não entram no app nem nos PDFs sem a clínica
  comprar a licença.
* **Timbrado:** logo centralizado no topo, faixa vertical malva à esquerda, monograma grande como
  marca d'água no rodapé e contatos no rodapé.
* **Como entra no sistema:** a logo já sobe pela tela de Identidade (#430/#427). Falta a cor de
  destaque e o modelo de timbrado nos documentos (P3-12). Nenhum arquivo da marca foi copiado para
  o repo, que é público.

## 4. O que já existe e o que falta

| Tema | Já existe (código) | Falta |
| --- | --- | --- |
| Catálogo NANDA/NIC/NOC | catálogo **global** importado só por script ou pelo super admin (`nursing_diagnoses`, `import-taxonomy.ts`, `/api/platform/taxonomy/import`); subset ilustrativo 2021-2023 | cadastro **pela clínica**, edição 2024-2026, diagnóstico digitado à mão |
| Plano de cuidados (SAE) | `CarePlan`, diagnóstico PES real/risco/promoção, NIC, NOC com avaliação | tipo "síndrome"; metas com prazo e níveis; cuidados para família; impressão da prescrição |
| Avaliação de ferida | `ConditionAssessment`: C×L×P, tecido predominante, exsudato, dor, TIME (infecção IWII, bordas, tipo de exsudato, % de granulação/epitelização/esfacelo/necrose), PUSH | etiologia com classificação, várias feridas no mapa do corpo, pele adjacente, exsudato pela saturação, NERDS/STONEES, biofilme, dor no curativo, legendas dos critérios |
| Avaliação de estomia | `kind=stoma`, tipo (colo, íleo, uro), escala DET, complicações por código | altura, diâmetro, mucosa, efluente e débito, equipamento e adjuvantes, autocuidado, gastrostomia, cirurgia |
| Anamnese | texto livre (comorbidades, alergias, medicamentos, cirurgias) | listas fechadas, nutrição e IMC, pulsos, ITB, sensibilidade, exames em série |
| Escalas | PUSH, DET | Braden, RESVECH 2.0 (Morse e Norton ficam para depois) |
| Registro do curativo | evolução e registro de intervenção | etapas do curativo com produto, dose de laser, frequência de troca, ligação com kit e baixa |
| Consentimento | `ConsentRecord` com finalidades `treatment` e `image`, versão e hash do texto, revogação | TCLE por procedimento (desbridamento, laser), imagem em 4 finalidades, testemunha |
| Documentos | HTML imprimível: declaração de comparecimento, consentimento, plano de cuidados, recibo, relatório, repasse | receituário, encaminhamento, proposta do plano; timbre; PDF de verdade; assinatura digital |
| Pacotes | `SessionPackage`: N sessões de um procedimento, preço, validade, consumo | nome e explicação que a clínica entenda; proposta com frequência e duração |
| Estoque | insumos, kits por procedimento, baixa | catálogo de coberturas com indicação e troca, semente de insumos |

## 5. Propostas de issue (rascunho, não criadas)

Prioridade pela regra do projeto: P1 é bug ou valor visível que a clínica já pediu; P2 é
qualidade e o que destrava o resto; P3 é melhoria. **Decisão de produto fica com o Kalléo**:
onde há uma, ela está marcada como pergunta.

| # | Título | Problema | Pronto quando | Prio |
| --- | --- | --- | --- | --- |
| P1-1 | SAE: a clínica cadastra os diagnósticos que usa | A busca só acha o catálogo global e não aceita diagnóstico digitado; a clínica usa NANDA-I 2024-2026 | admin da clínica cadastra código (5 dígitos, opcional), título, domínio/classe e edição, ou importa CSV; o plano aceita diagnóstico do catálogo da clínica ou digitado à mão (marcado "sem código"); escopo por empresa com `writeScope`; nada da taxonomia entra no repo | P1 |
| P1-2 | Avaliação de ferida: critérios legíveis na tela | "Tabelas de avaliação pouco claras" | cada campo TIME mostra a legenda do critério (ex.: faixas de exsudato pela saturação, o que é cada tecido); validado em 360 px | P1 |
| P1-3 | Receituário de enfermagem em PDF | A clínica pediu prescrição em PDF | documento com dados da clínica, enfermeira e COREN, paciente, data e itens prescritos, gerado a partir do plano ou da consulta, baixável em PDF | P1 |
| P1-4 | "Pacotes" vira "Plano de acompanhamento" | Ninguém entende a aba | aba, botões e documentos usam "Plano de acompanhamento"; uma frase explica saldo, validade e preço por sessão; `CONTEXT.md` atualizado | P1 |
| P2-5 | Assinatura digital ICP-Brasil nos documentos | Pedido da clínica; COFEN oferece certificado gratuito aos enfermeiros | discovery: assinatura PAdES com certificado da profissional (A1 ou A3/nuvem), sem guardar chave no servidor; ADR; prova de conceito em um documento | P2 |
| P2-6 | Avaliação de ferida: campos que faltam | Modelo da clínica tem etiologia classificada, várias feridas, pele adjacente, NERDS/STONEES, biofilme, dor no curativo | campos estruturados com códigos estáveis e rótulos em `format.ts`; migração aditiva; relatório mostra a série | P2 |
| P2-7 | Avaliação de estomia completa | Faltam altura, diâmetro, mucosa, débito, equipamento, adjuvantes, autocuidado, gastrostomia | idem P2-6 para `kind=stoma`; alto débito acima de 1000 ml aparece em destaque | P2 |
| P2-8 | Termos por procedimento e imagem em 4 finalidades | Hoje só há tratamento e imagem genérica | finalidades `debridement`, `laser` e as 4 de imagem, cada uma aceita ou recusada; testemunha opcional; **texto final depende do #376** (placeholder até lá) | P2 |
| P2-9 | Escalas Braden e RESVECH 2.0 | O protocolo usa essas escalas como indicador | escore calculado, série histórica no relatório | P2 |
| P2-10 | Registro do curativo em etapas | O modelo registra limpeza, desbridamento, adjuvante, coberturas, laser (J, nm, pontos) e próxima troca | formulário por etapa ligado ao kit e à baixa de estoque | P2 |
| P2-11 | Proposta do plano de acompanhamento em PDF | A clínica entrega proposta com frequência, duração, terapias e preço | documento gerado do pacote e do plano; validade configurável; **pergunta:** validade padrão e texto de garantia | P2 |
| P3-12 | Timbre da clínica nos documentos | Documentos sem a identidade da clínica | cor de destaque e rodapé de contato na Identidade; documentos usam logo, cor e rodapé; fontes livres (as da marca são demo) | P3 |
| P3-13 | Metas em três níveis com prazo e cuidados para família | Modelo usa metas conferíveis por nível e orientações leigas | meta com prazo e nível; o plano impresso traz os cuidados para paciente e família | P3 |
| P3-14 | Anamnese estruturada e exames em série | Texto livre não gera alerta nem série | listas de comorbidades, IMC e perda ponderal, ITB, pulsos, sensibilidade; tabela de exames por data | P3 |

Fora desta lista, ideias do benchmark (seção 6) para o backlog: encaminhamento multiprofissional
gerado da avaliação, catálogo de coberturas com indicação e frequência de troca, semente de
insumos, declaração de comparecimento com hora de fim e modalidade.

## 6. Benchmark: NurseUp

Sistema de mercado com estrutura clínica escrita pela mesma enfermeira autora dos materiais da
mentoria, o que explica a semelhança dos modelos. Lido pelo site público.

| NurseUp tem | estomasystech | Vale copiar a ideia? |
| --- | --- | --- |
| Processo de Enfermagem em 5 passos: avaliação com escalas, diagnóstico **sugerido** a partir da avaliação (aceitar, editar ou escrever), meta com prazo, prescrição com frequência e responsável, evolução comparada | plano PES e NOC existem; sem sugestão nem meta com prazo | sim: sugestão a partir da avaliação depois de P1-1; meta com prazo em P3-13 |
| Documentos em PDF assinados digitalmente com COREN | HTML para imprimir | sim (P1-3, P2-5) |
| Consentimento assinado online antes da consulta, com pré-cadastro pelo link de agendamento | portal com autoagendamento; aceite de termos antes da consulta não confirmado | conferir lacuna no portal |
| Registro por voz com IA, campo a campo, áudio descartado | não | depois; exige ADR de LGPD |
| Offline com sincronização | não | não agora |
| Foto sem localização e metadados | `image-sanitizer.ts` já remove | já coberto |
| Papéis: técnico registra sem ver financeiro; secretária não vê saúde | papéis próprios | comparar com `docs/domains/acesso` |
| Financeiro (recibo PDF) e estoque (validade, custo médio) | recibo e estoque existem | conferir validade e custo médio |
| Em breve: precificação e medida da ferida pela foto | não | precificação é decisão de produto |

Preço público: duas pacientes grátis, depois R$ 79,90 por mês. A área logada (dashboard de
negócio) não foi vista; o Kalléo ofereceu fazer o login se for preciso.

## Decisões e perguntas abertas

Decididas pelo coordenador em 2026-11-20 (reversíveis, registradas aqui):

1. **"Pacotes" passa a se chamar "Plano de acompanhamento"** (P1-4). O nome é o da clínica (proposta
   de plano de acompanhamento) e a troca é só de rótulo e texto de ajuda; o modelo
   `SessionPackage` não muda.
2. **Cadastro de diagnósticos: um a um e por importação CSV, os dois** (P1-1). Um a um resolve o
   "Outros" do dia a dia; o CSV deixa a clínica trazer a lista que já usa sem que a taxonomia
   passe pelo repo público. O CSV é da clínica e fica só no banco, no escopo da empresa.
3. **Assinatura digital: chave privada nunca no servidor** (P2-5). A discovery parte do
   certificado em nuvem (A3, como o oferecido pelo COFEN), com assinatura remota autorizada pela
   profissional a cada documento. Guardar A1 no servidor fica descartado: um vazamento permitiria
   assinar em nome da enfermeira, e dado de saúde vem antes de conveniência.

Pendente do Kalléo (licença e dinheiro):

4. **Fontes da marca.** Os arquivos são demo, sem licença comercial. Até a clínica comprar a
   licença, os documentos usam fontes livres (P3-12).
