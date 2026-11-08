---
title: "Índice de docs/"
status: living
audience: [dev, po, stakeholder, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
---

# docs/

> **Como ler:** [`../AGENTS.md`](../AGENTS.md) (L0) aponta para um domínio ou guia; cada um abre
> com um resumo e desce por links. Este índice lista **todo** arquivo de `docs/` — `npm run
> check:docs` garante que os links resolvem. Regras do sistema: [`governance.md`](governance.md).

## Produto e planejamento

| Arquivo | Status | Para quê |
| --- | --- | --- |
| [`product/visao-produto.md`](product/visao-produto.md) | living | visão, personas, objetivos de negócio |
| [`plano-evolucao-faseado.md`](plano-evolucao-faseado.md) | living | **roadmap** (Now/Next/Later, `RM-NN`) e detalhe por fase |
| [`product/prd-fase-1.md`](product/prd-fase-1.md) | frozen | PRD do módulo clínico |
| [`product/prd-fase-2.md`](product/prd-fase-2.md) | frozen | PRD da fase 2 |
| [`product/prd-fase-3.md`](product/prd-fase-3.md) | frozen | PRD da fase 3 |
| [`product/prd-fase-6.md`](product/prd-fase-6.md) | living | PRD da plataforma (RBAC, multiempresa, auth) |
| [`legal/textos-lgpd.md`](legal/textos-lgpd.md) | living | textos LGPD em vigor (aviso de privacidade, TCLE de tratamento, termo de imagem, consentimento do parceiro) e como trocá-los após a revisão jurídica (#216) |
| [`plano-correcao-achados-auditoria-2026-09.md`](plano-correcao-achados-auditoria-2026-09.md) | frozen | plano dos achados de auditoria #57–#77 |

## Domínios de negócio

| Domínio | Cobre |
| --- | --- |
| [`domains/acesso/`](domains/acesso/README.md) | login, papéis, empresas, auditoria |
| [`domains/pacientes-prontuario/`](domains/pacientes-prontuario/README.md) | paciente e prontuário |
| [`domains/agenda/`](domains/agenda/README.md) | consultas, grade, lista de espera, recall |
| [`domains/financeiro/`](domains/financeiro/README.md) | faturas, pacotes, comissão, repasses |
| [`domains/estoque/`](domains/estoque/README.md) | insumos e movimentações |
| [`domains/portal/`](domains/portal/README.md) | portal do paciente e do parceiro |
| [`domains/equipe-parceiros/`](domains/equipe-parceiros/README.md) | profissionais e parceiros |
| [`domains/comunicacao/`](domains/comunicacao/README.md) | lembretes e e-mails |
| [`domains/relatorios/`](domains/relatorios/README.md) | dashboard e relatório gerencial |

Specs funcionais vivas ficam em `domains/<slug>/features/` e são linkadas pelo README do domínio.

Matriz de casos de exceção por domínio ([ADR-049](adr/049-matriz-de-excecoes-por-dominio.md)): [`acesso`](domains/acesso/excecoes.md) · [`pacientes-prontuario`](domains/pacientes-prontuario/excecoes.md) · [`agenda`](domains/agenda/excecoes.md) · [`financeiro`](domains/financeiro/excecoes.md) · [`estoque`](domains/estoque/excecoes.md) · [`portal`](domains/portal/excecoes.md) · [`equipe-parceiros`](domains/equipe-parceiros/excecoes.md) · [`comunicacao`](domains/comunicacao/excecoes.md) · [`relatorios`](domains/relatorios/excecoes.md).

## Engenharia

| Arquivo | Para quê |
| --- | --- |
| [`engineering/onboarding.md`](engineering/onboarding.md) | requisitos, Docker, Node local, **variáveis de ambiente**, testes, gates |
| [`engineering/homologacao.md`](engineering/homologacao.md) | **homologação**: Vercel + Neon + MSW + faker, fluxo de git com branch `staging`, contas fictícias |
| [`engineering/gate-na-nuvem.md`](engineering/gate-na-nuvem.md) | como rodar o gate numa thread da nuvem (`scripts/gate-cloud.sh`), tempos medidos e armadilhas |
| [`engineering/homologacao-cenarios.md`](engineering/homologacao-cenarios.md) | **casos de validação** de cada domínio × conta fictícia e dado do seed que os reproduz na staging |
| [`engineering/producao.md`](engineering/producao.md) | **runbook de produção**: VPS Hetzner + compose + Traefik do Coolify, TLS, backup/restore cifrado, segredos e rotação, migrações, cron, alertas |
| [`engineering/backup-passo-a-passo.md`](engineering/backup-passo-a-passo.md) | **backup cifrado do zero**, para leigo: chave `age`, R2 na UE, scripts, alerta por e-mail, primeiro backup e teste de restauração, com as armadilhas da instalação real |
| [`engineering/migracoes-aditivas.md`](engineering/migracoes-aditivas.md) | **lint de migração aditiva** (`check:migracao`): o que é aditivo, conferências do journal e formato JSON para o classificador de risco |
| [`engineering/classe-de-risco.md`](engineering/classe-de-risco.md) | **classe de risco da PR** (`check:risco`, 0 a 3) e **veredito estruturado do the-judge** (`check:veredito`), CODEOWNERS nos portões |
| [`engineering/performance-baseline.md`](engineering/performance-baseline.md) | **baseline de carga** (#222): perfis, método, p50/p95 por rota, orçamento de latência e como reproduzir com `scripts/load/` |
| [`engineering/performance-front-linha-de-base-2026-10.md`](engineering/performance-front-linha-de-base-2026-10.md) | **linha de base do front** (Next.js): JS por rota, FCP/LCP/CLS e chamadas `/api` em 360/390/768/1280, auditoria de recursos do Next e da hidratação (retrato de 2026-10-24) |
| [`engineering/architecture.md`](engineering/architecture.md) | camadas, fluxo de requisição, decisões transversais |
| [`engineering/conventions.md`](engineering/conventions.md) | Biome, UI, escopo de dados, níveis de teste, commits |
| [`engineering/api.md`](engineering/api.md) | rotas REST centrais |
| [`engineering/troubleshooting.md`](engineering/troubleshooting.md) | sintoma → causa → ação |
| [`engineering/security-scan.md`](engineering/security-scan.md) | npm audit, gitleaks, semgrep |
| [`engineering/integrations/README.md`](engineering/integrations/README.md) | índice das integrações externas |
| [`engineering/integrations/resend.md`](engineering/integrations/resend.md) | e-mail transacional |
| [`engineering/integrations/google-calendar.md`](engineering/integrations/google-calendar.md) | sincronização de agenda |
| [`engineering/integrations/whatsapp-meta.md`](engineering/integrations/whatsapp-meta.md) | WhatsApp pela Meta (RM-14, planejado; sem código) |
| [`engineering/integrations/s3-storage.md`](engineering/integrations/s3-storage.md) | fotos em bucket S3-compatível |
| [`engineering/integrations/cron.md`](engineering/integrations/cron.md) | disparo externo dos lembretes |
| [`engineering/integrations/retencao.md`](engineering/integrations/retencao.md) | disparo externo da retenção e anonimização (#294) |
| [`engineering/integrations/alertas.md`](engineering/integrations/alertas.md) | cron de alertas por e-mail ao operador (#212) |
| [`engineering/integrations/glitchtip.md`](engineering/integrations/glitchtip.md) | error tracking self-hosted sem dado pessoal (#212) |

## Decisões

| Arquivo | Decisão |
| --- | --- |
| [`adr/001-multi-tenancy.md`](adr/001-multi-tenancy.md) | multiempresa por `clinic_id`, RLS adiada |
| [`adr/002-autorizacao-em-duas-camadas.md`](adr/002-autorizacao-em-duas-camadas.md) | proxy + handler, fail-closed |
| [`adr/003-modelo-de-papeis-multi-empresa.md`](adr/003-modelo-de-papeis-multi-empresa.md) | catálogo fechado de seis papéis (o sétimo, `guardian`, no ADR-027) |
| [`adr/004-remocao-google-oauth-autenticacao.md`](adr/004-remocao-google-oauth-autenticacao.md) | login nativo; Google só como integração |
| [`adr/005-revogacao-de-sessao-por-versao.md`](adr/005-revogacao-de-sessao-por-versao.md) | `session_version` revoga sessões (logout, senha, desativação) |
| [`adr/006-chave-de-dados-clinicos.md`](adr/006-chave-de-dados-clinicos.md) | `DATA_ENCRYPTION_KEY` versionada cifra o texto clínico |
| [`adr/007-super-admin-operador-da-plataforma.md`](adr/007-super-admin-operador-da-plataforma.md) | Super Admin único, só na família `platform`, sem dado de clínica |
| [`adr/008-segundo-fator-do-super-admin.md`](adr/008-segundo-fator-do-super-admin.md) | Super Admin entra com senha + TOTP; códigos de recuperação levam ao recadastro |
| [`adr/009-recuperacao-de-emergencia-do-super-admin.md`](adr/009-recuperacao-de-emergencia-do-super-admin.md) | Super Admin que perdeu tudo volta por `npm run admin:recover` no servidor |
| [`adr/010-trilha-de-auditoria-de-plataforma.md`](adr/010-trilha-de-auditoria-de-plataforma.md) | evento sem empresa é de plataforma (`clinic_id` nulo), visto só pelo Super Admin; auditoria escopada por empresa |
| [`adr/011-canal-de-comunicacao-por-clinica.md`](adr/011-canal-de-comunicacao-por-clinica.md) | e-mail de cada clínica sai pela chave dela (`clinic_channels`, cifrada); sem canal, não sai; chave da plataforma opcional e só para contas sem clínica |
| [`adr/012-segundo-fator-e-senha-da-equipe.md`](adr/012-segundo-fator-e-senha-da-equipe.md) | 2FA obrigatório também para o Admin de Empresa, opcional para Atendente/Profissional; senha da equipe com 10+ caracteres e fora da lista de senhas comuns |
| [`adr/013-retencao-por-anonimizacao.md`](adr/013-retencao-por-anonimizacao.md) | dado vencido é anonimizado (nunca excluído) por um job de cron; só o repositório de retenção reescreve a trilha de auditoria |
| [`adr/014-observabilidade-sem-pii.md`](adr/014-observabilidade-sem-pii.md) | logs JSON com request-id, GlitchTip self-hosted por evento montado pelo app (sem PII), health/ready e alertas por e-mail ao operador |
| [`adr/015-servidor-sem-cifra-de-disco.md`](adr/015-servidor-sem-cifra-de-disco.md) | servidor de produção sem LUKS: fotos em claro no disco da VPS, risco aceito; mitigações e como reabrir (cifrar na aplicação) |
| [`adr/016-sessoes-do-admin-sem-2fa-e-senha-unica.md`](adr/016-sessoes-do-admin-sem-2fa-e-senha-unica.md) | sessões do Admin sem 2FA derrubadas pela migração 0052 e política de senha única (10 + lista) para equipe e portal |
| [`adr/017-retencao-decisoes-complementares.md`](adr/017-retencao-decisoes-complementares.md) | completa o ADR-013: cadastro do parceiro guardado, paciente anonimizado não reativa, conta anonimizada não recebe senha nem convite |
| [`adr/018-transferencia-internacional-ue.md`](adr/018-transferencia-internacional-ue.md) | dados na UE (Alemanha), adequação Brasil ↔ UE como base do art. 33, backup cifrado em outra localização da UE; texto jurídico pendente |
| [`adr/019-gestao-de-contas-senha-propria-e-reset-de-2fa.md`](adr/019-gestao-de-contas-senha-propria-e-reset-de-2fa.md) | admin não define a senha de outra conta, "Minha conta", trava do último admin com 409 e reset de 2º fator auditado |
| [`adr/020-evento-do-google-agenda-so-com-iniciais.md`](adr/020-evento-do-google-agenda-so-com-iniciais.md) | evento do Google Agenda leva só iniciais, horário e link; conta Workspace é recomendação |
| [`adr/023-email-de-contato-do-paciente-e-login-do-portal.md`](adr/023-email-de-contato-do-paciente-e-login-do-portal.md) | e-mail de contato do paciente opcional e repetível; login do portal em conta própria |
| [`adr/021-e2e-contra-build-de-producao.md`](adr/021-e2e-contra-build-de-producao.md) | E2E principal contra `next start`; `next dev` só para contas por papel (causa raiz da #308) |
| [`adr/024-responsavel-do-paciente.md`](adr/024-responsavel-do-paciente.md) | responsável ou cuidador do paciente: entidade própria, só de contato |
| [`adr/026-textos-lgpd-previa-nao-ligada.md`](adr/026-textos-lgpd-previa-nao-ligada.md) | (substituído pelo ADR-030) prévia dos textos LGPD mantida fora do código |
| [`adr/027-responsavel-acessa-portal-em-nome-do-paciente.md`](adr/027-responsavel-acessa-portal-em-nome-do-paciente.md) | responsável do paciente acessa o portal em nome dele, com conta própria (`guardian`), aviso fixo e trilha |
| [`adr/028-paciente-encerra-acesso-do-responsavel.md`](adr/028-paciente-encerra-acesso-do-responsavel.md) | o paciente encerra sozinho, pelo portal, o acesso do responsável (marca por paciente, trilha, religar pela equipe) |
| [`adr/029-cnpj-antigo-invalido-marcado-para-correcao.md`](adr/029-cnpj-antigo-invalido-marcado-para-correcao.md) | CNPJ antigo com dígito verificador inválido é marcado para correção, sem apagar nem inventar |
| [`adr/030-textos-lgpd-ligados-sem-revisao-juridica.md`](adr/030-textos-lgpd-ligados-sem-revisao-juridica.md) | textos LGPD ligados ao sistema com revisão jurídica pendente; termo de imagem à parte, encarregado por clínica, hash do texto-base |
| [`adr/031-retencao-em-dias-inteiros-e-fonte-unica.md`](adr/031-retencao-em-dias-inteiros-e-fonte-unica.md) | retenção contada em dias inteiros (CC art. 132), prazos numa fonte só lida pelo aviso, evento de plataforma a cada execução do job |
| [`adr/032-paciente-menor-no-portal-pelo-representante-legal.md`](adr/032-paciente-menor-no-portal-pelo-representante-legal.md) | menor sem conta própria no portal; mãe, pai ou tutor acessa e assina os termos; aviso à clínica aos 18 anos |
| [`adr/033-direitos-do-menor-pelo-representante-e-prazo-do-aceite.md`](adr/033-direitos-do-menor-pelo-representante-e-prazo-do-aceite.md) | representante do menor pede cópia e correção e cuida do parceiro no portal (eliminação na clínica); aceite dele vence 90 dias depois dos 18 |
| [`adr/034-renomeacao-do-repositorio-para-estomasystech.md`](adr/034-renomeacao-do-repositorio-para-estomasystech.md) | repositório renomeado para estomasystech; troca só nome de repo e infra, mantém rótulos de chave, `ESTOMASYSTECH_*` e a marca "EstomaSysTech" |
| [`adr/035-renomeacao-completa-para-estomasystech.md`](adr/035-renomeacao-completa-para-estomasystech.md) | troca total: banco, `ESTOMASYSTECH_*`, rótulos de chave, cookie e marca (sem produção, sem compatibilidade) |
| [`adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md`](adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md) | Traefik do Coolify como único proxy de entrada; Caddy removido |
| [`adr/041-homologacao-na-vercel-e-branch-staging.md`](adr/041-homologacao-na-vercel-e-branch-staging.md) | homologação na Vercel (Neon, MSW, faker) e branch `staging` descartável |
| [`adr/042-e2e-fora-do-actions-gate-local-com-recibo.md`](adr/042-e2e-fora-do-actions-gate-local-com-recibo.md) | E2E fora do Actions; `gate:local` com recibo no PR; testes intocáveis (regra 8) impostos por hook, `pre-push` e CI |
| [`adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md`](adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md) | E2E e mutação por arquivo alterado de volta ao Actions como checks do PR (inclusive contra a `main`); fim do recibo `E2E-GATE:`; supera o ADR-042 (regra 8 segue) |
| [`adr/099-homologacao-sem-operador-pelo-actions.md`](adr/099-homologacao-sem-operador-pelo-actions.md) | Homologação pelo Actions: `staging.yml` reconstrói a release escolhida, valida (logada, 3 papéis) e grava `homologacao/vX.Y.Z` sem operador; `rebuild.sh --release=release/vX.Y.Z` |
| [`adr/100-veredito-do-the-judge-montado-no-actions.md`](adr/100-veredito-do-the-judge-montado-no-actions.md) | O veredito do the-judge é montado e conferido por job do Actions (`pull_request_target`, segredo do repositório, revisor = identidade do job); comentário não vale; check `Veredito do the-judge` no ruleset |
| [`adr/043-versionamento-com-changesets-e-release-por-tag.md`](adr/043-versionamento-com-changesets-e-release-por-tag.md) | versionamento semântico com Changesets, release por tag e versão visível às clínicas |
| [`adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md`](adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md) | `ambiente:local` (Postgres 18 + app + seed) e suíte de integração em Postgres real |
| [`adr/045-borda-atras-do-traefik-app-dono-dos-cabecalhos.md`](adr/045-borda-atras-do-traefik-app-dono-dos-cabecalhos.md) | borda atrás do Traefik: `TRUSTED_PROXY_HOPS=1` provado, o app é dono dos cabeçalhos, cookies que expiram com `Secure`, logs sem PII |
| [`adr/046-cobertura-100-nas-camadas-de-regra.md`](adr/046-cobertura-100-nas-camadas-de-regra.md) | 100% de cobertura em domain, application, infrastructure e lib; UI por E2E |
| [`adr/047-testes-de-mutacao-com-stryker.md`](adr/047-testes-de-mutacao-com-stryker.md) | testes de mutação com Stryker em domain e application: placar medido, meta em degraus de 5 pontos, só local |
| [`adr/048-bdd-com-describe-it-e-rastreabilidade-de-regras-criticas.md`](adr/048-bdd-com-describe-it-e-rastreabilidade-de-regras-criticas.md) | BDD em `describe/it` Dado/Quando/Então e teste que liga cada regra crítica ao seu cenário |
| [`adr/049-matriz-de-excecoes-por-dominio.md`](adr/049-matriz-de-excecoes-por-dominio.md) | matriz de casos de exceção por domínio (7 categorias) e teste que prova que cada linha cita um teste que existe |
| [`adr/050-limiar-100-por-camada-e-ui-medida.md`](adr/050-limiar-100-por-camada-e-ui-medida.md) | limiar de 100% por camada de regra; UI segue medida com piso de 90% |
| [`adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md`](adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md) | mutação por arquivo alterado no `gate:local` e rodada completa mensal |
| [`adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md`](adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md) | fluxo de git: `feat → release/vX.Y.Z → main` (merge commit), `staging` = release aberta, tag no commit de merge; substitui o git do ADR-041 e o release do ADR-043 |
| [`adr/053-pr-so-de-documentacao-dispensa-recibo-do-gate-local.md`](adr/053-pr-so-de-documentacao-dispensa-recibo-do-gate-local.md) | PR que toca só `.md` de documentação dispensa o recibo do `gate:local` (o gate rápido e a regra 8 seguem); ajusta o ADR-042 |
| [`adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md`](adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md) | staging sem segundo fator (`STAGING_DISABLE_MFA`, só com `APP_ENV=staging`) e 13 contas fictícias por cenário |
| [`adr/055-logo-e-avatar-com-svg-sanitizado-e-raster-recodificado.md`](adr/055-logo-e-avatar-com-svg-sanitizado-e-raster-recodificado.md) | logo da clínica e avatar da equipe: SVG por allowlist e rejeição de conteúdo ativo, raster recodificado em WebP sem EXIF, mesmo armazenamento das fotos |
| [`adr/056-tema-da-clinica-modo-padrao-cor-e-escolha-do-aparelho.md`](adr/056-tema-da-clinica-modo-padrao-cor-e-escolha-do-aparelho.md) | tema da clínica: modo padrão e cor definidos pelo Admin, `system` resolvido no aparelho, claro/escuro escolhido por aparelho |
| [`adr/057-instalar-na-tela-inicial-sem-service-worker.md`](adr/057-instalar-na-tela-inicial-sem-service-worker.md) | instalar na tela inicial: manifesto da plataforma sem service worker; logo nos documentos |
| [`adr/058-base-do-diff-dos-gates-locais-e-a-release-aberta.md`](adr/058-base-do-diff-dos-gates-locais-e-a-release-aberta.md) | base do diff dos gates locais: a release aberta, não a main |
| [`adr/059-seed-de-homologacao-aditivo.md`](adr/059-seed-de-homologacao-aditivo.md) | seed de homologação aditivo: cria o que falta, sem apagar nem duplicar |
| [`adr/060-redacao-central-de-pii-nos-logs.md`](adr/060-redacao-central-de-pii-nos-logs.md) | logger redige PII por campo e por padrão de texto antes de escrever (stdout e GlitchTip); teste contra PII em mensagem; auditoria sempre mascarada |
| [`adr/062-time-completo-na-avaliacao-de-ferida.md`](adr/062-time-completo-na-avaliacao-de-ferida.md) | avaliação de ferida com TIME completo: infecção/inflamação, bordas, tipo de exsudato e % de tecido; vocabulário fechado, colunas aditivas (migração 0069) |
| [`adr/064-termos-em-nome-do-representante-e-sem-texto-de-preenchimento.md`](adr/064-termos-em-nome-do-representante-e-sem-texto-de-preenchimento.md) | termos de consentimento: variante em nome do representante legal e omissão de texto de preenchimento |
| [`adr/065-termo-de-tratamento-sem-responsavel-tecnico.md`](adr/065-termo-de-tratamento-sem-responsavel-tecnico.md) | termo de tratamento sem a linha do responsável técnico; versão v3 |
| [`adr/066-versao-do-sistema-registrada-no-banco.md`](adr/066-versao-do-sistema-registrada-no-banco.md) | versão do sistema gravada em `app_releases` a cada implantação; `GET /api/version`; rodapé com fallback |
| [`adr/068-codigo-do-commit-so-na-homologacao-e-sha-acompanha-o-deploy.md`](adr/068-codigo-do-commit-so-na-homologacao-e-sha-acompanha-o-deploy.md) | código do commit só na homologação; SHA de `app_releases` atualiza a cada deploy da mesma versão |
| [`adr/070-fluxo-de-sete-estacoes-com-labels-de-fila.md`](adr/070-fluxo-de-sete-estacoes-com-labels-de-fila.md) | fluxo de sete estações: entrada padronizada, labels de fila (`pronta`/`em-andamento`/`bloqueada`), teste pré-patch, verificação em camadas e revisão única em thread limpa |
| [`adr/071-corte-de-release-em-comando-unico.md`](adr/071-corte-de-release-em-comando-unico.md) | `npm run release:cut`: pré-condições e marca `homologacao/vX.Y.Z`, `release:prepare` primeiro, gate da release uma vez em worktree limpo (sem mutação, Docker e backup obrigatórios), ambiente fixado pelo gate (TZ, porta 55432, segredos, sobras) e PR `release → main` com recibo; substitui o ponto do ADR-051 sobre a release |
| [`adr/069-dados-no-servidor-e-politica-de-cache.md`](adr/069-dados-no-servidor-e-politica-de-cache.md) | telas carregam dados em Server Components e escrevem por Server Actions; nenhum dado de clínica em cache compartilhado; foto autenticada fora do otimizador; sem PPR enquanto a CSP usar nonce (aceito) |
| [`adr/074-fundacao-server-first-sessao-dados-e-acoes.md`](adr/074-fundacao-server-first-sessao-dados-e-acoes.md) | fundação server first: sessão por `cookies()` com a revogação do proxy, camada de dados `server-only`, `defineAction`, boundaries por grupo e gate `check:server-first` |
| [`adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md`](adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md) | papel por tela decidido no servidor (`requireStaffPageFor` nos layouts) e auditoria de Server Action na mesma transação da gravação |
| [`adr/076-faturamento-e-repasses-no-servidor-com-transacao-por-repositorio.md`](adr/076-faturamento-e-repasses-no-servidor-com-transacao-por-repositorio.md) | Faturamento e Repasses no servidor: `TransactionScope` com os repositórios do financeiro, leitura compartilhada com a API e rollback da auditoria provado em Postgres real |
| [`adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md`](adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md) | gate na thread da nuvem sem o PC: por PR, suíte unitária completa com cobertura e, só no alterado ou impactado, mutação (domain, application e lib/server), integração e E2E, com fallback «na dúvida, inclui»; por release, gate completo na nuvem e Docker/backup no WSL |
| [`adr/086-web-vitals-de-campo-no-log-estruturado.md`](adr/086-web-vitals-de-campo-no-log-estruturado.md) | Web Vitals de campo no log estruturado: um envio por visita, só com sessão, sem identidade |
| [`adr/077-agenda-no-servidor-periodo-na-url.md`](adr/077-agenda-no-servidor-periodo-na-url.md) | agenda no servidor: período na URL, navegação em transição, as duas variantes do mês até a hidratação |
| [`adr/078-gravacoes-da-agenda-em-server-actions.md`](adr/078-gravacoes-da-agenda-em-server-actions.md) | gravações da agenda em Server Actions: auditoria na mesma transação, efeitos best-effort depois do commit, gancho de falha para o E2E |
| [`adr/079-r4-nas-acoes-de-consulta.md`](adr/079-r4-nas-acoes-de-consulta.md) | R4 nas ações de consulta (403 sem vínculo, 404 de outra empresa), agendar só no próprio nome e série que confere o paciente |
| [`adr/080-ficha-do-paciente-no-servidor.md`](adr/080-ficha-do-paciente-no-servidor.md) | ficha do paciente no servidor: uma leitura por seção e por papel, e a aba na URL sem reler |
| [`adr/081-portal-no-servidor-leituras-por-props-e-refresh.md`](adr/081-portal-no-servidor-leituras-por-props-e-refresh.md) | portal do paciente, do responsável e do parceiro no servidor: leituras por props, atualização por `router.refresh()` e cabeçalho sem salto |
| [`adr/082-documentos-imprimiveis-no-servidor-com-ilha-de-emissao.md`](adr/082-documentos-imprimiveis-no-servidor-com-ilha-de-emissao.md) | documentos imprimíveis no servidor, ilha de emissão por Server Action e trava por documento (sem número duplicado) |
| [`adr/083-materiais-e-procedimentos-no-servidor.md`](adr/083-materiais-e-procedimentos-no-servidor.md) | Materiais e procedimentos no servidor: leituras por props, Server Actions com auditoria na mesma transação e histórico de estoque sob demanda |
| [`adr/085-relatorios-auditoria-e-pedidos-do-titular-no-servidor.md`](adr/085-relatorios-auditoria-e-pedidos-do-titular-no-servidor.md) | Relatórios, auditoria e pedidos do titular no servidor: mês e cursor na URL, decisão por Server Action com aviso depois do commit |
| [`adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md`](adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md) | gate em jobs paralelos: cobertura em 4 shards do Vitest com junção e limiares intactos, E2E em shards e dev em paralelo ao de produção, cache do build e mutação incremental |
| [`adr/088-prova-unica-do-corte-e-pre-voo-do-release-cut.md`](adr/088-prova-unica-do-corte-e-pre-voo-do-release-cut.md) | selo do corte (check run) dispensa CI e Docker repetidos no PR release→main e no push da main, integração Postgres no corte, pré-voo e dry_run do release:cut, staging.yml enxuto e pré-PR rápido na thread |
| [`adr/089-r4-na-emissao-de-documento.md`](adr/089-r4-na-emissao-de-documento.md) | emissão de documento exige vínculo R4 do Profissional com o recurso (403 sem vínculo, 404 inexistente ou de outra empresa), uma só guarda para rota e ação |
| [`adr/091-npm-fixado-e-lockfile-protegido-no-corte.md`](adr/091-npm-fixado-e-lockfile-protegido-no-corte.md) | npm fixado em `packageManager`/`engines`, instalado no Release cut, e check no `release:prepare` que reprova lockfile sem as dependências opcionais |
| [`adr/092-emenda-088-disparo-do-corte-e-selo-sem-furos.md`](adr/092-emenda-088-disparo-do-corte-e-selo-sem-furos.md) | emenda à 088: corte disparado da `main` com `branch=release/vX.Y.Z` validado em falha alta, `fora-do-selo` com dynamic-import, selo recusado vira aviso, check runs paginados com `app.id` |
| [`adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md`](adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md) | gate e CI pesados só com o PR pronto (rascunho reprova de propósito), timeouts e `ubuntu-slim` nos jobs leves; mutação sai do PR |
| [`adr/095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md`](adr/095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md) | proposta (rascunho): tag, backup pré-deploy, deploy no Coolify e fumaça de produção por workflow com *Environment* aprovado, segredos só no *Environment*, chave SSH de comando forçado e plano em 7 tickets |
| [`adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md`](adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md) | fluxo enxuto até a produção: piso mecânico com `tlc-*`/`the-judge` por cima, classes de risco 0–3 com aprovação humana só na 3, `main` sem bypass e fases 1–5 (só 1 e 2 aceitas) |
| [`adr/073-datas-no-fuso-da-clinica-explicito.md`](adr/073-datas-no-fuso-da-clinica-explicito.md) | datas e horas no fuso da clínica (`APP_TIMEZONE`) em toda regra e no cliente, nunca no fuso do processo nem do aparelho; guarda por teste |
| [`adr/072-configuracoes-em-sub-rotas.md`](adr/072-configuracoes-em-sub-rotas.md) | Configurações em sub-rotas `/configuracoes/<seção>` com índice em cartões; âncoras antigas redirecionam; substitui o ADR-067 |
| [`adr/067-configuracoes-em-pagina-unica-com-indice-fixo-no-celular.md`](adr/067-configuracoes-em-pagina-unica-com-indice-fixo-no-celular.md) | Configurações em página única com índice fixo no celular; sub-rotas adiadas (substituído pelo ADR-072) |
| [`adr/063-alerta-de-infeccao-e-aviso-de-coerencia-no-time.md`](adr/063-alerta-de-infeccao-e-aviso-de-coerencia-no-time.md) | decisões clínicas sobre o TIME: infecção local ou pior alerta na triagem, % de tecido fora do PUSH, coerência nível × sinais como aviso |
| [`adr/061-vercel-constroi-so-a-staging.md`](adr/061-vercel-constroi-so-a-staging.md) | a Vercel só constrói a `staging` (`git.deploymentEnabled`); sem prévia por PR nem branch Neon por deploy; complementa o ADR-041 |
| [`adr/037-postgres-18-em-producao-e-alinhamento-do-dev.md`](adr/037-postgres-18-em-producao-e-alinhamento-do-dev.md) | produção em PostgreSQL 18 (Dockerfile + banco do Coolify); compose e CI em 16 até um PR com Docker alinhar |
| [`adr/038-scheduled-tasks-do-coolify-no-lugar-do-crontab.md`](adr/038-scheduled-tasks-do-coolify-no-lugar-do-crontab.md) | alertas, lembretes e retenção como Scheduled Tasks do Coolify, com `wget` e `CRON_SECRET` do ambiente |
| [`adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md`](adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md) | deploy manual depois do backup; rollback por redeploy ou restauração |
| [`adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md`](adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md) | backup diário do banco e das fotos no Coolify: timer do host, `age` e R2 com jurisdição UE (substitui a Storage Box) |
| [`adr/025-cpf-no-recibo-e-protecao.md`](adr/025-cpf-no-recibo-e-protecao.md) | CPF do paciente/pagador opcional, validado, cifrado e mascarado; exigido só no recibo do IRPF, com CNPJ do prestador |

Decisões de execução (não arquiteturais) ficam em `../.specs/STATE.md` — ver [`agents/planning.md`](agents/planning.md).

## Auditorias (snapshots congelados)

| Arquivo | Escopo |
| --- | --- |
| [`audits/analise-seguranca-escalabilidade.md`](audits/analise-seguranca-escalabilidade.md) | segurança e escalabilidade |
| [`audits/auditoria-ux-2026-08.md`](audits/auditoria-ux-2026-08.md) | UX, agosto 2026 |
| [`engineering/auditoria-logs-pii-2026-10.md`](engineering/auditoria-logs-pii-2026-10.md) | logs e dado pessoal, outubro 2026 (dado sempre mascarado) |
| [`audits/auditoria-design-system-2026-08.md`](audits/auditoria-design-system-2026-08.md) | design system, agosto 2026 |

Auditoria é **entrada** de planejamento, nunca pedido de trabalho por si só.

## Design system

| Arquivo | Para quê |
| --- | --- |
| [`still-void-gaps.md`](still-void-gaps.md) | exceções `sv-gap` aceitas pelo `check:sv` (caminho fixo no script) |
| [`backlog-design-system.md`](backlog-design-system.md) | histórico e backlog da adoção de `@still-void/ui` |

## Como agentes consomem este repositório

| Arquivo | Para quê |
| --- | --- |
| [`governance.md`](governance.md) | progressive disclosure, docs-as-code, contexto para LLMs |
| [`agents/coordenacao.md`](agents/coordenacao.md) | papel do coordenador, regras, fluxo de release, política do gate |
| [`agents/estado-v0.4.0.md`](agents/estado-v0.4.0.md) | release aberta: mergeados, em andamento, fila, decisões PO |
| [`agents/briefs-v0.4.0-leva2.md`](agents/briefs-v0.4.0-leva2.md) | briefs executáveis das issues da leva 2 |
| [`agents/domain.md`](agents/domain.md) | glossário e ADRs |
| [`agents/planning.md`](agents/planning.md) | onde vive cada tipo de plano; os dois logs de decisão |
| [`agents/issue-tracker.md`](agents/issue-tracker.md) | issues no GitHub |
| [`agents/triage-labels.md`](agents/triage-labels.md) | labels de triagem |
| [`agents/fix-audit-issues.md`](agents/fix-audit-issues.md) | pipeline de correção de achados |

## Templates

| Template | Destino |
| --- | --- |
| [`templates/feature-spec.md`](templates/feature-spec.md) | `domains/<slug>/features/<funcionalidade>.md` |
| [`templates/domain.md`](templates/domain.md) | `domains/<slug>/README.md` |
| [`templates/integration.md`](templates/integration.md) | `engineering/integrations/<serviço>.md` |
| [`templates/prd.md`](templates/prd.md) | `product/prd-fase-N.md` |
| [`templates/adr.md`](templates/adr.md) | `adr/NNN-slug.md` |

Execução por feature (spec/design/tasks/validação, congelado) fica em `../.specs/features/`, não aqui.
