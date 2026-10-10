# Canal de e-mail por clínica (RM-21) — índice de validação

Issues [#264](https://github.com/KalleoPinheiro/vitta-flow/issues/264)–[#267](https://github.com/KalleoPinheiro/vitta-flow/issues/267).
Esta iniciativa rodou pelo pipeline tlc (discover → plan → implement). A evidência mora em
`.design/`, `.tasks/` e `.checks/`, e este arquivo só aponta para ela.

- Discovery e decisões: [`.design/canal-por-clinica.md`](../../../.design/canal-por-clinica.md) ([#268](https://github.com/KalleoPinheiro/vitta-flow/pull/268))
- ADR: [011](../../../docs/adr/011-canal-de-comunicacao-por-clinica.md)

| Bloco | Tarefa | Checklist | Verificação independente | Veredito | PR · commit |
| --- | --- | --- | --- | --- | --- |
| C1 Canal de e-mail por clínica | [task](../../../.tasks/c1-canal-email-por-clinica.md) | [checklist](../../../.checks/c1-canal-email-por-clinica.md) | [relatório](../../../.checks/c1-canal-email-por-clinica.verified.md) | PASS | [#269](https://github.com/KalleoPinheiro/vitta-flow/pull/269) · `019d34d` |
| C2 Envios pelo canal e link manual | [task](../../../.tasks/c2-envios-pelo-canal-da-clinica.md) | [checklist](../../../.checks/c2-envios-pelo-canal-da-clinica.md) | [relatório](../../../.checks/c2-envios-pelo-canal-da-clinica.verified.md) | PASS | [#270](https://github.com/KalleoPinheiro/vitta-flow/pull/270) · `4ba8685` |
| C3 Tela do canal em `/configuracoes` | [task](../../../.tasks/c3-tela-canal-configuracoes.md) | [checklist](../../../.checks/c3-canal-email-configuracoes.md) | [relatório](../../../.checks/c3-canal-email-configuracoes.verified.md) | PASS | [#271](https://github.com/KalleoPinheiro/vitta-flow/pull/271) · `af2f650` |
| C4 `/plataforma` organizado | [task](../../../.tasks/c4-plataforma-organizada.md) | [checklist](../../../.checks/c4-plataforma-organizada.md) | [relatório](../../../.checks/c4-plataforma-organizada.verified.md) | PASS | [#273](https://github.com/KalleoPinheiro/vitta-flow/pull/273) · `7d9d257` |

Os 4 jobs de CI passaram em todos os PRs (AGENTS.md, regra 7).

## Depois da entrega

Decisões do dono tomadas depois dos blocos, arquivadas em
[`.specs/archive/decisions-2026.md`](../../archive/decisions-2026.md):

- AD-029 — limite de 5 e-mails de teste por minuto por clínica; dois admins salvando ao mesmo tempo, vale a última gravação ([#272](https://github.com/KalleoPinheiro/vitta-flow/pull/272)).
- AD-030 — link de senha no log só fora de produção; convite de admin substituto devolve o link quando o e-mail não sai ([#274](https://github.com/KalleoPinheiro/vitta-flow/pull/274)).
