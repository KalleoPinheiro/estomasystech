# Fix: endurecer o login — oráculo de tempo, limite por conta e custo do scrypt (#208)

## Problem Statement

Revisão pré-produção (#183, item #208, P2). Três falhas no `POST /api/auth/login` deixam
enumerar contas e forçar senha de contas que acessam prontuário:

1. **Oráculo de tempo.** `authenticateAccount` só roda scrypt se existe conta ativa com o
   e-mail. E-mail inexistente responde em ~1 ms; existente, no tempo de um scrypt.
2. **Limite só por IP** (`LOGIN_RATE_LIMIT`, 5/min). A mesma conta aguenta tentativas sem teto
   vindas de muitos IPs (credential stuffing).
3. **Custo do scrypt** `N=2^14` (`src/lib/auth/password.ts`), abaixo do mínimo do OWASP Password
   Storage Cheat Sheet (`N=2^17, r=8, p=1`).

## Goals

- [ ] O tempo de resposta do login não distingue e-mail com e sem conta.
- [ ] Cada e-mail tem o mesmo teto de tentativas do IP, independente de quantos IPs tentam.
- [ ] Senha nova é guardada com `N=2^17`; **nenhuma conta perde o acesso**: hash antigo segue
      validando e é refeito no login.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Política de senha (tamanho mínimo, lista de vazadas, 2FA para staff) — item 4 da issue | Decisão de produto; fica como pergunta aberta (abaixo e na PR) |
| Custo maior para os códigos de recuperação do segundo fator | São ~49 bits aleatórios; custo alto protege segredo de baixa entropia. Com `2^17`, os 10 verificados em paralelo pediriam 1,28 GB |
| Re-hash fora do login (migração em lote) | Impossível sem a senha em claro; o re-hash só acontece quando a senha é provada |
| Desbloqueio manual / lockout progressivo por conta | Não pedido; o limite por conta usa a mesma janela fixa do IP |

## Assumptions & Open Questions

| Decisão | Padrão escolhido | Motivo | Confirmado? |
| --- | --- | --- | --- |
| Teto e janela por conta | 5 tentativas / 60 s, igual ao IP | A issue pede "mesma janela/teto do IP"; é o padrão de todo endpoint de auth (`login`, `forgot-password`, `mfa-verify`, `bootstrap`) | y (issue) |
| Mensagem do 429 por conta | A mesma do 429 por IP: "Muitas tentativas de login, aguarde um minuto" | Mensagem neutra: não diz se o limite foi por IP ou conta, nem se a conta existe | y (issue: "mensagem neutra") |
| Chave do limite por conta | SHA-256 do e-mail em minúsculas e sem espaços nas pontas; conta para qualquer e-mail, exista a conta ou não | Normalização igual à do repositório (`findAllByEmail`); contar só e-mails existentes viraria oráculo; o hash evita guardar e-mail (inclusive de quem não tem conta) em claro em `rate_limit_windows` (LGPD) | y |
| Ordem dos limites | IP antes de tudo; e-mail depois de validar o corpo | Corpo inválido não tem e-mail para contar | y |
| Efeito colateral: alguém pode travar uma conta por 1 min tentando 6 vezes | Aceito como está | É o custo inerente do limite por conta pedido; a janela é curta. Registrado como pergunta para o dono | **n — pergunta aberta** |
| Scrypt fictício | Mesmo custo (`2^17`), salt aleatório por processo, resultado descartado; roda também quando o hash guardado não tem senha usável (convite pendente) | "Tempo indistinguível" (issue). Sem o segundo caso, conta convidada respondia rápido | y |
| `maxmem` | `2 × 128 × N × r` bytes (256 MiB para `2^17`) | O Node recusa com `128 × N × r > maxmem` (padrão 32 MiB); o dobro dá folga ao cálculo aproximado | y |
| Re-hash e sessões | Re-hash grava só se o hash ainda for o lido (compare-and-set) e **não** incrementa `session_version` | A senha não mudou; derrubar as sessões do usuário seria efeito colateral. O compare-and-set impede sobrescrever uma troca de senha concorrente | y |
| Falha ao gravar o re-hash | Login passa; erro vai para `logError`; próximo login tenta de novo | O hash antigo continua válido; falhar o login por isso derrubaria o acesso sem motivo | y |

**Pergunta aberta para @KalleoPinheiro:** (1) política de senha do staff — tamanho mínimo,
checagem contra senhas vazadas, 2FA (já no roadmap como P2); (2) o limite por conta permite que
um terceiro trave o login de uma conta por até 1 min — aceitar, ou trocar por outro desenho
(ex.: limite por conta só para senhas erradas, CAPTCHA)?

## Acceptance Criteria (EARS)

1. WHEN o login recebe um e-mail sem conta ativa THEN o sistema SHALL executar um scrypt
   fictício de custo `2^17` antes de responder `401` "Email ou senha incorretos".
2. WHEN a conta existe mas o hash guardado não tem senha usável (convite pendente) THEN o
   sistema SHALL executar o mesmo scrypt fictício.
2a. WHEN nenhuma conta candidata tem hash do custo atual (só hashes `2^14` ainda não refeitos)
   THEN o sistema SHALL executar o scrypt fictício em paralelo às verificações — conta parada
   desde a troca de custo não responde mais rápido que e-mail inexistente.
3. WHEN o mesmo e-mail normalizado soma mais de 5 tentativas na janela de 60 s, vindas de
   qualquer IP, THEN o sistema SHALL responder `429` "Muitas tentativas de login, aguarde um
   minuto", exista a conta ou não.
4. WHEN um e-mail está bloqueado THEN outras contas SHALL continuar entrando normalmente.
5. WHEN uma senha é gravada (convite, reset, troca, bootstrap) THEN o sistema SHALL usar
   `scrypt$131072$…` com `r=8, p=1`.
6. WHEN a conta tem hash de custo menor e a senha certa é informada THEN o sistema SHALL emitir a
   sessão, gravar novo hash `2^17` da mesma senha sem mudar `session_version`, e a senha SHALL
   continuar valendo nos logins seguintes.
7. WHEN a senha informada está errada THEN o hash antigo SHALL ficar intacto.
8. WHEN a gravação do re-hash falha THEN o login SHALL passar e o hash antigo SHALL seguir valendo.
9. WHEN a senha foi trocada entre a leitura e o re-hash THEN o re-hash SHALL não sobrescrever a
   senha nova.

## Testes

| AC | Teste |
| --- | --- |
| 1 | `tests/api/login-hardening.test.ts` — "Dado e-mail sem conta…roda o scrypt fictício" (espia `simulatePasswordCheck`) |
| 2 | `tests/lib/password-timing.test.ts` — convite pendente, formato inválido e custo fora da faixa rodam um scrypt `2^17` (espia `node:crypto`) |
| 2a | `tests/api/login-hardening.test.ts` — "hash de custo antigo ainda não refeito…scrypt fictício roda junto" |
| 3, 4 | `tests/api/login-hardening.test.ts` — Cenário "limite por conta" (IPs diferentes, variantes de caixa/espaço, e-mail inexistente, outra conta não afetada) |
| 5 | `tests/lib/auth.test.ts` — "usa o custo N=2^17"; `tests/lib/password-timing.test.ts` — "usa N=2^17, r=8, p=1" |
| 6, 7, 8 | `tests/api/login-hardening.test.ts` — Cenário "re-hash transparente"; hash legado literal em `tests/lib/auth.test.ts` gerado pela versão anterior |
| 9 | `tests/api/login-hardening.test.ts` (Drizzle/PGlite) e `tests/infrastructure/in-memory-repositories.test.ts` |
