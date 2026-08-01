// Templates de e-mail do Aonde.
//
// Funcoes PURAS: sem rede, sem I/O, sem side-effect. Cada uma recebe dados ja
// resolvidos (links prontos, precos em centavos) e devolve
// { assunto, textoPlano, html }. Duas coisas ficam FORA de proposito deste
// arquivo, porque nao existem ainda no projeto:
//   1) quem MONTA os links (confirmUrl/unsubscribeUrl/offerUrl a partir de
//      config.siteUrl + token) — isso e responsabilidade de quem chama;
//   2) quem de fato ENVIA o e-mail (SMTP/SendGrid/SES/etc). Nao ha provedor
//      plugado neste projeto (ver src/newsletter/alertMatcher.js e seu
//      setSenderImpl) — um worker de envio real receberia o objeto devolvido
//      aqui e faria a chamada de rede, fora deste modulo.
//
// Regras seguidas em TODO template (LGPD + honestidade — valor central do
// produto, ver CLAUDE.md):
//   - link de descadastro sempre VISIVEL: corpo normal, cor de link, nao
//     escondido num rodape cinza-claro de fonte minuscula;
//   - sempre ha versao em TEXTO PLANO, alem do HTML (muita gente le em
//     cliente que bloqueia HTML, ou prefere assim);
//   - HTML de e-mail e diferente de HTML de site: so tabela + estilo inline,
//     zero CSS externo, zero JavaScript;
//   - todo dado que pode ter vindo do usuario (e-mail, codigos IATA crus)
//     passa por escapeHtml antes de entrar no HTML;
//   - sem urgencia falsa ("ultimas horas", "so hoje", "corra") — o tom e o do
//     site: direto, e diz o que nao sabe.

import { escapeHtml, formatBRL } from "../render/htmlRenderer.js";
import { describeAlertTarget } from "./subscriberStore.js";

const COR_TEXTO = "#1f2937";
const COR_MUTED = "#6b7280";
const COR_LINK = "#0f5fa8";
const COR_BORDA = "#e5e7eb";
const COR_FUNDO_PAGINA = "#f3f4f6";

// Cabecalhos de e-mail (assunto) nao devem carregar quebra de linha — quem
// enviar via SMTP cru poderia sofrer header injection se a gente nao
// sanitizar aqui. Nao e escapeHtml (isto nao e HTML), so remove CR/LF.
function sanitizarAssunto(str) {
  return String(str || "").replace(/[\r\n]+/g, " ").trim();
}

// Nunca deixa um link vazio virar href="" ou aparecer como "undefined" no
// texto plano — degrada para string vazia, visivel no proprio conteudo (mais
// facil de notar um bug de integracao do que silenciosamente engolir).
function safeUrl(url) {
  return typeof url === "string" ? url.trim() : "";
}

/**
 * Monta a "casca" HTML comum aos e-mails do Aonde: tabela unica, largura
 * maxima 560px, estilo tudo inline (compatibilidade com clientes de e-mail),
 * sem <style> externo e sem <script>. O link de descadastro aparece DUAS
 * vezes: uma no corpo (parametro `rodapeVisivelHtml`, cor normal de link) e
 * outra no rodape — nunca so no rodape cinza.
 */
