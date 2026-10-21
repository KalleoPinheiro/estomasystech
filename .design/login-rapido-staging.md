# Login facilitado só na staging (sem 2FA)

> Plan this with **tlc-plan**.
> Decisions below carry the literal shape - copy them, do not re-derive them.

## Situation

- Project: em uso (produção no ar) e homologação no ar desde 2026-10-19 (ADR-041, `docs/engineering/homologacao.md`).
- Decision: comprometida por @KalleoPinheiro, 2026-10-21, ao abrir esta sessão: login facilitado **somente** na staging, sem 2FA, "baseado totalmente em mocks".
- In flight: `release/v0.2.0` é a release aberta (ADR-052); a feature nasce dela. Nada em andamento toca `src/app/api/auth/login`.
- At stake: caro se errado. Desligar o segundo fator por engano em produção enfraquece a defesa de `super_admin` e `company_admin` sobre dado de saúde (LGPD). Em contrapartida, ligar/desligar é reversível em minutos (variável de ambiente).

## Problem

Absence + pain de uso. Quem testa a staging (Kalléo, hoje; depois quem validar uma release) precisa de: senha `STAGING_SEED_PASSWORD` (só no painel da Vercel), cadastrar um autenticador TOTP no primeiro login de cada conta de papel `required` (`super_admin`, `company_admin`) e repetir isso a cada branch de banco reiniciado (o seed não recria o fator). Para ver uma tela de `profissional` e depois a de `admin`, são dois logins completos. O substituto de hoje é colar a senha, abrir o app autenticador e, a cada reset do banco da staging, recadastrar tudo. Isso desencoraja validar o lote (ADR-052 depende da staging ser testada antes da `main`).

Se nada mudar: a homologação continua funcionando, só mais lenta e chata de usar; não quebra nada.

## Evidence

- Papéis com 2FA obrigatório: `super_admin` e `company_admin` (`MFA_POLICY` em `src/domain/auth/mfa.ts`); atendente/profissional só se cadastraram.
- 5 contas fictícias do seed, todas `@homologacao.invalid` (`scripts/seed/seed.ts:94-104`; `homologacao.md` § 4).
- Quanto tempo o login custa hoje a quem testa: não medido (ninguém instrumentou; é percepção do Kalléo). Proxy de sucesso abaixo.

## Journey

Quem testa abre a URL da staging → vê a faixa de homologação → entra com e-mail e senha de uma conta fictícia (mesma tela de produção) → cai na tela do papel, sem cadastrar nem digitar segundo fator.

Estados:

- **Empty** (conta ainda não existe no banco): conta nova só aparece em banco novo; reiniciar o branch de banco da staging resolve.
- **Clínica suspensa** (`admin-suspensa@`) e **conta inativa** (`inativo@`): continuam barradas pelas regras normais do login (cenários de erro).
- **Retry / sessão expirada**: igual a produção.
- **Trocar de papel**: sair e entrar com outra conta; todas usam a mesma senha.
- **Unauthorised** (preview, produção, dev): o 2FA continua exigido e `STAGING_DISABLE_MFA=true` fora da staging derruba o boot.

## Verdict

**Build**, pequeno e sem desvio de produção. Custo de fazer: uma guarda de ambiente, um `if` no login, o seed ampliado e documentação; sem migração. Custo de não fazer: atrito a cada validação de release. Comprometido pelo Kalléo em 2026-10-21 - ver Situation. Em 2026-10-21 o Kalléo trocou o atalho sem senha por "seed do banco + 2FA desligado" (menos desvio de produção).

Cheaper paths considered: atalho "Entrar como…" sem senha (descartado pelo Kalléo: afasta a staging de produção e cria endpoint de risco) · identidade simulada em memória (sessão e revogação dependem do banco; ADR-041 já rejeitou mockar dados) · pré-cadastrar TOTP no seed (ainda pede código a cada login).

## Success

