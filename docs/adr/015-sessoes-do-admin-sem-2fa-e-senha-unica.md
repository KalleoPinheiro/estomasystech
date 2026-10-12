---
title: "ADR 015 — Sessões do Admin sem 2FA derrubadas e senha única para todos os papéis"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
---

# ADR 015 — Sessões do Admin sem 2FA derrubadas e senha única para todos os papéis

- **Data:** 2026-10-12
- **Status:** aceito (decisões do dono do produto na issue [#309](https://github.com/KalleoPinheiro/vitta-flow/issues/309), que respondeu às perguntas abertas da PR #298)
- **Domínios afetados:** acesso, portal
- **Altera:** [ADR-012](./012-segundo-fator-e-senha-da-equipe.md). Dois pontos mudam: as sessões abertas do Admin sem fator deixam de valer até expirar, e a senha do portal deixa de ter o mínimo de 8.

## Decisão

1. **Sessões do Admin de Empresa sem 2FA caem na hora.** A migração `0052` soma 1 ao
   `session_version` de todo `company_admin` sem linha em `user_mfa`. O proxy já compara a versão
   do token com a da conta (ADR-005), então a sessão antiga é revogada na próxima conferência
   (até 60 s por instância). No login seguinte, o Admin cai no cadastro do autenticador (ADR-012).
   Quem já tinha fator não é tocado. Admin criado depois da migração nunca tem sessão sem fator,
   porque o login exige o cadastro antes de abrir a sessão.
2. **Uma política de senha só.** Equipe, paciente e parceiro: mínimo de 10 caracteres e recusa da
   lista embutida de senhas comuns, com as mesmas mensagens. Vale ao definir (convite e
   redefinição) e ao trocar. Como o papel deixou de importar, a política é conferida antes de ler
   o token (uma senha recusada continua sem queimar o link). Senha antiga continua valendo até a
   próxima troca.

## Consequências

- Pacientes e parceiros com senha de 8 ou 9 caracteres seguem entrando; a regra nova só pega a
  próxima definição ou troca.
- A derrubada é de uma vez só, na migração. Não há gatilho em tempo de execução: o login já impede
  o Admin sem fator de ter sessão.
- Reset do 2º fator de quem perdeu o celular continua na [#295](https://github.com/KalleoPinheiro/vitta-flow/issues/295).

## Relacionado

[ADR-005](./005-revogacao-de-sessao-por-versao.md), [ADR-012](./012-segundo-fator-e-senha-da-equipe.md), issues [#291](https://github.com/KalleoPinheiro/vitta-flow/issues/291), [#309](https://github.com/KalleoPinheiro/vitta-flow/issues/309).