function montarHtml({ tituloPreheader, corpoHtml, unsubscribeUrl, email }) {
  const preheader = escapeHtml(tituloPreheader || "");
  const unsubHref = escapeHtml(safeUrl(unsubscribeUrl));
  const emailSeguro = escapeHtml(email || "");
  return (
    `<!doctype html>` +
    `<html lang="pt-BR">` +
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Aonde</title></head>` +
    `<body style="margin:0;padding:0;background-color:${COR_FUNDO_PAGINA};font-family:Arial,Helvetica,sans-serif;">` +
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COR_FUNDO_PAGINA};padding:24px 0;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;">` +
    `<tr><td style="padding:24px 28px 4px 28px;font-size:20px;font-weight:bold;color:${COR_TEXTO};">Aonde</td></tr>` +
    `<tr><td style="padding:4px 28px 20px 28px;font-size:15px;line-height:1.6;color:${COR_TEXTO};">${corpoHtml}</td></tr>` +
    `<tr><td style="padding:16px 28px 28px 28px;border-top:1px solid ${COR_BORDA};font-size:13px;line-height:1.5;color:${COR_MUTED};">` +
    `Este e-mail foi enviado para ${emailSeguro} porque este endereco esta (ou pediu para estar) nos alertas de preco do Aonde.<br>` +
    `<a href="${unsubHref}" style="color:${COR_LINK};font-weight:bold;">Cancelar inscricao</a>` +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}

// Paragrafo do corpo (nao do rodape) com o link de descadastro em cor e
// tamanho normais — a parte "visivel" da regra de descadastro.
function linhaDescadastroHtml(unsubscribeUrl) {
  const href = escapeHtml(safeUrl(unsubscribeUrl));
  return (
    `<p style="margin:16px 0 0 0;">Nao quer mais receber estes e-mails? ` +
    `<a href="${href}" style="color:${COR_LINK};">Cancelar inscricao</a> — abre a pagina de confirmacao, sem perguntas.</p>`
  );
}

function linhaDescadastroTexto(unsubscribeUrl) {
  return `Cancelar inscricao (confirma numa pagina, sem perguntas): ${safeUrl(unsubscribeUrl)}`;
}

// ---------------------------------------------------------------------------
// 1) Confirmacao de inscricao (double opt-in)
// ---------------------------------------------------------------------------

/**
 * E-mail de confirmacao do double opt-in: precisa deixar claro que, sem
 * clicar no link, a pessoa NAO recebe mais nada (nem alerta, nem newsletter).
 *
 * @param {{
 *   email: string,
 *   origem: string,
 *   destino?: string|null,
 *   precoAlvoCentavos?: number|null,
 *   confirmUrl: string,
 *   unsubscribeUrl: string,
 * }} input
 * @returns {{assunto: string, textoPlano: string, html: string}}
 */
export function buildConfirmationEmail({
  email,
  origem,
  destino = null,
  precoAlvoCentavos = null,
  confirmUrl,
  unsubscribeUrl,
} = {}) {
  const alvo = describeAlertTarget(origem, { destino, preco_alvo_centavos: precoAlvoCentavos });
  const confirmHref = safeUrl(confirmUrl);
  const unsubHref = safeUrl(unsubscribeUrl);

  const rotaTexto = alvo.temRotaEspecifica
    ? ` com destino a ${alvo.destinoLabel}`
    : "";
  const precoTexto =
    alvo.precoAlvoCentavos != null ? ` ate ${formatBRL(alvo.precoAlvoCentavos)}` : "";

  const assunto = sanitizarAssunto("Confirme sua inscricao nos alertas de preco do Aonde");

  const textoPlano = [
    "Aonde — confirme sua inscricao",
    "",
    `Este endereco (${email}) pediu para receber alertas de preco de passagens aereas saindo de ${alvo.origemLabel}${rotaTexto}${precoTexto}.`,
    "",
    "Isso so comeca a valer depois que voce confirmar clicando no link abaixo. SEM confirmar, voce nao recebe nenhum alerta — nem mais e-mails deste tipo.",
    "",
    `Confirmar inscricao: ${confirmHref}`,
    "",
    "O que voce vai receber depois de confirmado:",
    "- E-mails so quando encontrarmos um preco que bate com o que voce pediu. Sem frequencia fixa, sem spam.",
    "- Voce pode cancelar quando quiser, em dois cliques e sem perguntas.",
    "",
    `Nao foi voce quem pediu isso? Ignore este e-mail: sem confirmacao, nada acontece. Se preferir garantir que nunca mais chega nada, cancele agora: ${unsubHref}`,
    "",
    "--",
    "Aonde — comparador de passagens aereas",
    linhaDescadastroTexto(unsubscribeUrl),
  ].join("\n");

  const corpoHtml =
    `<p style="margin:0 0 12px 0;">Este endereco (<strong>${escapeHtml(email)}</strong>) pediu para receber alertas de preco de passagens aereas saindo de <strong>${escapeHtml(alvo.origemLabel)}</strong>` +
    (alvo.temRotaEspecifica ? ` com destino a <strong>${escapeHtml(alvo.destinoLabel)}</strong>` : "") +
    (alvo.precoAlvoCentavos != null ? ` ate <strong>${escapeHtml(formatBRL(alvo.precoAlvoCentavos))}</strong>` : "") +
    `.</p>` +
    `<p style="margin:0 0 16px 0;">Isso so comeca a valer depois que voce confirmar clicando no botao abaixo. <strong>Sem confirmar, voce nao recebe nenhum alerta</strong> — nem mais e-mails deste tipo.</p>` +
    `<p style="margin:0 0 20px 0;">` +
    `<a href="${escapeHtml(confirmHref)}" style="display:inline-block;background-color:${COR_LINK};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Confirmar inscricao</a>` +
    `</p>` +
    `<p style="margin:0 0 4px 0;font-size:13px;color:${COR_MUTED};">Se o botao nao funcionar, copie e cole este endereco no navegador:<br>${escapeHtml(confirmHref)}</p>` +
    `<p style="margin:16px 0 0 0;">Depois de confirmado, voce so recebe e-mail quando encontrarmos um preco que bate com o que voce pediu — sem frequencia fixa, sem spam.</p>` +
    `<p style="margin:16px 0 0 0;">Nao foi voce quem pediu isso? Pode ignorar: sem confirmacao, nada acontece. Se preferir garantir que nunca mais chega nada, use o link abaixo.</p>` +
    linhaDescadastroHtml(unsubscribeUrl);

  const html = montarHtml({
    tituloPreheader: "Confirme sua inscricao para comecar a receber alertas de preco.",
    corpoHtml,
    unsubscribeUrl,
    email,
  });

  return { assunto, textoPlano, html };
}

// ---------------------------------------------------------------------------
// 2) Alerta de preco disparado
// ---------------------------------------------------------------------------

/**
 * E-mail disparado quando uma oferta casa com uma AlertRule confirmada.
 * Precisa dizer explicitamente que o preco e confirmado no site do parceiro
 * e pode mudar — o Aonde nao processa a compra.
 *
 * @param {{
 *   email: string,
 *   origem: string,
 *   destino: string,
 *   precoCentavos: number,
 *   precoMedioCentavos?: number|null,
 *   offerUrl: string,
 *   unsubscribeUrl: string,
 * }} input
 * @returns {{assunto: string, textoPlano: string, html: string}}
 */
export function buildPriceAlertEmail({
  email,
  origem,
  destino,
  precoCentavos,
  precoMedioCentavos = null,
  offerUrl,
  unsubscribeUrl,
} = {}) {
  const alvo = describeAlertTarget(origem, { destino });
  const offerHref = safeUrl(offerUrl);
  const precoLabel = formatBRL(precoCentavos);

  let comparacaoTexto;
  let comparacaoHtml;
  if (typeof precoMedioCentavos === "number" && precoMedioCentavos > 0 && typeof precoCentavos === "number") {
    const diffPct = Math.round((1 - precoCentavos / precoMedioCentavos) * 100);
    const medioLabel = formatBRL(precoMedioCentavos);
    if (diffPct > 0) {
      comparacaoTexto = `Isso e ${diffPct}% abaixo da media recente que vimos nessa rota (${medioLabel}).`;
    } else if (diffPct < 0) {
      comparacaoTexto = `Isso fica ${Math.abs(diffPct)}% acima da media recente nessa rota (${medioLabel}) — mesmo assim bateu o preco que voce pediu.`;
    } else {
      comparacaoTexto = `Isso esta na media recente que vimos nessa rota (${medioLabel}).`;
    }
  } else {
    comparacaoTexto = "Ainda nao temos historico suficiente dessa rota para comparar com a media.";
  }
  comparacaoHtml = escapeHtml(comparacaoTexto);

  const rotaLabel = `${alvo.origemLabel} → ${alvo.destinoLabel || (destino ? String(destino).toUpperCase() : "")}`;

  const assunto = sanitizarAssunto(`Alerta de preco: ${rotaLabel} por ${precoLabel}`);

  const textoPlano = [
    "Aonde — encontramos um preco que bate com o seu alerta",
    "",
    `Rota: ${rotaLabel}`,
    `Preco encontrado: ${precoLabel}`,
    comparacaoTexto,
    "",
    `Ver oferta: ${offerHref}`,
    "",
    "Importante: este preco foi visto no site do parceiro no momento da busca e pode mudar a qualquer momento — inclusive entre agora e voce clicar no link. O preco final e sempre o que aparecer la, na hora da compra. O Aonde nao processa pagamento nem emite passagem: a compra e feita direto com o parceiro.",
    "",
    "--",
    "Aonde — comparador de passagens aereas",
    linhaDescadastroTexto(unsubscribeUrl),
  ].join("\n");

  const corpoHtml =
    `<p style="margin:0 0 12px 0;">Encontramos um preco que bate com o alerta que voce pediu para <strong>${escapeHtml(rotaLabel)}</strong>.</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;width:100%;background-color:#f9fafb;border-radius:6px;">` +
    `<tr><td style="padding:14px 16px;">` +
    `<div style="font-size:13px;color:${COR_MUTED};">Preco encontrado</div>` +
    `<div style="font-size:24px;font-weight:bold;color:${COR_TEXTO};">${escapeHtml(precoLabel)}</div>` +
    `<div style="font-size:13px;color:${COR_MUTED};margin-top:4px;">${comparacaoHtml}</div>` +
    `</td></tr>` +
    `</table>` +
    `<p style="margin:0 0 20px 0;">` +
    `<a href="${escapeHtml(offerHref)}" style="display:inline-block;background-color:${COR_LINK};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Ver oferta</a>` +
    `</p>` +
    `<p style="margin:0 0 4px 0;font-size:13px;color:${COR_MUTED};">Se o botao nao funcionar, copie e cole este endereco no navegador:<br>${escapeHtml(offerHref)}</p>` +
    `<p style="margin:16px 0 0 0;">Este preco foi visto no site do parceiro no momento da busca e <strong>pode mudar</strong> a qualquer momento — o preco final e sempre o que aparecer la, na hora da compra. O Aonde nao processa pagamento nem emite passagem: a compra e feita direto com o parceiro (cia aerea ou agencia).</p>` +
    linhaDescadastroHtml(unsubscribeUrl);

  const html = montarHtml({
    tituloPreheader: `${rotaLabel} por ${precoLabel}. Preco confirma no site do parceiro.`,
    corpoHtml,
    unsubscribeUrl,
    email,
  });

  return { assunto, textoPlano, html };
}

// ---------------------------------------------------------------------------
// 3) Boas-vindas depois de confirmar
// ---------------------------------------------------------------------------

/**
 * E-mail enviado logo depois que o double opt-in e confirmado. Define
 * expectativa honesta (frequencia, o que o Aonde faz e nao faz) e reforca o
 * cancelamento sem perguntas (o link abre uma pagina de confirmacao).
 *
 * @param {{
 *   email: string,
 *   origem: string,
 *   destino?: string|null,
 *   precoAlvoCentavos?: number|null,
 *   unsubscribeUrl: string,
 * }} input
 * @returns {{assunto: string, textoPlano: string, html: string}}
 */
export function buildWelcomeEmail({
  email,
  origem,
  destino = null,
  precoAlvoCentavos = null,
  unsubscribeUrl,
} = {}) {
  const alvo = describeAlertTarget(origem, { destino, preco_alvo_centavos: precoAlvoCentavos });

  const rotaTexto = alvo.temRotaEspecifica
    ? `voos saindo de ${alvo.origemLabel} para ${alvo.destinoLabel}`
    : `voos saindo de ${alvo.origemLabel}`;
  const precoTexto = alvo.precoAlvoCentavos != null ? ` ate ${formatBRL(alvo.precoAlvoCentavos)}` : "";

  const assunto = sanitizarAssunto("Inscricao confirmada — voce esta nos alertas de preco do Aonde");

  const textoPlano = [
    "Aonde — inscricao confirmada",
    "",
    `Pronto: ${email} esta cadastrado para receber alertas de ${rotaTexto}${precoTexto}.`,
    "",
    "O que esperar:",
    "- Voce so recebe e-mail quando encontrarmos um preco que bate com o que voce pediu. Nao existe frequencia fixa (nao e diario nem semanal) — e quando surge, nao quando completa um calendario.",
    "- Cada alerta mostra o preco encontrado, como ele se compara a media da rota, e o link para a oferta.",
    "- O preco final e sempre confirmado no site do parceiro, na hora da compra — o Aonde nao processa pagamento nem emite passagem.",
    "- Se algo der errado na compra (cancelamento, reembolso, alteracao), isso e negociado direto com o parceiro que vendeu a passagem, nao com o Aonde. E assim em qualquer comparador de precos — preferimos dizer isso agora a deixar voce descobrir depois.",
    "",
    "Cancelar quando quiser, sem perguntas:",
    linhaDescadastroTexto(unsubscribeUrl),
    "",
    "--",
    "Aonde — comparador de passagens aereas",
  ].join("\n");

  const corpoHtml =
    `<p style="margin:0 0 12px 0;">Pronto: <strong>${escapeHtml(email)}</strong> esta cadastrado para receber alertas de ${escapeHtml(rotaTexto)}${escapeHtml(precoTexto)}.</p>` +
    `<p style="margin:0 0 8px 0;font-weight:bold;">O que esperar</p>` +
    `<ul style="margin:0 0 16px 0;padding-left:18px;">` +
    `<li style="margin-bottom:6px;">Voce so recebe e-mail quando encontrarmos um preco que bate com o que voce pediu. Sem frequencia fixa — nao e diario nem semanal.</li>` +
    `<li style="margin-bottom:6px;">Cada alerta mostra o preco encontrado, como ele se compara a media da rota, e o link para a oferta.</li>` +
    `<li style="margin-bottom:6px;">O preco final e sempre confirmado no site do parceiro, na hora da compra — o Aonde nao processa pagamento nem emite passagem.</li>` +
    `<li>Se algo der errado na compra (cancelamento, reembolso, alteracao), isso e negociado direto com o parceiro que vendeu a passagem, nao com o Aonde. Preferimos dizer isso agora a deixar voce descobrir depois.</li>` +
    `</ul>` +
    linhaDescadastroHtml(unsubscribeUrl);

  const html = montarHtml({
    tituloPreheader: "Inscricao confirmada. Veja o que esperar dos proximos alertas.",
    corpoHtml,
    unsubscribeUrl,
    email,
  });

  return { assunto, textoPlano, html };
}