- Worked if: validar uma release na staging passa a começar em "entrar com e-mail e senha da conta certa" - por ~2026-11-30.
- Early signal: o roteiro `## Homologação` do próximo PR de feature roda sem o passo de login manual; se alguém ainda recadastra autenticador na staging, a variável não está ligada.
- Review: na abertura da próxima release (`release/v0.3.0`) - Kalléo.
- Não mensurável hoje (tempo de login): proxy observável é o passo "entrar com senha e cadastrar 2FA" sair do `homologacao.md` § 4.

## Boundary

In: staging (`APP_ENV=staging`) apenas; as 13 contas fictícias do seed; pular o 2FA em qualquer login nesse ambiente; doc e ADR.
Out: preview por PR - fica de fora porque o Kalléo pediu "somente staging" e o preview já é protegido pela Vercel Authentication; atalho sem senha e identidade em memória - ver Verdict; qualquer mudança no login de produção, no portal do paciente ou nas regras de papel.

## Prior art

- Nada comparável pesquisado: sem acesso à web nesta sessão. A decisão se apoia no que o repositório já faz: `MOCK_INTEGRATIONS` já é guarda de ambiente que lança erro em produção (`src/lib/runtime-env.ts`); copiamos esse padrão.

## Shape

Mesmo login de produção; só o segundo fator some, e só com `APP_ENV=staging` mais `STAGING_DISABLE_MFA=true`. O seed passa a cobrir os casos de validação documentados no repositório com 13 contas reutilizáveis. Custo de mudar depois: uma variável.

### Adds

- `stagingMfaDisabled(env)` e `assertStagingMfaFlagSafe(env)` em `src/lib/runtime-env.ts`; `startRuntimeGuards` chama a segunda (o boot recusa a variável fora da staging).
- 8 contas e 1 clínica no seed: `admin2@`, `profissional2@`, `inativo@`, `admin-vizinha@` (clínica `hml-clinica-vizinha`, sem CNPJ, 3 pacientes), `paciente@` (termos de tratamento e imagem aceitos), `paciente-novo@` (sem termo), `responsavel@`, `parceiro@`.
- `docs/engineering/homologacao-cenarios.md`: casos de validação por domínio × conta e dado que os reproduz.
- ADR-054.

### Changes

- `pendingSecondFactor` em `src/app/api/auth/login/route.ts` → `null` quando `stagingMfaDisabled()`.
- `scripts/seed/seed.ts` → 13 contas e 3 clínicas; `tests/scripts/seed.test.ts` com os novos totais (TESTE-ALTERADO).
- `homologacao.md` § 3 e § 4, `onboarding.md` § 4, `.env.example`, `docs/domains/acesso/README.md`.

### Leaves

- Login de produção, `MFA_POLICY`, preview por PR, `src/proxy.ts`, rotas e telas.

## Roadmap

Um bloco, um PR: guarda + seed + testes + ADR e documentação. Clareza: clear.

## Decisions

| Decision | Choice | Why this | Alternative, and what would make it win | Reversibility |
| --- | --- | --- | --- | --- |
| Como tirar o atrito | `STAGING_DISABLE_MFA=true` com `APP_ENV=staging`; login normal | não desvia de produção | atalho sem senha: só se digitar a senha virar o gargalo | reversible |
| Falha fechado | `assertStagingMfaFlagSafe` lança no boot fora da staging | regra inviolável 2 | ignorar a variável fora da staging: mais silencioso | reversible |
| Preview | fora | pedido: somente staging | incluir preview: vence se validar PR for o uso comum | reversible |
| Contas | 13, todas `@homologacao.invalid`, mesma senha | reaproveitar contas para cobrir mais casos | uma conta por caso: ruído | reversible |
| Seed existente | só aparece em banco novo | seed idempotente por clínica | backfill de contas no banco antigo: vence se reiniciar o banco for caro | reversible |

## Open

1. Backfill de contas novas no banco já semeado? - não; reiniciar o branch de banco no Neon.

## Sources

- `src/lib/runtime-env.ts`, `src/app/api/auth/login/route.ts`, `src/domain/auth/mfa.ts`, `scripts/seed/seed.ts`.
- `docs/domains/*/excecoes.md` (ADR-049), `docs/adr/041-*.md`, `docs/adr/052-*.md`, `docs/engineering/homologacao.md`.
