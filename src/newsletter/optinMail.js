// ---------------------------------------------------------------------------
// E-MAIL DE CONFIRMACAO DO DOUBLE OPT-IN — a ponte entre o formulario do site
// e o envio.
//
// O formulario sempre prometeu "enviamos um link de confirmacao", mas nada
// chamava o template nem o sender: sem esta ponte, a pessoa se inscrevia, via
// "confira seu e-mail" e o e-mail nunca saia. Aqui o servidor passa a enviar de
// verdade quando ha provedor configurado (AONDE_EMAIL_PROVIDER, ver sender.js)
// e, quando NAO ha, diz isso com todas as letras em vez de fingir.
//
// Nao adiciona provedor nem chave: reaproveita o que sender.js ja le do ambiente.
// ---------------------------------------------------------------------------

import { buildConfirmationEmail } from "./emailTemplates.js";
import { enviarEmail, provedorConfigurado } from "./sender.js";

/**
 * True quando ha um provedor de e-mail utilizavel. E uma propriedade GLOBAL do
 * servidor (nao depende do e-mail informado), entao pode ser dita a qualquer
 * visitante sem revelar quem ja esta inscrito.
 */
export function envioDeEmailDisponivel() {
  const prov = provedorConfigurado();
  return !!prov && !prov.erro;
}

/**
 * Envia o link de confirmacao. Nunca lanca. Quem chama nao deve esperar:
 * enviarEmail repete falhas temporarias com espera.
 *
 * @returns {Promise<{ok:boolean, estado:string}>}
 */
export async function enviarConfirmacaoOptin({ subscriber, token, baseUrl }) {
  try {
    const base = String(baseUrl || "").replace(/\/+$/, "");
    const pending = (subscriber && subscriber.pending_alert) || {};
    const { assunto, textoPlano, html } = buildConfirmationEmail({
      email: subscriber.email,
      origem: subscriber.origem_preferida,
      destino: pending.destino || null,
      precoAlvoCentavos: pending.preco_alvo_centavos || null,
      confirmUrl: `${base}/api/newsletter/confirm?token=${encodeURIComponent(token)}`,
      unsubscribeUrl: `${base}/api/newsletter/unsubscribe?email=${encodeURIComponent(subscriber.email)}`,
    });
    return await enviarEmail({ para: subscriber.email, assunto, textoPlano, html });
  } catch (err) {
    return { ok: false, estado: "erro", motivo: (err && err.message) || String(err) };
  }
}
