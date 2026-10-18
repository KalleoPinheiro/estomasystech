---
title: "Auditoria UX/UI — EstomaSysTech (2026-08)"
status: frozen
audience: [dev, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Auditoria UX/UI — EstomaSysTech (2026-08)

**Method:** dual-agent per superfície — 9 agentes opus rodaram em paralelo, cada um com leitura de código-fonte + screenshots reais (desktop 1440×900 e mobile 390×844) do app rodando localmente (Docker Postgres + `next dev`, modo aberto, dados de seed mínimos: 1 paciente com colostomia, 1 profissional, 1 procedimento, 1 insumo, 1 consulta futura, 1 condição clínica + plano de cuidados ativos). Detector estático `impeccable/detect.mjs` rodou limpo (0 achados) sobre `src/app` e `src/components` — consistente com o gate `npm run check:sv` 100% verde: **os dois gates confirmam zero degrau de paleta crua e zero elemento nativo (`<button>`/`<input>`/`<select>`/`<table>`) fora do catálogo do design system, mas não cobrem todo HTML** — a própria auditoria abaixo encontra `<div onClick>` e `<img>` crus (e o documento irmão registra um `<circle>` cru), e isso não garante qualidade de UX — é exatamente o que esta auditoria mede.

**Escopo:** as 18 superfícies do produto — 14 páginas + 4 documentos clínicos imprimíveis.

**Documento irmão:** [`auditoria-design-system-2026-08.md`](auditoria-design-system-2026-08.md) — gaps do `@still-void/ui` consolidados e deduplicados entre as 9 análises.

---

## Sumário executivo

### O padrão que se repete em quase toda superfície

Cinco defeitos estruturais aparecem, de forma independente, em praticamente todas as 9 análises — não são bugs isolados, são a mesma decisão de arquitetura de UI faltando em todo lugar:

1. **Mobile quebrado, não degradado.** `(staff)/layout.tsx:11` fixa `Sidebar className="w-56 shrink-0"` sem nenhum breakpoint, e `overflow-x-hidden` no `<main>` **amputa** o que sobra em vez de rolar. Em 390px, sobram ~130-170px de conteúdo — títulos cortados no meio, colunas de tabela inalcançáveis, botões primários fora da tela. Confirmado nos 26 screenshots (13 rotas × 2 viewports). Isso não é "a UX não é ótima no celular" — é "o app não funciona no celular", em toda tela do staff sem exceção. Numa clínica de atendimento domiciliar/leito, é o achado de maior impacto isolado desta auditoria.

2. **Ação destrutiva a um clique, sem confirmação, sem desfazer.** Contadas ~15 ocorrências: desativar paciente/profissional/parceiro/procedimento, cancelar fatura, resolver condição/plano de cuidados (irreversível — **não existe** ação de reabrir em lugar nenhum da UI), excluir foto clínica, cancelar/antecipar retorno. `AlertDialog` está no catálogo (`@still-void/ui/react/client`), pronto, e não é usado em nenhuma delas.

3. **Erro de API e "não há dado" são visualmente idênticos.** Em pelo menos 5 páginas (dashboard, relatórios, prontuário — o mais grave —, materiais/insights, portal), o campo `error` de `useApiQuery` é descartado no destructuring, e `data ?? []` transforma falha de rede em afirmação factual: "Nenhuma condição clínica cadastrada", "Nenhum retorno pendente", "0.0%". No prontuário, isso pode fazer uma paciente com colostomia ativa aparecer como paciente sem nenhuma condição — não é bug de estética, é dado clínico incorreto apresentado com confiança total.

4. **Nenhum feedback depois de salvar.** A lib não tem `Toast`; o app não compensa. Criar consulta, registrar evolução SOAP, prescrever intervenção, salvar cadastro — o padrão dominante é "modal fecha, nada confirma". O caso mais grave: agendar uma consulta em `/agenda` fora do mês visível **não move a tela para lá** — a consulta existe, mas nada na UI o comprova, e a recepção reagenda em duplicidade por incerteza.

5. **Alvo de toque abaixo do mínimo WCAG 2.5.8 (24×24px), em ações de alto risco.** `variant="link" className="h-auto p-0"` é o padrão dominante para ações de linha de tabela — inclusive as destrutivas do item 2. Efeito composto: o alvo pequeno aumenta a chance de erro, e a ausência de confirmação (item 2) faz o erro ser definitivo.

### Achados de maior gravidade individual (fora do padrão acima)

- **Atestado médico imprime "compareceu" para consulta cancelada ou com falta** — a página nunca lê `appointment.status`, e o link fica sempre visível no detalhe da consulta. Falsidade documental gerada pelo produto, não pelo usuário.
- **Complicações de estomia gravadas (`complicationCodes`) nunca aparecem em nenhuma tela** — nem no prontuário, nem no relatório enviado ao médico parceiro. A enfermeira acredita ter documentado um prolapso; o registro mostra `—`.
- **Notas clínicas de texto livre (`assessment.notes`, hipóteses diagnósticas) vazam para o portal do paciente e do parceiro sem filtro**, enquanto o código declara minimização LGPD só para fotos.
- **Consentimento LGPD renderizado em `<pre>` monoespaçado 12px numa caixa de 192px de altura**, com o botão de aceite habilitado desde o primeiro pixel, sem versão do termo e sem via de revogação.
- **Trocar de aba no prontuário apaga texto de evolução SOAP não salvo, sem aviso** — perda de documentação clínica por navegação acidental.
- **Campo de comissão do profissional não existe na API nem no formulário**, apesar do relatório mensal já calcular repasse — a coluna "Repasse" é sempre `—`.
- **KPIs financeiros de `/faturamento` são somados no cliente sobre a página carregada (máx. 100 itens) e mudam com o filtro de status** — "Total recebido: R$ 0,00" aparece ao filtrar "Pendentes", com o número mais confiável da tela sendo o menos confiável.
- **Dados da clínica para cabeçalho de documentos (CNPJ, responsável técnico, registro) só existem em variável de ambiente**, sem UI nenhuma — se vazios, os 4 documentos clínicos saem sem identificação legal, em silêncio.
- **A trilha de auditoria (LGPD art. 11) não cobre login/logout, criar/editar paciente, criar consulta, nem mudanças em configuração** — e enquanto não houver contas individuais, todo evento é assinado `admin/local`, tornando a trilha inútil para responsabilização.
- **A agenda reimplementa um calendário de mês do zero** (grade, `dayKey` triplicado no repo, cores de status à mão) enquanto o portal do paciente já tem `ListAvailableSlots` — disponibilidade com prevenção de erro real — e a tela do staff não a reaproveita.

### O que está genuinamente bem feito (vale preservar)

- Camada de domínio e regras de negócio (horário comercial, conflito de agenda, imutabilidade de evolução, autoria automática por sessão, minimização de dados no portal) — sólida e bem testada.
- `StatusBadge` do app usa tokens semânticos `-ink` deliberadamente, não o accent da marca — decisão documentada e correta.
- SAE (diagnóstico NANDA-I → NOC → NIC) no plano de cuidados é a peça mais bem projetada do produto: frase PES automática, âncoras de escala visíveis, sugestão de termos por diagnóstico.
- `HealingChart` é o único componente que já usa os primitivos de chart da lib corretamente (`ChartContainer`/`ChartAxis`/`ChartLine`), com `SPEC_DEVIATION` documentado.
- Consentimento de foto e status de consentimento têm fonte única entre o card de aviso e o bloqueio de upload — sem tela divergente.
- Disciplina de sv-gap: todo workaround por ausência de componente é marcado no código com `sv-gap: <slug>` e reconciliado por gate automático — processo exemplar, é o motivo desta auditoria conseguir separar "gap real da lib" de "bug de adoção" com precisão.

### Escala do achado

18 superfícies auditadas, ~35 problemas P0, ~40 P1, dezenas de P2/P3. Nenhuma catástrofe de segurança ou de arquitetura — o padrão de dívida é uniformemente **camada de apresentação e prevenção de erro**, concentrado nos cinco pontos do topo desta seção. Isso é uma notícia relativamente boa: os cinco pontos, resolvidos na infraestrutura (shell responsivo, `AlertDialog`, contrato de erro do `useApiQuery`, `Toast`, tamanho mínimo de alvo), fecham a maioria dos achados de uma vez, sem precisar de 18 correções pontuais.

---

## Índice

1. [Dashboard (staff home) — `/`](#dashboard)
2. [Agenda — `/agenda`](#agenda)
3. [Pacientes e Prontuário — `/pacientes`, `/pacientes/[id]`](#prontuario)
4. [Procedimentos e Materiais — `/procedimentos`, `/materiais`](#catalogo)
5. [Faturamento e Relatórios — `/faturamento`, `/relatorios`](#financeiro)
6. [Profissionais e Parceiros — `/profissionais`, `/parceiros`](#diretorios)
7. [Auditoria e Configurações — `/auditoria`, `/configuracoes`](#admin)
8. [Login e Portal — `/login`, `/portal`](#acesso)
9. [Documentos clínicos — atestado, consentimento, plano de cuidados, relatório](#documentos)

Cada seção abaixo reproduz o relatório completo do agente responsável: o que funciona bem, heurísticas de Nielsen com problema, problemas prioritários (P0-P3, com comando `/impeccable` sugerido), plano de ação no formato tlc-spec-driven (Specify/Design/Tasks) e riscos por persona. Os gaps de design system citados em cada seção estão consolidados e deduplicados no documento irmão.

---

<a id="dashboard"></a>

## 1. Dashboard (staff home) — `/`

### O que funciona bem

- **A hierarquia de KPI→painéis está certa no desktop.** Os 4 cartões de métrica em `grid-cols-4` e depois duas colunas (`page.tsx:56,65`) dão a leitura "números do mês → o que fazer agora" em um scan vertical. Para modo Operate, é a IA correta.
- **`StatusBadge` é disciplina de design system de verdade.** `status-badge.tsx:8-16` mapeia status para tokens semânticos `-ink` (contraste 4.5:1) em vez do accent da marca — "pago" nunca colide com o roxo do site, e o docstring documenta *por que* usa `CategoryPill` e não `Badge`. Isso é raro e deve ser preservado.
- **`LoadingIndicator` já acerta acessibilidade.** `feedback.tsx:26-33` combina `CardSkeleton` (aria-hidden) com `sr-only` + `aria-busy`/`aria-live` — leitor de tela é anunciado e o teste tem âncora textual.
- **Estado ativo da nav é correto e não decorativo.** `staff-nav.tsx:22-24,38-40`: `aria-current="page"` + `headerClasses.linkActive`, com regra especial para `/`.

### Heurísticas de Nielsen com problema (≤2)

| # | Heurística | Nota | Evidência |
|---|---|---|---|
| 1 | Visibilidade do status do sistema | **2** | `resolveFollowUp` (`page.tsx:34-40`) e `triage` (`page.tsx:203-214`) não dão nenhum feedback de sucesso — o item some da lista e pronto. `if (!summary) return <LoadingIndicator/>` (`page.tsx:43`) troca a página inteira por um único skeleton, sem preservar layout. |
| 3 | Controle e liberdade do usuário | **1** | "Cancelar" um retorno, "Antecipar retorno" e "Ok, manter plano" (`page.tsx:143-150,256-271`) são **irreversíveis, sem confirmação e sem desfazer**. A lib exporta `AlertDialog` completo e ele não é usado em lugar nenhum desta tela. |
| 4 | Consistência e padrões | **2** | Quatro affordances diferentes para ação na mesma linha da lista de retornos: `<Link>` do Next para o paciente (`:108`), `<Link>` para agendar (`:129`), e dois `<Button variant="link" className="h-auto p-0">` (`:135,:143`). Além disso `<Card>` aninhado dentro de `<Card>` (`:97` contém `:220`) e dois padrões de erro coexistindo (global em `:42` vs. inline em `:224`). |
| 5 | Prevenção de erros | **1** | "Concluir" (verde) e "Cancelar" (cinza) são texto de 14px, `p-0`, encostados um no outro com `gap-3`. Alvo de clique bem abaixo dos 24px que o próprio `staff-nav.tsx:29` se orgulha de garantir. Numa lista densa, enfermeira cancela retorno querendo concluir — e não há como voltar atrás. |
| 7 | Flexibilidade e eficiência | **2** | Os 4 KPIs (`page.tsx:45-50`) são texto morto: "Faturas pendentes 0" não leva a `/faturamento`. Nenhum atalho de teclado, nenhum filtro, nenhum link do item de triagem para o prontuário do paciente (`photo.patientId` existe em `:189` e não é usado). |
| 8 | Estética e minimalismo | **2** | No desktop o card "Consultas de hoje" tem ~200px de vazio branco abaixo do empty state porque estica para a altura da coluna irmã. E o layout mobile está quebrado (ver P0-1). |
| 9 | Ajudar a reconhecer e recuperar de erros | **1** | `resolveFollowUp` (`:34-40`) não tem `try/catch`: se o PATCH falha, é unhandled rejection e o usuário não vê nada. Pior: `useApiQuery` para follow-ups (`:27`) e supplies (`:30`) devolve `error` que a página **descarta** — API fora do ar renderiza "Nenhum retorno pendente" como se fosse verdade clínica. |
| 10 | Ajuda e documentação | **2** | O selo `PUSH 12` / `DET 4` (`page.tsx:237-241`) aparece sem tooltip ou legenda. São escalas de avaliação de ferida — quem não é enfermeira estomaterapeuta não decodifica, e a lib tem `Tooltip` disponível. |

### Problemas prioritários

**[P0-1] O app inteiro é inutilizável no mobile — a sidebar não colapsa**
- **Por que importa:** `layout.tsx:11` fixa `w-56 shrink-0` **sem nenhum breakpoint**. Em 390px sobram ~118px de conteúdo: o título "Dashboard" é cortado no meio, "Ver agenda completa" se sobrepõe ao heading do card, "Placa coletora drenável 2 peças" desaparece porque só sobra "0/10 unidade". Não é degradação — é a tela não funcionar.
- **Correção:** sidebar `hidden lg:flex`, e em `<lg` um `Dialog` da lib como drawer, disparado por `Button variant="ghost"` com `Icon name="menu"` numa topbar sticky.
- **Comando:** `/adapt`

**[P0-2] Ações clínicas irreversíveis como micro-links, sem confirmação, sem feedback e sem tratamento de erro**
- **Por que importa:** três dos quatro botões desta tela mudam estado clínico do paciente de forma permanente com um clique em texto de 14px. `resolveFollowUp` sequer tem `try/catch`. "Cancelar retorno" por engano em paciente com colostomia é dano assistencial real.
- **Correção:** `try/catch` espelhando o padrão correto de `TriageQueue`; `AlertDialog` para as ações destrutivas nomeando o paciente; `Button variant="ghost" size="sm"` no lugar de `variant="link"`; mover ações para `DropdownMenu` quando a lista passar de ~3 itens.
- **Comando:** `/harden`

**[P1-1] A fila de triagem clínica está enterrada dentro do card "Retornos pendentes"** — `<TriageQueue/>` fica dentro do card errado, produzindo hierarquia de heading inválida e deslocando o "Estoque baixo" de forma imprevisível. **Correção:** promover para faixa própria de largura total, acima do grid de KPIs. **/layout**

**[P1-2] Erro de API vira empty state mentiroso** — `error` de 3 queries é descartado; se a API cair, "Nenhum retorno pendente" aparece com confiança total. **Correção:** `ErrorAlert` por card com "Tentar novamente"; `CardSkeleton` por card em vez de loading de página inteira. **/clarify**

**[P1-3] O chevron dos links "Ver agenda completa"/"Ver materiais" quebra para a linha de baixo** — defeito de `.sv-icon` sem `display`/`vertical-align` (gap de lib, ver documento irmão). **Correção no app:** `inline-flex items-center gap-1 whitespace-nowrap`. **/typeset**

**[P2-1] KPIs mudos: quatro números sem destino, sem período e sem comparação.** **/clarify**

**[P2-2] Grid de duas colunas só ativa em `xl` (1280px), desperdiçando o notebook típico da recepção.** **/layout**

**[P2-3] Empty state é um parágrafo cinza centralizado, sem ícone e sem saída.** **/onboard**

**[P3-1] Siglas clínicas PUSH/DET sem tooltip; `Hero` com respiro de landing page no topo de tela operacional.** **/quieter**

### Gaps do `@still-void/ui` (resumo — detalhe no documento irmão)

`Sidebar` sem modo responsivo · sem Toast/undo · sem `EmptyState` · `Icon` quebra em texto inline · sem primitivo de KPI/Stat · `Button` sem densidade `xs` com hit-area preservada.

### Plano de ação (tlc-spec-driven leve)

**Specify** — Objetivo: tornar o dashboard operável no celular e seguro para ações clínicas, sem sair do catálogo `@still-void/ui`. Critérios: (1) sem overflow horizontal em 390-1440px; (2) toda ação de escrita confirma em ≤300ms ou mostra erro — zero falha silenciosa; (3) falha de API nunca renderiza como empty state; (4) nenhum alvo interativo < 24×24px; (5) `check:sv` permanece verde.

**Design** — `StaffLayout` vira app shell (`hidden lg:flex` + drawer via `Dialog`); `TriageQueue` sai para seção própria; ações destrutivas via `Button ghost size sm` + `AlertDialog`; `error` das 3 queries renderiza `ErrorAlert` por card; `EmptyState` local ganha `icon/title/action`; KPIs viram `Link` para rota filtrada; grid `lg:grid-cols-2 items-start`; ícones inline com `whitespace-nowrap`.

**Tasks:** T1 sidebar responsiva + drawer · T2 teste Playwright de overflow 390-1440 · T3 `try/catch` + `ErrorAlert` em `resolveFollowUp` · T4 `AlertDialog` nas 2 ações destrutivas + `Button ghost size sm` · T5 propagar `error` das 3 queries + `CardSkeleton` por card · T6 extrair `TriageQueue` pra seção de topo · T7 `EmptyState` rico · T8 KPIs clicáveis + grid `lg:2` · T9 ícones inline + `Tooltip` no selo PUSH/DET · T10 registrar 6 gaps novos em `docs/still-void-gaps.md`.

### Riscos de persona

**Sam (acessibilidade):** hierarquia de heading inválida (`<h3>` antes do `<h2>` pai); alvos abaixo do mínimo WCAG 2.5.8 em ações irreversíveis vizinhas; mudança de estado sem `aria-live`; erro sem `role="alert"` nem foco; cor como único portador de significado no estoque baixo; reflow reprovado em todo o app por causa da sidebar fixa.

**Alex (power user):** zero navegação por teclado além do Tab; dashboard é beco sem saída (KPIs não navegam); listas truncadas (`slice(0,8)`) sem indicar que há mais; botões não desabilitam durante o PATCH (duplo clique dispara 2 requests); `xl:grid-cols-2` deixa "Estoque baixo" abaixo da dobra no notebook real da recepção.

---

<a id="agenda"></a>

## 2. Agenda — `/agenda`

### O que funciona bem

- Regra de negócio existe e é única — `assertSlotAvailable` é a mesma verdade usada por agendamento, remarcação, série e portal. O problema é 100% de UI.
- Contrato de erro limpo: `ApiError.status` está disponível e mapeado corretamente no backend (409/400) — a UI simplesmente não usa.
- Catálogo preenche o formulário automaticamente (nome/preço/duração), deixando editável.
- Série semanal reporta datas puladas em vez de falhar em silêncio.
- Máquina de estados de `VISIBLE_ACTIONS` só mostra ações válidas para o status atual — prevenção de erro real, único lugar da tela onde ela existe.
- `Modal` delega focus trap/Escape/dismiss ao Radix corretamente.

### Heurísticas com problema

| # | Heurística | Nota | Evidência |
|---|---|---|---|
| 1 | Visibilidade do status | **1** | Agendar consulta única não produz **nenhuma** confirmação. Se a data cai em outro mês, o registro nasce invisível — a grade continua vazia. |
| 5 | Prevenção de erros | **0** | Sem `min`/`max` em data e hora; duração pode estourar o expediente sem aviso; a grade permite clicar em domingo. As três regras existem só como parágrafo cinza — e o produto **já resolveu isso no lugar errado**: o portal do paciente tem `ListAvailableSlots` com prevenção real; o staff, que agenda 20×/dia, não a usa. |
| 9 | Reconhecer/recuperar de erros | **1** | 409 não diz com qual consulta conflita, de quem, nem oferece horário livre. 400 e 409 caem no mesmo alerta vermelho, indistinguíveis, exigindo ações opostas. |
| 4 | Consistência | **2** | O portal resolve o mesmo problema (agendamento) de forma completamente diferente e melhor que o staff. O aviso de regra vem de constante hardcoded no cliente, enquanto `/configuracoes` grava outra config no banco — **o aviso pode estar mentindo**. |
| 6 | Reconhecimento | **1** | 5 cores de status na grade sem legenda nenhuma; `title` HTML é o único acesso ao detalhe (inexistente em touch). |
| 7 | Flexibilidade | **2** | Só existe visão de mês; célula cresce sem limite e sem "+N mais"; sem "Hoje", sem deep-link de mês. |
| 8 | Estética | **2** | Filtro de profissional estica ~800px, roubando hierarquia do controle menos usado da tela; "Agosto **De** 2026" — bug de `capitalize` do Tailwind. |
| Acess. | (fora da lista, bloqueante) | **0** | Cada dia é `<div onClick>` sem `role`/`tabIndex`/teclado, com `<Button>` aninhado dentro. Zero navegação por teclado na agenda inteira. |

### Problemas prioritários

**[P0-1] A consulta agendada some — sem confirmação, sem navegação, sem rastro.** `handleCreate` fecha o modal e chama `refresh()` do mês *visível*; se a data é de outro mês, nada muda na tela. O screenshot é a prova viva: existe consulta em 02/09, tela mostra agosto vazio. **Correção:** navegar `monthDate` para o mês criado + flash na célula + confirmação persistente com ação Ver/Desfazer + limpar `?followUpId` da URL. **/harden**

**[P0-2] Prevenção de erro zero no staff — enquanto o portal já tem tudo pronto.** `ListAvailableSlots` já existe e é usado só no portal. **Correção:** promover para `/api/appointments/slots` (staff), trocar `Input type="time"` por `SlotPicker` idêntico ao do portal; mínimo imediato: `min`/`max`/`step` nos 3 campos. **/harden**

**[P0-3] Grade inoperável por teclado e invisível para leitor de tela.** 42 `<div onClick>` sem `role`/`tabIndex`, `<Button>` aninhado gerando duplo disparo. **Correção:** `role="grid"` completo, roving tabindex, setas/Home/End/PageUp/Down, `aria-label` por célula, `Tooltip` no lugar de `title`. **/harden**

**[P0-4] Mobile inutilizável abaixo de ~1100px.** `min-w-[840px]` na grade + sidebar fixa = só a coluna "DOM" aparece. **Correção:** sidebar vira drawer; abaixo de `md`, grade de 7 colunas vira lista de agenda por dia. **/adapt**

**[P1-5] Sábado, domingo e passado clicáveis e visualmente idênticos a dia válido** — inclusive o botão principal "+ Nova consulta" abre com `new Date()`, garantindo formulário inválido no fim de semana. **/clarify**

**[P1-6] O aviso de regra de negócio pode estar mentindo** — vem de constante de build, não da `ScheduleConfig` real do banco. **/clarify**

**[P1-7] Cinco cores sem legenda; mês vazio sem estado vazio útil.** **/onboard**

**[P2-8] Célula sem teto e sem visão de dia** — só existe mês; com 8-10 consultas/dia a grade perde a forma. **/layout**

**[P2-9] "Agosto De 2026" e hierarquia invertida da toolbar** (filtro mais pesado visualmente que o título do mês). **/typeset**

**[P2-10] 400 e 409 no mesmo alerta vermelho, sem dizer com o quê conflita.** **/clarify**

**[P3-11] Aviso de série pulada não é anunciado, não fecha, não é acionável.** **/polish**

### Gaps do `@still-void/ui`

**GAP central — `Calendar`/`DatePicker`/`TimeField`**: nenhuma primitiva de data no catálogo. Todo o calendário de mês foi reimplementado do zero (`calendar-grid.tsx`), com `dayKey` triplicado no repo e chips de evento feitos de `Button` neutralizado a golpe de `className` — o gate `check:sv` passa (zero HTML cru), mas também é falso verde: zero uso real do design system. Este gap sozinho explica a maioria dos P0/P1 desta página. Demais: `Alert` sem variantes, `Toast` ausente (causa direta do P0-1), `Field`/`Label`, `ToggleGroup` (repetido em 3 lugares do app).

### Plano de ação

**Specify** — Transformar `/agenda` de leitura-com-tentativa-e-erro em instrumento com prevenção de erro real, reaproveitando a engine que o portal já tem. Critérios: impossível submeter fora da grade configurada; toda criação leva a visão até a consulta criada; 400/409 tratados de forma distinta com pelo menos um horário livre sugerido no 409; grade 100% por teclado; usável em 390px; toda regra exibida vem da config persistida.

**Design** — `useScheduleConfig()` como fonte única; `ListAvailableSlots` promovido a endpoint staff; `<SlotPicker>` compartilhado entre staff e portal; camada de compatibilidade `src/components/calendar/` isolando o workaround; responsivo por formato (lista no mobile, grade no desktop), não por escala.

**Tasks:** T1 `useScheduleConfig` + `min/max/step` nos campos (XS, mata a classe inteira de 400) · T2 confirmação+navegação pós-criação (S) · T3 estados de grade vazia/filtrada + legenda (S) · T4 marcar dias inválidos como não-clicáveis + default do "+Nova" pro próximo horário útil (S) · T5 `GET /api/appointments/slots` (M) · T6 `<SlotPicker>` compartilhado (M) · T7 ramificar erro por status com sugestão de slots livres (M) · T8 acessibilidade completa da grade (M) · T9 responsivo (M) · T10 alternador Dia/Semana/Mês (L) · T11 polimento de toolbar (XS) · T12 `seriesNotice` → `Callout` (S) · T13 registrar gaps.

### Riscos de persona

**Jordan (recepcionista nova):** vê grade vazia de agosto e conclui "sistema perdeu os agendamentos" (a consulta de setembro é invisível); agenda duas vezes por incerteza de sucesso; leva erro de horário comercial num sábado com paciente esperando; não decifra as cores da grade; não sabe o que "intervalo mínimo de 15min" muda na prática; tenta usar Tab/setas e nada acontece.

**Riley (stress-test):** cria consulta em 1823 (sem `min` na data, servidor não valida passado — lixo permanente no banco); agenda 17:30+120min só falha no servidor; série de 12 sessões pula 8 sem motivo por data; duas abas dessincronizadas mostram ações inválidas; `/configuracoes` diz uma coisa, formulário de agenda diz outra — e ambas estão "certas" em momentos diferentes; URL manipulada com `followUpId` inválido reabre o modal indefinidamente.

---

<a id="prontuario"></a>

## 3. Pacientes e Prontuário — `/pacientes`, `/pacientes/[id]`

> Superfície de maior risco clínico do sistema. Todo achado confirmado em código ou screenshot; nada especulativo.

### Pacientes (lista) — O que funciona bem

- Busca com debounce de 300ms sobre nome/email/telefone.
- Identidade com três âncoras: nome, contato, nascimento — nascimento na lista é acerto real (desempate de homônimos).
- `PagedList` centraliza corretamente carregando→vazio→conteúdo; é o único ponto do sistema com loading bem feito.
- `StatusBadge` com ponto colorido **+ label textual** — não é encoding só por cor.

### Pacientes — Heurísticas com problema

| # | Heurística | Nota |
|---|---|---|
| 1 | Visibilidade do status | **1** — busca não zera a lista antiga; risco de abrir o paciente errado |
| 5 | Prevenção de erro | **0** — "Desativar" sem confirmação, colado em "Editar" |
| 6 | Reconhecimento | **2** — empty state idêntico para base vazia e busca sem resultado |
| 8 | Hierarquia | **2** — "Prontuário" (95% dos acessos) tem peso visual igual a "Editar" |
| — | Responsividade | **0** — inutilizável abaixo de ~900px |

### Pacientes — Problemas prioritários

**[P0-L1] Layout não colapsa no mobile — conteúdo clipado, não rolável.** `overflow-x-hidden` torna colunas inalcançáveis, não só apertadas. Uma enfermeira em atendimento domiciliar não confirma nem a data de nascimento no celular. **/adapt**

**[P1-L2] "Desativar"/"Editar" sem confirmação nem hierarquia, alvos de ~16px.** **/harden**

**[P1-L3] Lista estagnada durante a busca — risco de abrir o prontuário errado**, o erro de identificação de paciente clássico. **/clarify**

**[P2-L4] `opacity-50` na linha inativa quebra contraste abaixo de 4.5:1.** **/audit**

**[P2-L5] Estado vazio ambíguo, sem contagem de resultados.** **/onboard**

### Prontuário do paciente — Estrutura atual

5 abas horizontais em `useState` (não na URL): Anamnese (default) · Estomias e feridas · Evoluções (SOAP) · Plano de Cuidados (SAE) · Pacotes.

### Prontuário — O que funciona bem

- `AllergyBanner` fora do sistema de abas, sempre visível — posicionamento clinicamente correto.
- Contadores nos rótulos das abas evitam busca cega.
- Nota de imutabilidade explícita nas evoluções, comunicada *antes* do registro.
- Autoria automática pelo servidor mesmo sem seleção manual — blindagem legal sólida no backend (mas ver P1-R12: a UI permite contornar isso).
- SAE completo e correto — frase PES automática, NOC com âncoras de escala textuais, sugestão de termos por diagnóstico. **O trecho mais bem projetado do produto.**
- Comparação primeira×atual nas fotos com data em cada painel — conceito certo (execução tem problema, ver P1-R8).
- `HealingChart` com disciplina de adoção impecável — o problema é de leitura clínica, não de adoção (P1-R9).

### Prontuário — Heurísticas com problema

| # | Heurística | Nota | Evidência |
|---|---|---|---|
| 1 | Visibilidade do status | **0** | Erro de rede e "sem dados" indistinguíveis nas 4 seções clínicas; nenhum loading state em nenhuma delas. |
| 5 | Prevenção de erro | **0** | Trocar de aba destrói texto não salvo; 3 ações irreversíveis sem confirmação. |
| 2 | Correspondência com mundo real | **1** | `tissueType` exibido cru em inglês (`granulation`/`slough`/`necrotic`) — inclusive no relatório enviado ao médico parceiro. |
| 4 | Consistência | **1** | Abas feitas à mão em vez de `Tabs` da lib; sem `role="tablist"`, sem `aria-selected`. |
| 6 | Reconhecimento | **1** | Aba não está na URL — impossível linkar "evoluções da Maria" num handoff. |
| 7 | Flexibilidade | **1** | Gráfico de cicatrização — dado de maior valor — a dois cliques e abaixo da dobra. |
| 8 | Hierarquia do dado clínico | **1** | DET 12/15, dor 9/10 e complicação ativa com o mesmo peso tipográfico de "área 4mm²". |
| 10 | Integridade do registro | **0** | `complicationCodes` gravado e nunca lido de volta em lugar nenhum. |

### Prontuário — Problemas prioritários

**[P0-R1] Falha de carga e prontuário vazio são visualmente idênticos — o achado mais grave da auditoria inteira.** `error` das 3 queries clínicas é descartado; `?? []` converte falha em array vazio; as seções afirmam categoricamente "Nenhuma condição clínica cadastrada." Um timeout pode fazer uma paciente com colostomia ativa aparecer sem nenhuma condição. O mesmo vale para o banner de alergia: enquanto a anamnese carrega, **não há banner** — ausência de alerta lida como ausência de alergia. **Correção:** `useApiQuery` expõe `status: loading|error|ready`; seção só renderiza vazio com `ready` confirmado; `AllergyBanner` ganha terceiro estado "Alergias não informadas — anamnese incompleta", distinto de "sem alergia". **/harden**

**[P0-R2] Troca de aba apaga evolução SOAP e anamnese digitadas, sem aviso.** Perder uma nota SOAP escrita pós-atendimento significa reescrevê-la de memória — ou não escrevê-la. **Correção:** elevar rascunho ao componente de página ou `sessionStorage`; guard de troca de aba com `AlertDialog`; ponto no rótulo da aba com rascunho pendente; autosave a cada 10s. **/harden**

**[P0-R3] Complicações canônicas de estomia gravadas e nunca exibidas.** 8 complicações canônicas (dermatite, prolapso, hérnia...) são marcadas, gravadas, e a tabela mostra `—` — porque a linha renderiza texto livre e nunca `complicationCodes`. A enfermeira acredita ter documentado um prolapso; o registro está vazio; o relatório ao parceiro omite a complicação. **Correção:** `COMPLICATION_LABELS` central, renderizar códigos como `Badge destructive`; corrigir também no relatório; teste que trava a regressão. **/clarify**

**[P0-R4] Três ações clínicas irreversíveis a um clique, sem confirmação e sem volta.** "Marcar resolvida" trava avaliação e upload de fotos **permanentemente** — não existe ação de reabrir em lugar nenhum. Mesmo padrão em "Resolver plano". Excluir foto: `Button` de 10px sem confirmação, exclui evidência clínica direto. **Correção:** `AlertDialog` nomeando a consequência específica; adicionar ação de reabrir; exclusão de foto vira soft-delete com auditoria. **/harden**

**[P0-R5] Fotos enviadas pelo paciente chegam sem origem, sem observação, sem status de triagem.** O sistema tem fila de triagem inteira (`origin`, `patientNote`, `triageStatus`) e a galeria do prontuário mostra só imagem+data — foto de vazamento com nota "está ardendo desde ontem" é indistinguível de foto de rotina, e pode ser excluída com um clique, apagando item da fila. **/clarify**

**[P1-R6] Contadores de aba não distinguem ativo de resolvido.** **/bolder**

**[P1-R7] SOAP em parágrafo corrido de letras isoladas; campo vazio some sem rastro** — nota com só o P preenchido é indistinguível de nota completa. **/typeset**

**[P1-R8] Tira cronológica corre ao contrário da comparação logo acima** — mesmo componente, tempo correndo em direções opostas em duas seções. **/layout**

**[P1-R9] `HealingChart` sobrepõe três escalas incompatíveis, duas séries só por cor** — área com auto-escala esconde diferença entre reduzir 5% e reduzir 99%; sem eixo Y; tendência calculada só para área, nunca para DET/PUSH. **/colorize**

**[P1-R10] Abas à mão sem semântica ARIA, teclado ou deep link.** **/adapt**

**[P1-R11] A aba padrão é formulário de edição, não resumo do paciente** — placeholders cinzas lidos de relance como conteúdo real; sem `updatedAt` visível; clique acidental + Salvar sobrescreve tudo. **/distill**

**[P1-R12] O seletor de profissional permite assinar evolução em nome de outra pessoa** — backend só atribui autoria automática se o campo vem vazio; selecionar outro profissional assina em nome dele. Falta ética e problema legal (COFEN), não questão de UX. **/clarify**

**[P2-R13] Nenhuma hierarquia visual para dado clínico anormal** — dor 9/10 com o mesmo peso de qualquer célula. **/bolder**

**[P2-R14] Tabela de 9 colunas e formulários em grade fixa quebram no mobile** — registrar avaliação DET no leito é fisicamente impossível hoje. **/adapt**

**[P2-R15] Salvamento silencioso em 5 das 6 operações de escrita.** **/delight**

**[P3-R16] Lista de evoluções sem limite, filtro ou agrupamento — 2 anos de histórico num scroll único.** **/optimize**

**[P3-R17] Aba "Pacotes" (financeiro) misturada com as 4 abas clínicas.** **/quieter**

### Gaps do `@still-void/ui`

`Alert` sem variantes de severidade (causa raiz do banner de alergia workaround) · `Toast` ausente (causa raiz de todo o P2-R15) · sem `MediaGrid`/`MediaLightbox`/`MediaCompare` (galeria de fotos clínicas é `<img>` cru) · sem `Timeline` (evoluções/condições/planos são `<ul>` sem eixo) · sem `StatusIndicator` com ícone+texto obrigatórios (score NOC atingido/não-atingido só por cor de fundo) · sem `Combobox` assíncrono (busca de taxonomia NANDA-I/NOC/NIC sem ARIA nem teclado) · `Table`/`Sidebar` sem estratégia responsiva (raiz do P2-R14).

### Plano de ação — Feature B: Prontuário (prioridade máxima)

**Specify** — R1: nenhuma seção pode afirmar ausência de dado sem confirmar carga bem-sucedida. R2: nenhum texto clínico perdido por navegação. R3: todo dado gravado é legível de volta, em pt-BR. R4: toda transição irreversível exige confirmação nomeando a consequência e tem caminho de reversão. R5: todo valor anormal sinalizado por texto+forma+cor. R6: navegação acessível e endereçável por URL. R7: usável em 390px.

**Design** — Resolver shell responsivo primeiro (pré-requisito de R7). `useApiQuery` com máquina de 3 estados elimina R1 na origem, em todas as páginas do sistema. `Tabs` da Radix com `?aba=` na URL; aba padrão vira **Resumo** somente-leitura, Anamnese vira edição explícita. `useDraft(key, initial)` com `sessionStorage` para rascunhos. Vocabulário clínico centralizado em `format.ts`. Módulo `clinical-severity.ts` puro para faixas de gravidade. `useConfirm()` sobre `AlertDialog` com texto de consequência obrigatório na assinatura da função.

**Tasks (15):** T1 shell responsivo · T2 `useApiQuery` 3 estados, erradicar `?? []` · T3 skeletons por seção + `AllergyBanner` 3 estados · T4 `useDraft` + guard de troca de aba · T5 `COMPLICATION_LABELS`/`TISSUE_TYPE_LABELS` centrais · T6 fotos com origem/nota/triagem/ordem cronológica única · T7 `useConfirm` nas 3 destrutivas + reabrir condição/plano · T8 `clinical-severity.ts` + contadores só de ativos · T9 migrar para `Tabs` + `?aba=` · T10 aba Resumo somente-leitura · T11 SOAP em blocos rotulados com autoria em destaque · T12 autoria travada na sessão · T13 `HealingChart` com escalas separadas e marcadores por forma · T14 formulários/tabelas responsivos · T15 confirmação de sucesso padronizada nas 6 escritas.

### Plano de ação — Feature A: Lista de pacientes

**Tasks (4):** T16 `usePagedQuery` distingue troca de query de refresh · T17 confirmação em "Desativar" + dropdown de ações · T18 cards no mobile + `TableScroller` · T19 estados vazios distintos + contagem.

### Riscos de persona

**Jordan (enfermeira nova):** abre o prontuário e recebe 5 textareas vazias em vez de resumo; placeholders cinzas indistinguíveis de conteúdo real; se a API de condições falhar, lê "Nenhuma condição clínica cadastrada" para paciente com colostomia — a afirmação mais perigosa que este código pode produzir; complicação registrada pela colega é invisível; perde a evolução SOAP trocando de aba; sem deep link, não consegue mandar "veja a evolução da Maria" no handoff de turno.

**Sam (acessibilidade):** score NOC atingido/não-atingido só por cor de fundo (WCAG 1.4.1); duas de três séries do gráfico de cicatrização são a mesma linha para deuteranopia; abas sem ARIA nenhuma; combobox de taxonomia sem navegação por setas — fluxo de prescrição hostil ao teclado; `opacity-50` derruba contraste do nome do paciente; alvos de ~16px em 12 pontos do sistema, o pior sendo "excluir foto" em `text-[10px]` sem confirmação; seis operações de escrita sem `role="status"` — risco real de duplicar registro imutável.

---

<a id="catalogo"></a>

## 4. Procedimentos e Materiais — `/procedimentos`, `/materiais`

### Procedimentos — O que funciona bem

- Tabela é a forma certa: 5 colunas, densidade baixa, sem decoração.
- Parágrafo de contexto explica *por que* a página existe no fluxo — UX copy de verdade.
- Inativo tem dois canais (`opacity-50` + pílula "Inativo" com texto).
- `EmptyState` com consequência declarada: "o agendamento continua com texto livre até o catálogo existir".
- Modal correto por baixo — a peça mais bem resolvida do conjunto.

### Procedimentos — Heurísticas com problema

H3 Controle/liberdade **1** (toggle sem confirmação) · H7 Flexibilidade **1** (zero atalho de lote; `KitForm` não é `<form>`, Enter não salva) · H1 Status **2** (nenhuma confirmação pós-ação) · H2 Mundo real **2** ("Kit" opaco até abrir o modal) · H4 Consistência **2** (mesma ação, cor diferente entre telas irmãs) · H6 Reconhecimento **2** (sem busca/filtro/ordenação).

### Procedimentos — Problemas prioritários

**[P0] Layout não responsivo — inutilizável no mobile.** Preço, duração, situação e as 3 ações ficam fora da tela em 390px, sem qualquer affordance de scroll. **/adapt**

**[P1] Alvos de ~18px — falha WCAG 2.5.8** em ações vizinhas com efeitos opostos. **/harden**

**[P1] Desativar destrutivo, silencioso e irreversível na percepção do usuário** — remove fonte de preço do agendamento sem confirmação. **/harden**

**[P1] "Kit" opaco para a função mais valiosa da página** — o mecanismo que liga procedimento→baixa de estoque→margem. Tabela não mostra se tem kit nem quantos itens. **/clarify**

**[P2] Cadastro em lote hostil** — modal fecha a cada save, sem "salvar e criar outro", sem duplicar, `autoFocus` ausente. **/optimize**

**[P2] `KitForm` permite duplicar insumo e não valida quantidade** — `|| 1` coage silenciosamente valor inválido; kit duplicado dobra baixa de estoque e custo. **/harden**

**[P2] Sem busca, filtro ou contagem.** **/layout**

**[P3] Preço sem prefixo R$, sem máscara pt-BR** (vírgula decimal não aceita por `input type=number`). **/polish**

### Materiais — O que funciona bem

- Alerta de estoque baixo não depende de cor — borda+fundo+ícone+frase completa com número.
- Redundância deliberada de sinal na linha: `0 unidade` + pílula + "Mínimo: 10".
- `ExpiryBanner` separa vencido de a vencer, com nome do lote e data.
- Coluna "Previsão" (dias até ruptura) é a melhor ideia da tela — informação preditiva.
- `MovementForm` progressivo, com explicação do benefício de vincular à consulta.

### Materiais — Heurísticas com problema

H5 Prevenção **1** (`minQty` default `0` ⇒ todo insumo novo nasce "estoque baixo") · H7 Flexibilidade **1** (banner não é acionável — não diz qual insumo, não linka, não repõe) · H3 Controle **1** (movimentação irreversível pela UI) · H1 Status **2** (erro de `/insights` descartado — "Previsão: —" mente sobre a causa) · H4 Consistência **2** (`StatusBadge status="pending"` — vocabulário de agendamento emprestado pra estoque) · H9 Diagnóstico **2** (ZodError vaza em inglês).

### Materiais — Problemas prioritários

**[P0] Mesmo bloqueio mobile, agravado por 7 colunas.** **/adapt**

**[P0] Zero e "baixo" recebem a mesma severidade — 0/10 é o mesmo âmbar que 9/10.** Insumo de estomaterapia zerado significa atendimento cancelado; a UI diz que é o mesmo evento de "está acabando". **/colorize**

**[P0] Todo insumo novo nasce marcado "estoque baixo" — o alerta grita antes de haver problema.** `minQty` default `0` + `stockQty: 0` no create ⇒ `0 <= 0` é `true`. Alarme falso de 100% no dia 1 destrói o componente mais bem construído da página. **/harden**

**[P1] Alerta não é acionável** — não nomeia o insumo, não linka, não repõe. **/optimize**

**[P1] 583 linhas = três modais concorrentes sobre a mesma entidade** — histórico e movimentação não conversam entre si. **Correção:** um painel com `Tabs` (Dados·Movimentar·Histórico). **/distill**

**[P1] Saída maior que o saldo só falha depois do envio, com saldo possivelmente velho** (sem refetch ao abrir, sem `max`). **/harden**

**[P2] "0 unidade" sem pluralização; `unit` texto livre aceita "un"/"und"/"Unidade" no mesmo catálogo.** **/clarify**

**[P2] "Previsão: —" confunde falha de API com ausência de consumo.** **/clarify**

**[P2] Histórico não escala, sem filtro/paginação, cor semântica errada (saída = âmbar de alerta).** **/layout**

**[P2] Movimentação sem confirmação nem desfazer.** **/harden**

**[P3] Erro Zod em inglês; insumo inativo com saldo é estoque fantasma sem aviso.** **/clarify** · **/harden**

### Gaps do `@still-void/ui`

`Sidebar` sem modo responsivo (raiz dos 2 P0 mobile) · `Icon` quebra em texto inline (visível nos 2 banners) · `Alert` sem variantes semânticas — os 2 banners mais importantes do app abandonam o componente inteiramente e reimplementam do zero · `Table` sem estratégia mobile · `Input` sem prefixo/sufixo (preço, unidade) · `EmptyState` ausente (procedimentos sem CTA no vazio).

### Plano de ação

**Procedimentos — Tasks (9):** T1 layout responsivo (compartilhado com Materiais) · T2 gramática única de ações + alvo ≥24px · T3 `AlertDialog` em Desativar/Reativar · T4 coluna Kit informativa · T5 modo lote (autoFocus, salvar-e-criar-outro, duplicar) · T6 busca+filtro+contador · T7 `KitForm` sem duplicata, `<form>` real · T8 card-stack mobile · T9 `EmptyState` com CTA.

**Materiais — Tasks (13):** T1 (compartilhada) · T2 `stockStatus: ok|low|out` no domínio, exclui alarme falso do dia 1 · T3 banner reescrito com nomes+ação · T4 severidade visual na linha · T5 botão "Repor" · T6 painel único com `Tabs`, extrai `MovementForm`/`MovementHistory` (583→~250 linhas) · T7 guardas do form (`max`, saldo ao vivo, refetch) · T8 coluna "Saldo" unificada + `unit` fechado · T9 surfacing do erro de insights · T10 histórico em `Table` com `Pagination` e estorno · T11 card-stack mobile · T12 mensagens Zod em pt-BR · T13 registrar 6 gaps.

### Riscos de persona

**Alex (cadastro em lote):** nome duplicado aceito sem checagem — dois "Placa coletora" com saldo partido; foco vai pro botão de fechar a cada modal (20× o ciclo); `minQty=0` gera alarme total ao fim do lote; preço com vírgula não digitável; `KitForm` sem `<form>` mata o Enter.

**Riley (stress-test de estoque):** 0/10 e 9/10 mesma severidade; insumo virgem nasce "crítico"; saldo do modal congela entre abas (sem lock otimista); saída sem `max` só falha no submit, depois de todo o preenchimento; movimentação errada só se corrige com movimento inverso inventado, sujando o histórico permanentemente; `unit` livre quebra a soma do relatório; lote vencido não tem ação de descarte — o alerta mais grave da tela é o menos acionável.

---

<a id="financeiro"></a>

## 5. Faturamento e Relatórios — `/faturamento`, `/relatorios`

### Faturamento — O que funciona bem

- `formatCurrency` via `Intl.NumberFormat` correto; dinheiro em centavos no domínio.
- `StatusBadge` via token semântico fixo — decisão documentada e correta.
- Hierarquia legível: título→ações→KPIs→filtro→tabela.

### Faturamento — Heurísticas com problema

H1 Status **1** (KPIs somam só a página carregada, mudam com o filtro) · H5 Prevenção **0** (cancelamento sem confirmação; duplo clique = duas baixas) · H2 Mundo real **2** ("(lista atual)" é jargão de implementação) · H6 Reconhecimento **2** (`dueDate` coletado e nunca exibido — não existe "vencida" no app) · H10 Ajuda **1** (empty state não distingue "nunca emitiu" de "filtro sem resultado").

### Faturamento — Problemas prioritários

**[P0] KPIs financeiros calculados no cliente sobre a página carregada.** Com 101 faturas o número está errado até "Carregar mais"; com filtro "Pendentes" ativo, "Total recebido" mostra R$ 0,00. É o único número grande da tela e o menos confiável. **Correção:** o backend já tem `InvoiceRepository.summarize` — expor `GET /api/invoices/summary?from&to`, desacoplar KPIs do filtro de status. **/clarify**

**[P0] Cancelamento de fatura sem confirmação** — dois links de ~16px, adjacentes, ações opostas e irreversíveis. **/harden**

**[P1] Coluna Valor não alinhada à direita, nenhum número tabular** — e ironicamente `/relatorios` acerta isso, então o app se contradiz. **/typeset**

**[P1] Estado vazio é frase solta na tela de primeira execução da função mais importante do sistema.** **/onboard**

**[P1] Filtros são `Button` sem `aria-pressed`, sem `role="group"`.** **/audit**

**[P1] Não há filtro de período, embora a API já suporte** — causa raiz do P0 dos KPIs. **/layout**

**[P2] Tabela sem `TableCaption`, sem cabeçalho fixo.** **/audit**

**[P2] "Ações" some sem explicação em faturas pagas/canceladas.** **/polish**

**[P0 herdado do shell]** Mobile inutilizável — título cortado, botão fora da tela. **/adapt**

### Relatórios — O que funciona bem

- Cálculo genuinamente gerencial: margem por procedimento descontando insumo rastreado, `unattributedSupplyCostCents` separado honestamente em vez de escondido.
- Produção por profissional ordenada por receita desc.
- Todas as colunas numéricas já alinhadas à direita — melhor que `/faturamento`.
- Cache de meses fechados no backend.

### Relatórios — Heurísticas com problema

H1 Status **1** (erro deixa a tela num skeleton infinito — `aria-live` em loop) · H2 Mundo real **2** ("0.0%" com ponto decimal numa UI pt-BR; seletor de mês em inglês, "August 2026") · H6 Reconhecimento **2** (zero comparação com período anterior — nenhum número responde "melhorou ou piorou?") · H8 Estética **2** (subdesenhado: `ChartBar`/`ChartGrid` exportados e nunca usados no app) · H10 Ajuda **1** (duas convenções opostas de vazio na mesma tela).

### Relatórios — Problemas prioritários

**[P0] Erro na API deixa a tela num skeleton infinito** — `report` fica `null` para sempre, "Carregando…" anunciado em loop pelo leitor de tela. **/harden**

**[P1] Zero gráficos numa página chamada "Relatório gerencial"** — cinco números empilhados obrigam a fazer proporção de cabeça; `ChartBar`/`ChartGrid` existem no pacote e `healing-chart.tsx` já provou no próprio repo que funcionam. **/bolder**

**[P1] Nenhum número tem termo de comparação** — "Recebido: R$ 12.400" é informação; com delta vira decisão. Threshold de no-show é `0.15` mágico só manifestado como cor. **/clarify**

**[P1] Porcentagem não localizada; seletor de mês em inglês.** **/typeset**

**[P1] Duas convenções opostas de vazio na mesma tela** (card some vs. card com zeros vs. `EmptyState`). **/distill**

**[P2] Tabelas sem linha de total, sem nome acessível.** **/audit**

**[P2] Nenhum caminho de saída — sem drill-down, sem exportação.** **/optimize**

**[P3] `MetricCard` duplicado entre as duas páginas, já divergindo.** **/distill**

### Gaps do `@still-void/ui`

`table-numeric-cell` (sem `numeric` prop, `tabular-nums` ausente da lib inteira) · `table-sticky-header` · `toggle-filter-group` (filtros de status reimplementados sem `role="group"`) · `chart-scale-and-labels` (helper de escala e legenda ausentes — explica por que `/relatorios` não tem gráfico nenhum) · `empty-state` · `month-period-picker` (não existe seletor de período; `input type=month` segue locale do navegador).

### Plano de ação

**Faturamento — Tasks (8):** T1 `GET /api/invoices/summary` · T2 KPIs consumindo o summary, rótulo com período · T3 seletor de período compartilhado · T4 coluna "Vencimento" + `isOverdue` · T5 `AlertDialog` no cancelamento + disabled durante request · T6 alinhamento numérico + `tabular-nums` + `TableFooter` · T7 `role="group"`+`aria-pressed` nos filtros + 2 variantes de vazio · T8 alvo ≥44px, "Cancelar" em `DropdownMenu`.

**Relatórios — Tasks (10):** T1 estados de erro/loading separados, preservar dados anteriores na troca de mês · T2 `formatPercent` com Intl · T3 rótulo de mês pt-BR + navegação ‹› · T4 `MetricCard` compartilhado com Faturamento como `<dl>` · T5 delta vs. mês anterior + constante nomeada do threshold · T6 helper de escala local (candidato a PR na lib) · T7 `ChartBar` horizontal + barra empilhada por procedimento · T8 `TableFooter`+`TableCaption` · T9 convenção única de vazio · T10 drill-down pra Faturamento + exportar CSV + `@media print`.

### Riscos de persona

**Alex (dona da clínica, revisão rápida):** KPI mais destacado é o menos confiável (muda com filtro); nenhuma tela mostra o que está vencido apesar do dado existir; "Recebido: R$ 12.400" sem comparação não responde a única pergunta que ela tem em 30s; "0.0%" e "August 2026" corroem a confiança em toda a página; no celular, entre atendimentos, vê 170px de conteúdo com botão fora da tela; números não vão a lugar nenhum — sem exportar, o caminho até o contador é print de tela.

**Sam (leitor de tela, tabelas densas):** erro de `/relatorios` deixa `aria-busy`/`aria-live` presos num "Carregando…" que nunca resolve; N botões chamados só "Cancelar" sem contexto de linha, numa ação irreversível sem confirmação; tabelas sem nome acessível; filtros sem `aria-pressed`; `MetricCard` são pares de `<p>` soltos, sem relação programática rótulo↔valor.

---

<a id="diretorios"></a>

## 6. Profissionais e Parceiros — `/profissionais`, `/parceiros`

### Profissionais — O que funciona bem

- Zero cor hardcoded, `StatusBadge` semântico, `LoadingIndicator` acessível.
- Fluxo de criação curto e honesto (2 campos).
- Estado vazio com consequência explicada: "Consultas e evoluções podem ser atribuídas após o cadastro."

### Profissionais — Heurísticas com problema

H1 Status **1** · H3 Controle **1** (desativar sem confirmação nem desfazer) · H5 Prevenção **1** (nomes duplicados aceitos; nada valida COREN) · H7 Flexibilidade **1** (sem busca/filtro/paginação — enquanto `/pacientes` tem tudo isso) · H9 Recuperação **2** (erro cru da API, longe do campo) · H10 Ajuda **1** (nada distingue "Profissional" de "Parceiro" — vizinhos no menu).

### Profissionais — Problemas prioritários

**[P0] O campo Comissão não existe na interface — e a coluna "Repasse" do relatório é morta por causa disso.** `commissionPct` existe no DTO, no domínio, no PATCH — mas o formulário só tem Nome e Registro, e **o POST nem aceita o campo**. Uma clínica que paga comissão por produção não consegue configurá-la. **/clarify**

**[P0] Mobile inutilizável — sidebar fixa em viewport de 390px.** **/adapt**

**[P1] `opacity-50` na linha inativa reprova contraste** e duplica sinal que o badge já dá. **/harden**

**[P1] "Desativar" não parece clicável; alvo a 8px de "Editar".** **/layout**

**[P1] Desativar irreversível-na-percepção, sem confirmação.** **/harden**

**[P2] Form sem rótulo acessível associado, sem Cancelar, hint de COREN só no placeholder** (some ao digitar). **/clarify**

**[P2] Nenhuma confirmação de sucesso após salvar.** **/delight**

**[P3] Botão usa `+` tipográfico; `Table` reimplementa espaçamento que `.sv-table` já define, com valor diferente do token.** **/distill**

### Parceiros — O que funciona bem

- A frase de contexto (por que o email importa pro login do portal) é a melhor decisão de UX das duas páginas.
- Coluna Contato bem densificada, hierarquia correta.

### Parceiros — Heurísticas com problema

H2 Mundo real **2** (3 nomes pra mesma entidade: "Parceiros" no menu, "Médicos parceiros" no H1, "parceiro" no vazio) · H3 Controle **1** · H5 Prevenção **0** (email sem `.email()` no servidor — é a credencial de login do portal) · H7 Flexibilidade **1** · H8 Estética **2** (empty state sem CTA).

### Parceiros — Problemas prioritários

**[P0] Email não validado no servidor, sendo a credencial de login do portal do parceiro.** `z.string().min(1).max(200)` sem `.email()`. Um typo produz um parceiro que nunca consegue entrar, e ninguém descobre até ele reclamar por telefone. **/harden**

**[P0] Mesmo colapso mobile, agravado por `grid-cols-2` sem breakpoint** — Telefone e CRM em ~120px cada dentro do modal. **/adapt**

**[P1] Estado vazio sem saída — e é o estado real hoje**, na tela mais vista da feature. **/onboard**

**[P1] Desativar um parceiro altera silenciosamente o cadastro de pacientes** (remove do select "Indicado por" sem aviso; paciente com `referredByPartnerId` apontando pra ele pode perder a indicação na próxima edição). **/clarify**

**[P2] Três nomes para a mesma entidade.** **/clarify**

**[P2] Email e telefone não são acionáveis** (texto morto, sem `mailto:`/`tel:`). **/polish**

**[P3] Composição de erro divergente entre as duas páginas irmãs (`??` vs `||`, com cast escondendo `string | null`).** **/distill**

### Consistência entre as duas páginas (heurística 4)

O esqueleto é o mesmo — bom sinal. Mas cada divergência é assinatura de padrão copiado, não extraído: 3 ritmos verticais de header diferentes (incluindo Procedimentos); um usa `PATCH`, outro `PUT`; padding de célula hardcoded diverge do token (`px-4 py-3` sobrescrevendo `.sv-table__td` de 12px); `StatusBadge` mapeia o booleano `active` em vocabulário de status de *consulta* (`"confirmed"`/`"cancelled"`) porque não existe chave certa — e "Ativo" acaba na mesma cor do botão primário e do item de nav ativo, confundindo estado com marca. **Conclusão:** o app tem um padrão "diretório CRUD" repetido 4× (profissionais, parceiros, procedimentos, materiais) e nunca extraído — `PagedList`/`LoadMoreButton` provam que a abstração é possível.

### Gaps do `@still-void/ui`

`Sidebar` sem contrato responsivo · sem `Label`/`Field` (7 repetições em 2 arquivos, dezenas no app) · `TableHead` sem contrato de ordenação · `Button` sem estado de loading · sem `DescriptionList`/`Table stackAt` para mobile · `Badge`/`CategoryPill` sem mapa de estado semântico `active`/`inactive`.

> Correção factual encontrada: `docs/still-void-gaps.md` afirma que a 3.2.0 "continua sem exportar `Progress` genérico" — a *export line* real de `dist/react/index.d.ts:803` exporta `Progress`/`ProgressProps`. Entrada desatualizada, corrigir para não induzir workaround desnecessário.

### Plano de ação

**Profissionais — Tasks (8):** T1 `commissionPct` no POST+form+coluna · T2 sidebar off-canvas · T3 fallback card-list mobile · T4 `AlertDialog` em Desativar · T5 remover `opacity-50` + filtro Ativos/Inativos · T6 `Field` local com hint persistente · T7 `Alert role=status` pós-save · T8 limpar padding hardcoded.

**Parceiros — Tasks (8):** T1 `.email()` + unicidade + 409 traduzido · T2 erro por campo · T3 `grid-cols-1 sm:grid-cols-2` · T4 `EmptyState` rico com CTA · T5 `DirectoryPage` compartilhado (busca+filtro+paginação) · T6 coluna "Indicações" + `ConfirmAction` mostrando impacto · T7 nomenclatura única · T8 `mailto:`/`tel:` + alinhar ritmo de header.

### Riscos de persona

**Alex (cadastro em lote):** 8 profissionais cadastrados sem comissão — descobre só no fechamento do mês, com 8 registros pra reabrir; duplicatas silenciosas sem busca nem checagem; Tab+Enter no fim do form mata tudo sem confirmação; zero confirmação de gravação o faz conferir a tabela a cada registro, anulando o ganho de velocidade; clique errado a 8px desativa alguém sem desfazer.

**Jordan (recepcionista, primeiro parceiro):** escolhe a página errada (Profissionais vs Parceiros não se distinguem no menu); "Médicos parceiros" não bate com uma agência de home care; erra o email e o parceiro nunca entra no portal — a falha aparece semanas depois, do outro lado, causa invisível; tela vazia não ensina nem convida; no celular do balcão não consegue conferir um telefone; se clicar "Desativar" achando "Editar", o parceiro some do select de indicação sem nenhum aviso do que quebrou.

---

<a id="admin"></a>

## 7. Auditoria e Configurações — `/auditoria`, `/configuracoes`

### Auditoria — O que funciona bem

- Escopo declarado na cara do usuário: "Trilha imutável... LGPD art. 11. Somente metadados — nunca conteúdo de prontuário."
- Ordem de colunas correta (Quando→Ator→Ação→Recurso→Paciente→Detalhe); filtro por paciente é o eixo certo.
- `recordAudit` write-behind com escape hatch write-ahead documentado para exportação LGPD/exclusão de foto — engenharia madura.

### Auditoria — Heurísticas com problema

H7 Flexibilidade **0** (sem filtro de período embora a API suporte; sem exportação — ironicamente a exportação LGPD *é* auditada, mas a auditoria não se exporta) · H1 Status **1** (trocar filtro mantém linhas do paciente anterior) · H2 Mundo real **1** (ações/recursos vazam inglês/snake_case) · H6 Reconhecimento **2** (`resourceId` nunca exibido nem linkado) · H10 Ajuda **2** (nada explica que hoje toda a trilha é assinada `admin/local`).

### Auditoria — Problemas prioritários

**[P0-1] A trilha não identifica pessoas — e a tela não avisa.** Enquanto não existem contas individuais (screenshot confirma: zero contas), cada linha diz `admin/local`. A página se apresenta como instrumento LGPD art. 11 e não satisfaz responsabilização — pior que não ter trilha, porque cria falsa confiança de compliance. **Correção:** `Alert` condicional apontando pra `/configuracoes`. **/clarify**

**[P0-2] Ações e recursos vazam inglês e snake_case na tela.** `ACTION_LABELS` cobre 4 de 10 ações emitidas; `RESOURCE_LABELS` cobre 12 de ~20 tipos. Saída real: "pay | care_plan_intervention". Trilha lida por gestor/advogado/fiscal, não por dev. **/clarify**

**[P0-3] Buracos de cobertura: criar paciente, logar e mudar a grade não geram evento.** `recordAudit` ausente em `patients`, `professionals`, `appointments`, `accounts`, `settings/schedule` e **todo `auth/*`** — não existe log de acesso. **/harden**

**[P1-4] Sem filtro de período**, embora a API já suporte `from`/`to`. **/layout**

**[P1-5] Troca de filtro mostra dados do paciente anterior** — exposição de metadados vinculados ao paciente errado. **/harden**

**[P1-6] Tabela de 6 colunas inutilizável no mobile.** **/adapt**

**[P2-7] Timestamps sem segundos, sem fuso, sem `<time>`** — destrói ordenação de eventos correlacionados no mesmo minuto. **/typeset**

**[P2-8] Tabela densa sem caption, sem cabeçalho fixo, sem `resourceId`.** **/distill**

**[P2-9] Select sem rótulo acessível; empty state genérico.** **/clarify**

### Configurações — O que funciona bem

- Copy que explica a consequência, não o campo: "Cada pessoa com sua senha: auditoria identifica quem acessou o prontuário."
- `isDefault` distingue honestamente "nunca configurado" de "configurado igual ao padrão".
- Pílulas de dia com `aria-pressed` real.
- Desativar em vez de excluir conta — preserva integridade da trilha.

### Configurações — Heurísticas com problema

H5 Prevenção **0** (zero validação no cliente; limpar campo numérico manda `0`) · H1 Status **1** (banner de sucesso e "nada salvo ainda" aparecem contradizendo um ao outro) · H3 Controle **1** (sem descartar alterações, sem confirmação pra desativar conta) · H2 Mundo real **2** ("Intervalo (min)" ambíguo) · H4 Consistência **2** (semana começa domingo) · H7 Flexibilidade **1** (uma janela única pra semana inteira).

### Configurações — Problemas prioritários

**[P0-10] Dados da clínica pros documentos não existem nesta página — só em variável de ambiente.** Nome, CNPJ, endereço, profissional responsável, registro — tudo em `process.env`, sem UI em lugar nenhum. Sem `CLINIC_CNPJ`/`CLINIC_PROFESSIONAL_REGISTRY`, os 4 documentos clínicos saem **silenciosamente** sem identificação legal. Falha silenciosa no artefato de maior consequência jurídica do sistema. **/onboard**

**[P0-11] Salvar a grade produz duas mensagens que se contradizem** — "(usando padrão — nada salvo ainda)" ao lado de "✅ Grade salva". `refresh()` nunca é chamado após o PUT. **/harden**

**[P0-12] "Muda aqui, quebra lá" — a relação com a agenda é declarada, nunca demonstrada.** `describeSchedule()` já existe no domínio e está ociosa; nenhum aviso sobre consultas já marcadas fora da nova janela; nenhum link para `/agenda`. **/clarify**

**[P1-13] Zero prevenção de erro nos três campos numéricos** — `validateScheduleConfig` existe no domínio, não é espelhada no cliente. **/harden**

**[P1-14] Configurações e contas de acesso não geram evento de auditoria** — a única página que promete identificar acesso é a que mais escapa da própria auditoria. **/harden**

**[P1-15] Desativar conta sem confirmação, `opacity-50` reprova contraste.** **/harden**

**[P2-16] Semana começa domingo; horário é inteiro nu** (não representa 8h30). **/clarify**

**[P2-17] Sem `<form>`; feedback de sucesso sem `role="status"`.** **/polish**

### Gaps do `@still-void/ui`

`alert-variants` (erro e sucesso são dois componentes diferentes hoje) · `table-sticky-header` · `toggle-group` (dias da semana reimplementados, 2º call site do mesmo workaround da Agenda) · `field-wrapper` (6 repetições nesta página, dezenas no app) · `time-input` (hora de abertura/fechamento em `Input type=number` sem `min`/`max` real).

### Plano de ação

**Auditoria — Tasks (7):** T1 traduções centralizadas + teste que varre rotas · T2 `setItems(null)` no refetch · T3 `Alert` de trilha não identificada · T4 filtro de período · T5 timestamp com segundos + `resourceId` visível · T6 responsivo (compartilhado) · T7 instrumentar auth/patients/appointments/accounts/settings (backend, PR próprio).

**Configurações — Tasks (7):** T1 corrigir estado de salvamento (`refresh` + `isDirty` real) · T2 validação no cliente + `<form>` · T3 `describeSchedule` ao vivo + `AlertDialog` de impacto · T4 seção `ClinicSection` com os 6 campos + preview do cabeçalho · T5 `AlertDialog` ao desativar conta · T6 ordem Seg→Dom + `type=time` · T7 `role=status` no sucesso.

### Riscos de persona

**Sam (leitor de tela):** select de filtro sem nome; tabela de 100 linhas sem caption nem header fixo; troca de filtro sem live region — e durante a janela de refetch, linhas ainda são do paciente errado; "Carregar mais" sem anúncio de quantas chegaram; salvar grade não confirma nada por voz; conta desativada com `opacity-50` ilegível; erro de campo desconectado do campo.

**Alex (admin, primeira configuração):** vai emitir documentos sem CNPJ/registro sem saber — a falha mais cara desta auditoria; vai concluir que a grade não salvou (mensagens contraditórias); vai errar o primeiro clique nas pílulas de dia (domingo primeiro); vai confundir "intervalo" com duração da consulta; vai estreitar a janela sem saber que existem consultas marcadas fora dela; não vai criar contas individuais (o aviso é um `<p>` neutro, não pressiona); vai abrir `/auditoria`, ver "Nenhum evento" depois de cadastrar tudo, e concluir "está quebrada" — ou pior, "funciona e ninguém fez nada".

---

<a id="acesso"></a>

## 8. Login e Portal — `/login`, `/portal`

> **Achado transversal que muda a leitura das duas telas:** paciente e parceiro entram pelo `/login` — não existe magic link em lugar nenhum do código. A tela que diz "Acesso restrito à equipe da clínica" é a porta de entrada obrigatória de todo paciente.

### Login — O que funciona bem

- Fail-closed honesto na UI quando não há provedor configurado.
- Rate limit com mensagem humana; erro de OAuth sobrevive ao redirect.
- Card com assinatura visual coerente, composição enxuta (157 linhas).

### Login — Heurísticas com problema

H2 Mundo real **0** ("Acesso restrito à equipe" é factualmente falso — paciente/parceiro logam aqui; label do campo email expõe modelo de dados interno) · H10 Ajuda **1** (zero saída — sem "esqueci senha", sem telefone) · H6 Reconhecimento **2** · H1 Status **2**.

### Login — Problemas prioritários

**[P0] O subtítulo barra socialmente o paciente.** "Acesso restrito à equipe da clínica" numa tela que é a única entrada de paciente e parceiro — zera a adoção do portal inteiro. **/clarify**

**[P1] Campos sem `autoComplete`/`name`** — Alex loga várias vezes ao dia, sem autofill a saída real é papel colado no monitor. **/optimize**

**[P1] `?error=` renderizado sem allowlist** — texto arbitrário da URL dentro da marca (phishing por texto refletido, não XSS pois React escapa). **/harden**

**[P1] Dois fluxos de auth espremidos num form** — a senha master (dívida reconhecida no código) é apresentada como caminho *mais fácil*. **/distill**

**[P2] Divisor "ou" assimétrico — regressão da migração 3.2** (dois `<span>` viraram um `Separator flex-1`, perdendo a centralização). **/polish**

**[P2] Botão Google fora do sistema** — sem a regra `:focus-visible` do design system. **/polish**

**[P2] Sem skeleton enquanto provedores carregam.** **/polish**

**[P3] Sem `<main>`, sem `<title>` por rota, sem caminho de ajuda.** **/harden**

### Portal — O que funciona bem

- Consentimento não está escondido — primeiro bloco depois do Hero, com heading próprio.
- Fonte única de consentimento entre o card de aviso e o bloqueio de upload.
- Bloqueio de upload explicado, não silencioso.
- Falha de busca de horários separada de "sem vagas" — bug consertado conscientemente, documentado no código.
- Minimização de dados por papel: fotos só chegam ao próprio paciente.

### Portal — Heurísticas com problema

H2 Mundo real **0** (a legenda do gráfico diz literalmente "Sólida no accent" — nome de token de design system na tela do paciente) · H3 Controle **0** (tocar num horário agenda na hora, sem confirmar; foto vai embora no `onChange`, sem preview) · H5 Prevenção **0** (alvos de 28px disparando POST irreversível) · H10 Ajuda **0** (nenhum telefone, WhatsApp ou orientação de urgência em toda a superfície) · H1 Status **1** · H9 Recuperação **1** (mensagens cruas do servidor: "Não autenticado", "Rota exclusiva do portal").

### Portal — Problemas prioritários

**[P0] Beco sem saída quando a sessão expira.** Sem sessão válida, o portal renderiza header com "Sair" e um alerta vermelho de uma linha: "Não autenticado" — é literalmente o screenshot. Sem título, sem explicação, sem botão de entrar. **/clarify**

**[P0] O horário agenda no toque — alvo de 28px, sem confirmação, sem desfazer.** É a ação mais consequente do produto inteiro, e o app **derruba deliberadamente** abaixo do próprio padrão `sm` (36px) do design system pra caber na grade. Toque errado no ônibus marca consulta real que ninguém corrige. **/harden**

**[P0] Notas clínicas cruas exibidas ao paciente (e ao parceiro).** `describeAssessment` concatena verbatim `notes`/`complications` — texto escrito pela enfermeira pra enfermeira. Saída típica no portal: "...complicações: suspeita de recidiva, encaminhar oncologia." Dano concreto, não desconforto — e vaza pro médico parceiro (terceiro) sem a mesma filtragem que o código já aplica para fotos. **/harden**

**[P0] Consentimento LGPD ilegível, sem versão, sem revogação.** Termo jurídico em `<pre>` monoespaçado 12px numa caixa rolável de 192px; botão de aceite habilitado desde o primeiro pixel; depois do aceite, o texto desaparece pra sempre — o paciente nunca mais lê o que assinou. LGPD art. 8º exige consentimento destacado; isso é o oposto — padrão visual de letra miúda. **/clarify**

**[P0] Nenhum canal de contato nem orientação de urgência em toda a superfície.** Estomaterapia: vazamento, sangramento, prolapso acontecem à noite. O único canal é "mande foto e espere", sem prazo. **/onboard**

**[P1] Foto enviada sem preview, progresso ou desfazer** — toque errado na galeria manda a foto errada pro prontuário, irreversível. **/harden**

**[P1] Observação da foto só é enviada se digitada antes de escolher o arquivo** (ordem não garantida na UI). **/clarify**

**[P1] Janela de 14 dias invisível**, possivelmente menor que o prazo do próprio retorno anunciado. **/clarify**

**[P1] Procedimento técnico exigido antes de ver qualquer horário** — decisão clínica que o paciente não sabe tomar. **/distill**

**[P1] Escala tipográfica de admin (12px) numa tela de paciente potencialmente idoso** — bônus: inputs abaixo de 16px disparam auto-zoom no iOS. **/typeset**

**[P1] Gráfico ilegível no celular, com jargão** ("PUSH/DET", "accent") **e nome de token vazando na legenda.** **/clarify + /adapt**

**[P1] Consulta cancelada pela clínica enterrada no histórico**, abaixo da evolução clínica — paciente aparece presencialmente no dia errado. **/clarify**

**[P1] Só dá para confirmar presença — não dá para desmarcar.** **/onboard**

**[P1] Mensagens de API cruas na cara do paciente.** **/clarify**

**[P1] Sanfona do parceiro sem `aria-expanded`.** **/harden**

**[P2] Fotos de ferida/estomia renderizadas de imediato** — a foto aparece sem que o paciente peça, na sala de espera. **/harden**

**[P2] Faturas sem ação nem instrução de pagamento.** **/onboard**

**[P2] `EmptyState` genérico servindo 5 contextos diferentes; alvo de 16px no "Cancelar"; Hero do parceiro com espaços órfãos.** **/polish**

### Gaps do `@still-void/ui`

`DatePicker`/`Calendar` (mesmo gap da Agenda) · `ToggleGroup` (mesmo gap de Configurações/Agenda, aqui degradado a `h-7`) · `Toast` (o token `--sv-z-toast` já existe sem componente) · `alert-semantic-variants` (mesmo gap, terceira anatomia diferente aqui) · `FileInput` sem estado de envio/progresso/preview · `EmptyState` · `Accordion`/`Disclosure` · `Separator` com rótulo centralizado · `Field`.

### Plano de ação

**Login — Tasks (7):** T1 cabeçalho neutro + bloco "sou paciente ou parceiro" · T2 `autoComplete`/`autoFocus` · T3 códigos de erro em vez de texto livre na URL · T4 senha master atrás de disclosure · T5 `Separator` duplo com rótulo · T6 botão Google no sistema · T7 skeleton + `<main>` + metadata.

**Portal — Tasks (13):** T1 estado de sessão expirada com redirect · T2 alvo ≥44px + `AlertDialog` de confirmação com resumo · T3 DTO do portal sem `notes`/`complications` livres · T4 `Prose` 16px + versão do termo + checkbox + revogação · T5 bloco de contato/urgência fixo · T6 upload com preview/progresso/remover · T7 janela explicada + procedimento pré-selecionado · T8 passe tipográfico mínimo 14px/16px em campo · T9 gráfico traduzido e responsivo · T10 faixa de canceladas + "não vou poder ir" · T11 `PortalError` por status · T12 `aria-expanded` na sanfona · T13 fotos borradas por padrão + instrução de pagamento + `EmptyState`.

### Riscos de persona

**Alex (login diário):** sem autofill, a senha vai pro post-it do monitor; senha master é o caminho de menor fricção e Alex vai usá-la, corroendo a auditoria (a própria API já loga um warn a cada vez); sem `autoFocus`, todo login começa com um clique de mouse; sem "esqueci senha", uma segunda-feira travada espera o TI.

**Jordan (paciente leigo, primeira vez, ansioso — caso central do portal):** não entra (lê "restrito à equipe" e desiste — não existe outra porta); marca a consulta errada num toque de 28px no ônibus e não consegue desmarcar nem ligar (não há telefone na tela); lê a própria nota clínica ("suspeita de recidiva") sozinho, às 23h; assina o termo LGPD sem ler pra tirar o aviso amarelo da frente, e não consegue reler nem revogar depois; manda a foto errada da galeria sem confirmar; acredita que alguém está monitorando as fotos enviadas, mas não há prazo nem canal alternativo — numa emergência noturna de vazamento, o produto oferece "mande foto e espere"; não vê que a consulta foi cancelada (está no histórico); não consegue ler nada em 12px, com 68 anos e sem óculos — a população-alvo exata da estomaterapia; volta no dia seguinte e vê "Não autenticado" em vermelho com um "Sair" do lado, interpreta como bloqueio, e talvez não volte mais.

**Parceiro (médico indicador):** recebe texto livre de prontuário de pacientes que apenas indicou, sem o mesmo filtro de minimização que o código já aplica a fotos; sanfona sem indicação de estado, sem busca, numa lista de 40 pacientes indicados.

---

<a id="documentos"></a>

## 9. Documentos clínicos — atestado, consentimento, plano de cuidados, relatório

> **Contexto verificado no código:** `<html data-theme="light">` é hardcoded em `layout.tsx:34` — não há `ThemeToggle` em lugar nenhum do app. O cenário "dark mode destrói o PDF" não é reproduzível hoje, e `bg-white`/`text-black` literais estão corretos e documentados. Mas é uma mina: no dia em que alguém adotar o `ThemeToggle` do catálogo, `HealingChart` e todo `text-ink-3` do relatório viram lixo no papel — porque **não existe uma única regra `@media print`** em `globals.css`. Todo o "modo impressão" do sistema hoje é três utilitários (`print:hidden`, `print:max-w-none`, `print:p-0`).

### Atestado — O que funciona bem

Prosa corrida em vez de formulário; negrito nos dados variáveis cria leitura em varredura; densidade correta pra A4.

### Atestado — Problemas prioritários

**P0 — Imprime "compareceu" para consulta cancelada ou com falta.** `AppointmentDto.status` existe, `format.ts` já traduz `cancelled`/`no_show` — a página nunca lê o status, e o link fica sempre visível no detalhe da consulta. Não é bug de UI, é falsidade documental gerada pelo produto.

**P0 — A data do documento é a data em que você aperta Ctrl+P, não a data de emissão.** `new Date()` no render, em client component. Reimprimir a mesma declaração em 2027 produz documento com data de 2027 e conteúdo de 2026, indistinguível do original. Sem número, sem hash.

**P0 — Assinatura sem responsável nem registro é a configuração padrão.** `.env.example` deixa `CLINIC_PROFESSIONAL_NAME`/`CLINIC_PROFESSIONAL_REGISTRY` comentados; o documento que sai da caixa não tem COREN, CNPJ, endereço ou cidade — é um papel com o nome de uma clínica e uma linha em branco. Juridicamente nulo, e nada avisa.

**P1 — A rota se chama "atestado", o documento se chama "Declaração de Comparecimento"** — são coisas diferentes (atestado exige CID/decisão clínica/dias de afastamento).

**P1 — Paciente identificado só pelo nome**, sem CPF, nascimento ou nº de prontuário; fallback "o(a) paciente" imprime sem nome nenhum.

**P2 — Sem hora de emissão nem nota de documento eletrônico.**

### Consentimento — O que funciona bem

Redação em primeira pessoa correta para TCLE; três parágrafos cobrindo natureza/riscos/revogação/LGPD; único dos 4 com bloco de assinatura do paciente.

### Consentimento — Problemas prioritários

**P0 — Ordem do bloco de fecho errada, quebra a semântica do documento.** Assinatura do paciente → data → assinatura do profissional. Num TCLE, a data pertence ao ato de consentir e vem *antes* das duas assinaturas.

**P0 — O responsável legal assina por cima do nome do paciente.** A legenda diz "Paciente ou responsável legal" mas a linha imprime o nome da paciente — faltam campo/linha pra nome/CPF/parentesco de quem assina. Cenário comum em estomaterapia.

**P1 — Autorização de imagem fundida ao consentimento do procedimento**, sem opt-in separado — LGPD exige consentimento específico e revogável independentemente pra uso de imagem.

**P1 — Nenhuma versão do termo** — texto hardcoded no JSX, sem como saber qual versão a paciente assinou (a pergunta exata de um litígio).

**P1 — Sem data ao lado da assinatura do paciente, sem CPF, sem "duas vias".**

**P2 — Nenhum registro de emissão/assinatura/revogação no sistema.**

### Plano de Cuidados — O que funciona bem

Estrutura SAE correta e reconhecível (NANDA-I→NOC→NIC); tabela NOC Basal→Atual→Meta é a decisão de informação mais forte dos quatro documentos; o único lugar do app onde alguém pensou em impressora P&B (`text-black` explícito e comentado).

### Plano de Cuidados — Problemas prioritários

**P0 — Documento vazio, assinável, imprimível.** "Nenhum diagnóstico prescrito." + linha de assinatura — o produto entrega folha timbrada em branco pronta pra assinar. Nenhuma guarda impede a impressão.

**P1 — É a tela do app impressa, não um plano de cuidados pra quem cuida** — falta orientação prática ao cuidador (o que fazer, com que material, quando ligar); a coluna existente ("Execuções: N") é métrica interna.

**P1 — Escores NOC sem escala** (1-5, sem âncoras) fora do contexto clínico.

**P1 — Sem responsável técnico do plano** — usa a assinatura genérica da clínica, não da enfermeira que prescreveu.

**P2 — Sem controle de quebra de página**, sem numeração, sem repetição de cabeçalho — folha 2 solta é indistinguível de qualquer outro papel.

**P2 — Bordas a 30% de preto num corpo de 9pt** — em laser P&B vira cinza quase invisível.

### Relatório de Condição — O que funciona bem

Minimização de dados correta e documentada (sem anamnese, sem financeiro); cabeçalho de metadados responde "quem, o quê, desde quando" em 3 linhas; tabela cronológica clinicamente densa.

### Relatório de Condição — Problemas prioritários

**P0 — O gráfico codifica 3 séries só por cor, e a legenda descreve as cores por nome.** Em impressora P&B, duas séries viram cinzas quase idênticos; a legenda vira instrução impossível de seguir. Quebrado antes mesmo de imprimir — protanopia já colapsa as duas linhas sólidas na tela.

**P0 — O gráfico é a única parte do documento sem override neutro de impressão** — passa hoje só porque o tema está fixo em claro; o gate de impressão (`check-sv-adoption.sh`) cobre as tabelas e não cobre o gráfico.

**P1 — Não é um relatório, é um painel impresso** — sem destinatário, sem introdução, sem parecer ou conduta do profissional. Documento clínico sem narrativa é exportação de dados com carimbo.

**P1 — Imprime relatório de paciente anônimo em caso de falha** ("Paciente: —" quando a busca falha ou está em voo).

**P1 — Mesmo problema de vazio do plano** — relatório sem nenhuma avaliação, assinado.

**P2 — Tabela de 6 colunas sem contenção horizontal**; sem período de referência declarado.

### Consistência entre os 4 documentos

A moldura (`DocumentFrame`, cabeçalho, `text-sm`, par data+assinatura) é compartilhada de verdade — heurística 4 satisfeita no nível do esqueleto, e isso é raro e bom. Mas tudo dentro do `children` diverge: bloco de metadados reescrito à mão 2× já divergente; comentário `SPEC_DEVIATION` de 5 linhas copiado 3×; assinatura duplicada com anatomias diferentes; quatro redações diferentes de "vazio"; nível de formalidade divergente (atestado/consentimento são prosa jurídica, plano/relatório são tabelas com rótulo de app). **Veredito:** a moldura é compartilhada; o documento não.

### Gaps do `@still-void/ui`

Todos novos, categoria "documento imprimível" — não existe na lib porque nasceu para blog: **`print-sheet`** (sem `@page`, sem cabeçalho/rodapé repetido, sem contador de página) · **`print-neutral-tokens`** (sem modo preto-sobre-branco desacoplado do tema — o app criou um linter próprio, `check-sv-adoption.sh`, só pra proteger esse workaround) · **`signature-block`** (linha de assinatura duplicada e já divergente) · **`chart-monochrome`** (`ChartLine` só distingue série por cor) · **`description-list`** (metadados rótulo/valor em `<p><strong>` manual).

### Plano de ação (família — não 4 planos separados)

**Specify** — Que qualquer um dos 4 documentos, impresso em laser P&B por uma clínica com `.env` recém-copiado, seja identificável, datável, verificável e juridicamente assinável — ou não seja impresso. Critérios: (A1) nenhum documento imprime sem o mínimo de validade ou conteúdo; (A2) data de emissão registrada, não `new Date()` do render; (A3) legível em P&B, nada depende só de cor; (A4) multipágina numera e repete identificação; (A5) primitivos únicos, zero duplicação de classe de impressão.

**Design** — Camada CSS de impressão (`@page`, `break-inside/after`, `orphans/widows`); gramática de documento (`DocumentMeta`/`DocumentSection`/`DocumentTable`/`DocumentEmpty`/`SignatureLine`) extraída pra `src/components/document/`; guarda de validade (`assertPrintable`) bloqueando fora da moldura quando faltar dado obrigatório; emissão persistida (`POST /api/documents/issue` retornando `number`+`issuedAt`); gráfico monocromático com traço+marcador por série.

**Tasks (11):** T1 `@media print`+`@page` em `globals.css` · T2 extrair os 5 primitivos de documento, migrar os 4 · T3 `DocumentFrame` com slots `meta`/`beforeSignature`/`footerNote`, corrigir ordem do consentimento · T4 guarda de validade (bloqueia sem responsável+registro) · T5 atestado lê `status`, bloqueia cancelada/faltou, exige nome real · T6 bloquear impressão de plano/relatório vazios · T7 emissão persistida com número · T8 consentimento: versão, responsável legal, opt-in de imagem separado, 2ª via · T9 gráfico monocromático + estender o check de impressão pra cobrir o `HealingChart` · T10 conteúdo faltante (CPF/nascimento, escala NOC legendada, parecer no relatório, orientação ao cuidador) · T11 registrar os 5 gaps.

### Riscos de persona

**Riley (stress-test dos caminhos degradados):** o caminho *padrão* de instalação é o inválido — `.env.example` vem com os campos de responsável comentados, e nenhuma tela avisa; registro ausente some silenciosamente (sem espaço em branco, sem aviso); plano sem intervenção vira folha em branco assinada; consulta cancelada/faltada imprime "compareceu" só de clicar no link sempre visível; reimpressão re-data o documento sem deixar rastro de qual é o original; Ctrl+P durante o loading imprime o esqueleto (skeleton sem regra de impressão que o esconda); relatório sem paciente carregado imprime "Paciente: —".

**Sam (alto contraste, impressão em P&B):** gráfico inutilizável sem cor — a própria legenda admite a distinção só por matiz; bordas a 30% somem no toner; corpo de 9pt abaixo do confortável nas duas tabelas que mais importam clinicamente; rótulos de data no token mais fraco da escala, sobre papel branco; frases de tendência em verde/âmbar redundantes mas com contraste pior que o corpo ao redor; zero verificação de `forced-colors`.

---

## Fechamento

Esta auditoria não recomenda reescrever nada — o domínio, os testes e a disciplina de adoção do design system (`check:sv`, `sv-gap`, `AD-005`/`AD-006`/`AD-014`) são um alicerce raro de se ver num projeto deste tamanho. O trabalho que falta é inteiramente de camada de apresentação, concentrado nos cinco padrões do sumário executivo — e boa parte dele se resolve investindo primeiro na infraestrutura do design system (documento irmão), não página por página.
