# Portal do Super Admin (RM-20) — índice de validação

Épico: [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214). Esta iniciativa rodou pelo
pipeline tlc (discover → plan → implement). A evidência mora em `.design/`, `.tasks/` e
`.checks/`, e este arquivo só aponta para ela.

- Discovery e decisões: [`.design/portal-super-admin.md`](../../../.design/portal-super-admin.md)
- Tarefa do B1: [`.tasks/b1-contencao-super-admin.md`](../../../.tasks/b1-contencao-super-admin.md). Os
  blocos B2 a B7 foram planejados direto do design, cada um na própria checklist.
- ADRs: [007](../../../docs/adr/007-super-admin-operador-da-plataforma.md),
  [008](../../../docs/adr/008-segundo-fator-do-super-admin.md),
  [009](../../../docs/adr/009-recuperacao-de-emergencia-do-super-admin.md),
  [010](../../../docs/adr/010-trilha-de-auditoria-de-plataforma.md)

| Bloco | Checklist | Verificação independente | Veredito | PR · commit |
| --- | --- | --- | --- | --- |
| B1 Contenção do super_admin | [checklist](../../../.checks/b1-contencao-super-admin.md) | [relatório](../../../.checks/b1-contencao-super-admin.verified.md) | FAIL só no C24, que dependia de decisão do dono; o dono aceitou em 2026-09-27 ([#235](https://github.com/KalleoPinheiro/vitta-flow/pull/235)) | [#234](https://github.com/KalleoPinheiro/vitta-flow/pull/234) · `e56d280` |
| B2 Segundo fator | [checklist](../../../.checks/b2-segundo-fator-super-admin.md) | [relatório](../../../.checks/b2-segundo-fator-super-admin.verified.md) | PASS | [#236](https://github.com/KalleoPinheiro/vitta-flow/pull/236) · `4affac7` |
| B3 Recuperação de emergência | [checklist](../../../.checks/b3-recuperacao-super-admin.md) | [relatório](../../../.checks/b3-recuperacao-super-admin.verified.md) | PASS | [#237](https://github.com/KalleoPinheiro/vitta-flow/pull/237) · `79182ed` |
| B4 Cadastro de clínicas e admins | [checklist](../../../.checks/b4-cadastro-clinicas.md) | [relatório](../../../.checks/b4-cadastro-clinicas.verified.md) | PASS | [#238](https://github.com/KalleoPinheiro/vitta-flow/pull/238) · `9a6319f` |
| B5 Suspensão e reativação | [checklist](../../../.checks/b5-suspensao-clinica.md) | [relatório](../../../.checks/b5-suspensao-clinica.verified.md) | PASS | [#239](https://github.com/KalleoPinheiro/vitta-flow/pull/239) · `17beaab` |
| B6 Auditoria de plataforma | [checklist](../../../.checks/b6-auditoria-plataforma.md) | [relatório](../../../.checks/b6-auditoria-plataforma.verified.md) | PASS | [#240](https://github.com/KalleoPinheiro/vitta-flow/pull/240) · `93b79dc` |
| B7 Parceiro por empresa | [checklist](../../../.checks/b7-parceiro-por-empresa.md) | [relatório](../../../.checks/b7-parceiro-por-empresa.verified.md) | PASS | [#241](https://github.com/KalleoPinheiro/vitta-flow/pull/241) · `832cd4e` |

Os 4 jobs de CI passaram em todos os PRs (AGENTS.md, regra 7).

## Depois da entrega

Lacunas não bloqueantes e decisões que sobraram viraram issues próprias:

- `ready-for-agent`: #242, #243 (P2), #244, #245, #246, #247, #252, #253.
- Decisão do dono: #248, #249 (depende da #220), #250, #251.
- Retenção da trilha de auditoria: #210, que depende de decisão jurídica.
