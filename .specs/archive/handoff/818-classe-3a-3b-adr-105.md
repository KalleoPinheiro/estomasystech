## ADR-105: classe 3 dividida em 3A automática e 3B humana (#818) (2026-11-14) — EM REVISÃO
- **Por quê**: o clique do Kalléo no Environment `aprovacao-classe-3` é o maior gargalo do fluxo (até 130 min por run) e cai em mudanças que só apertam o portão (#814, #817).
- **O que mudou**: só documentação. ADR-105, proposto, aguarda aceite do Kalléo (3A sem clique, 3B humana, controles verificáveis por máquina, 3B de produto com um clique por release, auditoria por release, falha fechada, revezamento Claude/Cursor por passagem de bastão, riscos residuais e passos exatos do Kalléo). `classe-de-risco.md` § 5 e `homologacao.md` registram a decisão como não implementada. Nenhum workflow, classificador ou `scripts/gate/` tocado.
- **Premissa corrigida pelo Kalléo**: os dois agentes nunca estão ativos juntos, então não há revisão cruzada. O controle vira segunda review adversarial em sessão limpa do mesmo agente, mais provas mecânicas. O erro correlato de um único modelo está nos riscos residuais.
- **Desvios do pedido (a confirmar)**: `scripts/gate/`, hooks e `.husky` ficam em 3B-trava (regra 8), mais estreito que "config de gate em 3A"; a 3B que muda o portão mantém o clique por PR, o resto da 3B vai ao PR `release → main`.
- **Fora do repositório (só o Kalléo)**: ADR-105 § 8 (variável `CLASSE_3A_AUTOMATICA` em `false`, Environment, ruleset, forks).
- **Dependências da implementação (#819, v0.8.0)**: PR #811 (#769), PR #816 (ADR-104), PR #817 (#760).
- **Next step**: the-judge em thread nova; depois de mergeado, #819. **Blockers**: nenhum.
