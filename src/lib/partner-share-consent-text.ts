/**
 * Texto do consentimento de compartilhamento com o parceiro (#292).
 *
 * PLACEHOLDER: o texto final vem do jurídico (#216). Trocar o texto muda o
 * hash gravado no aceite, e o consentimento anterior deixa de valer (o
 * paciente aceita de novo). Ao receber o texto do jurídico, troque o texto
 * **e** a versão juntos.
 *
 * Fixo, sem interpolar o nome do parceiro: o registro já guarda o
 * `partnerId`, e o hash precisa ser o mesmo para todo paciente.
 */
export const PARTNER_SHARE_CONSENT_TEXT_VERSION = 'v0-placeholder';

export const PARTNER_SHARE_CONSENT_TEXT = `CONSENTIMENTO PARA COMPARTILHAR DADOS CLÍNICOS COM O MÉDICO QUE ME INDICOU (${PARTNER_SHARE_CONSENT_TEXT_VERSION})

[Texto provisório: a redação final será definida pelo jurídico da clínica.]

Autorizo a clínica a mostrar ao médico parceiro que me indicou, pelo portal do
parceiro, as minhas condições em acompanhamento (feridas e estomias) e as
avaliações registradas nos últimos 24 meses, para que ele acompanhe a evolução
do meu tratamento.

Sei que esta autorização é específica para esse médico e que posso revogá-la a
qualquer momento pelo portal ou pedindo à equipe da clínica, sem prejuízo do meu
atendimento. Sem esta autorização, o médico vê apenas que fui atendido(a).`;

/** Texto e versão vigentes, juntos, para os casos de uso. */
export const PARTNER_SHARE_CONSENT = {
  text: PARTNER_SHARE_CONSENT_TEXT,
  version: PARTNER_SHARE_CONSENT_TEXT_VERSION,
} as const;
