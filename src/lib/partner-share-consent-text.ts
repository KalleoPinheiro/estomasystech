/**
 * Texto do consentimento de compartilhamento com o parceiro (#292, #216,
 * ADR-030). Trocar o texto muda o hash gravado no aceite, e o consentimento
 * anterior deixa de valer (o paciente aceita de novo, e a equipe refaz o de
 * papel, #310): texto e versão trocam sempre **juntos**.
 *
 * Fixo, sem dados da clínica nem do parceiro: o registro já guarda o
 * `partnerId`, e o hash precisa ser o mesmo para todo paciente.
 *
 * Texto redigido sem revisão jurídica (`LEGAL_REVIEW_PENDING`).
 */
export const PARTNER_SHARE_CONSENT_TEXT_VERSION = 'v1';

export const PARTNER_SHARE_CONSENT_TEXT = `CONSENTIMENTO PARA COMPARTILHAR DADOS CLÍNICOS COM O MÉDICO QUE ME INDICOU (${PARTNER_SHARE_CONSENT_TEXT_VERSION})

1. O que autorizo
Autorizo a clínica a mostrar ao médico parceiro que me indicou, pelo portal do parceiro, as
minhas consultas, as minhas condições em acompanhamento (feridas e estomias) e as avaliações
registradas nos últimos 24 meses, para que ele acompanhe a evolução do meu tratamento.

2. Específico para esse médico
Esta autorização vale só para o médico que me indicou. Se eu mudar de médico indicador, a
autorização não passa para o novo.

3. Posso retirar
Posso retirar esta autorização a qualquer momento, pelo portal ou pedindo à equipe da
clínica, sem prejuízo do meu atendimento. Depois da retirada, o médico deixa de ver os meus
dados clínicos e passa a ver apenas que fui atendido(a).

4. Sem esta autorização
Se eu não autorizar, o médico que me indicou vê apenas que fui atendido(a), sem consultas,
condições ou avaliações.

5. Prazo
A autorização vale até eu retirá-la. A janela de visualização é sempre de 24 meses para trás.

6. Mais informações
O Aviso de Privacidade da clínica explica como os meus dados são tratados e como falar com o
encarregado pelos dados.`;

/** Texto e versão vigentes, juntos, para os casos de uso. */
export const PARTNER_SHARE_CONSENT = {
  text: PARTNER_SHARE_CONSENT_TEXT,
  version: PARTNER_SHARE_CONSENT_TEXT_VERSION,
} as const;
