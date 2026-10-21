# Login facilitado só na staging (sem 2FA, sem senha)

> Plan this with **tlc-plan**.
> Decisions below carry the literal shape - copy them, do not re-derive them.

## Situation

- Project: em uso (produção no ar) e homologação no ar desde 2026-10-19 (ADR-041, `docs/engineering/homologacao.md`).
- Decision: comprometida por @KalleoPinheiro, 2026-10-21, ao abrir esta sessão: login facilitado **somente** na staging, sem 2FA, "baseado totalmente em mocks".
- In flight: `release/v0.2.0` é a release aberta (ADR-052); a feature nasce dela. Nada em andamento toca `src/app/api/auth/login`.
- At stake: caro se errado. Um atalho de login sem senha que vaze para produção entrega `super_admin` a qualquer um com dado de saúde (LGPD) atrás. Em contrapartida, ligar/desligar é reversível em minutos (variável de ambiente).

## Problem

Absence + pain de uso. Quem testa a staging (Kalléo, hoje; depois quem validar uma release) precisa de: senha `STAGING_SEED_PASSWORD` (só no painel da Vercel), cadastrar um autenticador TOTP no primeiro login de cada conta de papel `required` (`super_admin`, `company_admin`) e repetir isso a cada branch de banco reiniciado (o seed não recria o fator). Para ver uma tela de `profissional` e depois a de `admin`, são dois logins completos. O substituto de hoje é colar a senha, abrir o app autenticador e, a cada reset do banco da staging, recadastrar tudo. Isso desencoraja validar o lote (ADR-052 depende da staging ser testada antes da `main`).

Se nada mudar: a homologação continua funcionando, só mais lenta e chata de usar; não quebra nada.

## Evidence

- Papéis com 2FA obrigatório: `super_admin` e `company_admin` (`MFA_POLICY` em `src/domain/auth/mfa.ts`); atendente/profissional só se cadastraram.
- 5 contas fictícias do seed, todas `@homologacao.invalid` (`scripts/seed/seed.ts:94-104`; `homologacao.md` § 4).
- Quanto tempo o login custa hoje a quem testa: não medido (ninguém instrumentou; é percepção do Kalléo). Proxy de sucesso abaixo.

## Journey

Quem testa abre a URL da staging → vê a faixa de homologação e, no login, uma lista "Entrar como…" com as 5 contas fictícias → clica → cai na tela inicial do papel escolhido, sem senha e sem código.

Estados:

- **Empty** (seed não rodou, conta não existe): a rota responde 404 com mensagem "Conta fictícia não encontrada. Rode o seed da staging."; a lista não some.
- **Clínica suspensa** (`admin-suspensa@`): continua barrado pela mesma regra de clínica suspensa do login normal (cenário de erro do seed é preservado), com a mesma mensagem.
- **Retry / sessão expirada**: igual ao login normal (`?error=sessao-expirada`); basta clicar de novo.
- **Trocar de papel**: sair (logout existente) e clicar em outra conta. Sem troca de papel em um clique nesta entrega.
- **Unauthorised** (staging com atalho desligado, preview, produção, dev): a lista não aparece e a rota responde 404, como se não existisse.
- **Formulário e-mail+senha**: continua existindo na staging e também pula o 2FA, para o mesmo ambiente não exigir o fator por nenhum caminho.

## Verdict

**Build**, atalho pequeno e blindado. Custo de fazer: uma rota, uma guarda de ambiente e testes, sem migração. Custo de não fazer: tempo e atrito a cada validação de release, sem dano técnico. Comprometido pelo Kalléo em 2026-10-21 - ver Situation. A interpretação de "baseado em mocks" abaixo (contas fictícias reais do seed, não identidade simulada em memória) é a que o Kalléo ainda precisa confirmar.

Cheaper paths considered: só desligar o 2FA e manter a senha (resolve o atrito do autenticador, não o de digitar a senha nem o de trocar de papel; fica como metade do pacote) · senha curta e documentada (a senha está no painel da Vercel de propósito) · pré-cadastrar o fator TOTP no seed (precisa de segredo fixo e ainda pede código a cada login).

## Success

- Worked if: validar uma release na staging passa a começar em "clicar na conta" - por ~2026-11-30.
- Early signal: o roteiro `## Homologação` do próximo PR de feature roda sem o passo de login manual; se alguém ainda recadastra autenticador na staging, o atalho não está pegando.
- Review: na abertura da próxima release (`release/v0.3.0`) - Kalléo.
- Não mensurável hoje (tempo de login): proxy observável é o passo "entrar com senha e cadastrar 2FA" sair do `homologacao.md` § 4.

## Boundary

In: staging (`APP_ENV=staging`) apenas; as 5 contas fictícias do seed; pular o 2FA em qualquer login nesse ambiente; doc e ADR.
Out: preview por PR - fica de fora porque o Kalléo pediu "somente staging" e o preview já é protegido pela Vercel Authentication; identidade em memória sem banco - ver Shape; troca de papel em um clique; qualquer mudança no login de produção, no portal do paciente ou nas regras de papel.

## Prior art

- Nada comparável pesquisado: sem acesso à web nesta sessão. A decisão se apoia no que o repositório já faz: `MOCK_INTEGRATIONS` já é guarda de ambiente que lança erro em produção (`src/lib/runtime-env.ts`); copiamos esse padrão.

## Shape

O atalho é uma sessão real emitida para uma conta fictícia real do seed, sem senha e sem 2FA, atrás de uma guarda de quatro travas independentes: `APP_ENV=staging`, `STAGING_QUICK_LOGIN=true`, e-mail terminando em `@homologacao.invalid`, e `STAGING_QUICK_LOGIN` ligado em `production` derruba o boot (igual `MOCK_INTEGRATIONS`). Trocar a identidade por um mock em memória custaria mais e testaria menos: a sessão carrega `accountId`/`sessionVersion` e o proxy revalida no banco (`proxy-revocation`), e o ADR-041 já rejeitou mockar dados. O custo de mudar depois é baixo (uma variável e uma rota).

### Adds

- `quickLoginEnabled(env)` e `assertQuickLoginSafe(env)` em `src/lib/runtime-env.ts`: ligado só com `resolveAppEnv(env) === 'staging'` e `STAGING_QUICK_LOGIN === 'true'`; `assertQuickLoginSafe` lança se a variável estiver `true` com `APP_ENV` diferente de `staging`.
- `POST /api/auth/staging-login` (corpo `{ email }`), rota em `PUBLIC_PATHS`: 404 se `!quickLoginEnabled()`; 404 se o e-mail não termina em `@homologacao.invalid`; reaproveita busca de conta, regra de clínica suspensa e `createSessionToken`; grava evento de auditoria `detail: 'staging_quick_login'`; passa pelo mesmo `LOGIN_RATE_LIMIT` por IP.
- `GET /api/auth/providers` passa a devolver `quickLogin: { email, role, label }[] | null` (lista fixa das contas do seed; `null` fora da staging).
- Bloco "Entrar como…" em `src/app/login/page.tsx`, só com `@still-void/ui`, visível quando `providers.quickLogin` não é nulo.
- ADR-053 (`docs/adr/053-login-rapido-na-staging-sem-2fa.md`): registra o risco aceito e as travas.
- Testes: guarda por ambiente (production/preview/development/staging, com e sem a variável), rota (conta existe, não existe, suspensa, domínio errado, desligada), `providers`, e que a produção nunca expõe o atalho.

### Changes

- `pendingSecondFactor` em `src/app/api/auth/login/route.ts` → retorna `null` quando `quickLoginEnabled()`, de modo que nenhum caminho de login na staging pede 2FA.
- `docs/engineering/homologacao.md` § 3 e § 4 → variável `STAGING_QUICK_LOGIN`, fim do passo de cadastrar 2FA na staging, tabela de contas com o atalho.
- `docs/domains/acesso/` → nota de que o 2FA é dispensado só na staging, com link para o ADR-053.
- `.env.example` e `docs/engineering/onboarding.md` § 4 → `STAGING_QUICK_LOGIN`.
- `docs/adr/041-*` não muda (status frozen); o ADR-053 o referencia.

### Leaves

- Login de produção, portal do paciente, regra `MFA_POLICY`, `set-password`/`forgot-password`, preview, `src/proxy.ts`.

A versão mais pesada (identidade totalmente simulada, sem banco) só ganharia se a staging deixasse de ter Postgres; não é o caso e o ADR-041 já descartou.

## Roadmap

Um bloco, uma pessoa, um PR: guarda + rota + providers + tela + ADR/docs. Clareza: clear.

## Decisions

| Decision | Choice | Why this | Alternative, and what would make it win | Reversibility |
| --- | --- | --- | --- | --- |
| O que "mock" significa | sessão real para conta fictícia do seed, sem senha | sessão e revogação dependem do banco; testa o caminho de produção | identidade em memória: só se a staging perdesse o Postgres | reversible |
| Liga/desliga | `APP_ENV=staging` **e** `STAGING_QUICK_LOGIN=true` | duas variáveis erradas ao mesmo tempo é improvável; padrão igual a `MOCK_INTEGRATIONS` | só `APP_ENV`: vence se o Kalléo preferir sempre ligado | reversible |
| Falha fechado | `assertQuickLoginSafe` lança no boot com a variável `true` fora da staging | regra inviolável 2 (auth falha fechado) | só ignorar a variável fora da staging: mais silencioso, pior | one-way (ao incidente) / costly |
| Quem pode entrar | e-mail terminando em `@homologacao.invalid` | mesmo que um banco real vaze para a staging, conta real não é personificável | sem filtro: nunca | reversible |
| 2FA | `pendingSecondFactor` → `null` quando `quickLoginEnabled()` | "lá não deve exigir 2fa" por qualquer caminho | pular só no atalho: deixa o formulário pedindo fator | reversible |
| Preview | fora | pedido: "SOMENTE staging" | incluir preview: vence se validar PR for o uso mais comum | reversible |
| Auditoria | evento `read`/`session` com `detail: 'staging_quick_login'` | rastreia uso do atalho | sem evento: não | reversible |
| Branch | `feat/login-rapido-staging` a partir de `origin/release/v0.2.0`; PR squash na release com `## Homologação` e changeset | ADR-052 | — | reversible |

## Open

1. Atalho some do login quando a lista de contas do seed muda? - lista fixa em código, espelhando `seed.ts`; teste falha se divergir.
2. O formulário e-mail+senha continua visível na staging? - sim, para exercitar o login real quando necessário.

## Sources

- `src/lib/runtime-env.ts`, `src/app/api/auth/login/route.ts`, `src/domain/auth/mfa.ts`, `src/app/api/auth/providers/route.ts`, `scripts/seed/seed.ts`.
- `docs/adr/041-homologacao-na-vercel-e-branch-staging.md`, `docs/adr/052-*.md`, `docs/engineering/homologacao.md`.
