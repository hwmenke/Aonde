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

import { escapeHtml, formatBRL } from "../render/texto.js";
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
    `Este e-mail foi enviado para ${emailSeguro} porque este endereço está (ou pediu para estar) nos alertas de preço do Aonde.<br>` +
    `<a href="${unsubHref}" style="color:${COR_LINK};font-weight:bold;">Cancelar inscrição</a>` +
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
    `<p style="margin:16px 0 0 0;">Não quer mais receber estes e-mails? ` +
    `<a href="${href}" style="color:${COR_LINK};">Cancelar inscrição</a> — abre a página de confirmação, sem perguntas.</p>`
  );
}

function linhaDescadastroTexto(unsubscribeUrl) {
  return `Cancelar inscrição (confirma numa página, sem perguntas): ${safeUrl(unsubscribeUrl)}`;
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
    alvo.precoAlvoCentavos != null ? ` até ${formatBRL(alvo.precoAlvoCentavos)}` : "";

  const assunto = sanitizarAssunto("Confirme sua inscrição nos alertas de preço do Aonde");

  const textoPlano = [
    "Aonde — confirme sua inscrição",
    "",
    `Este endereço (${email}) pediu para receber alertas de preço de passagens aéreas saindo de ${alvo.origemLabel}${rotaTexto}${precoTexto}.`,
    "",
    "Isso só começa a valer depois que você confirmar clicando no link abaixo. Sem confirmar, você não recebe nenhum alerta — nem mais e-mails deste tipo.",
    "",
    `Confirmar inscrição: ${confirmHref}`,
    "",
    "O que você vai receber depois de confirmado:",
    "- E-mails só quando encontrarmos um preço que bate com o que você pediu. Sem frequência fixa, sem spam.",
    "- Você pode cancelar quando quiser, em dois cliques e sem perguntas.",
    "",
    `Não foi você quem pediu isso? Ignore este e-mail: sem confirmação, nada acontece. Se preferir garantir que nunca mais chega nada, cancele agora: ${unsubHref}`,
    "",
    "--",
    "Aonde — comparador de passagens aéreas",
    linhaDescadastroTexto(unsubscribeUrl),
  ].join("\n");

  const corpoHtml =
    `<p style="margin:0 0 12px 0;">Este endereço (<strong>${escapeHtml(email)}</strong>) pediu para receber alertas de preço de passagens aéreas saindo de <strong>${escapeHtml(alvo.origemLabel)}</strong>` +
    (alvo.temRotaEspecifica ? ` com destino a <strong>${escapeHtml(alvo.destinoLabel)}</strong>` : "") +
    (alvo.precoAlvoCentavos != null ? ` até <strong>${escapeHtml(formatBRL(alvo.precoAlvoCentavos))}</strong>` : "") +
    `.</p>` +
    `<p style="margin:0 0 16px 0;">Isso só começa a valer depois que você confirmar clicando no botão abaixo. <strong>Sem confirmar, você não recebe nenhum alerta</strong> — nem mais e-mails deste tipo.</p>` +
    `<p style="margin:0 0 20px 0;">` +
    `<a href="${escapeHtml(confirmHref)}" style="display:inline-block;background-color:${COR_LINK};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Confirmar inscrição</a>` +
    `</p>` +
    `<p style="margin:0 0 4px 0;font-size:13px;color:${COR_MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${escapeHtml(confirmHref)}</p>` +
    `<p style="margin:16px 0 0 0;">Depois de confirmado, você só recebe e-mail quando encontrarmos um preço que bate com o que você pediu — sem frequência fixa, sem spam.</p>` +
    `<p style="margin:16px 0 0 0;">Não foi você quem pediu isso? Pode ignorar: sem confirmação, nada acontece. Se preferir garantir que nunca mais chega nada, use o link abaixo.</p>` +
    linhaDescadastroHtml(unsubscribeUrl);

  const html = montarHtml({
    tituloPreheader: "Confirme sua inscrição para começar a receber alertas de preço.",
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
      comparacaoTexto = `Isso é ${diffPct}% abaixo da média recente que vimos nessa rota (${medioLabel}).`;
    } else if (diffPct < 0) {
      comparacaoTexto = `Isso fica ${Math.abs(diffPct)}% acima da média recente nessa rota (${medioLabel}) — mesmo assim bateu o preço que você pediu.`;
    } else {
      comparacaoTexto = `Isso está na média recente que vimos nessa rota (${medioLabel}).`;
    }
  } else {
    comparacaoTexto = "Ainda não temos histórico suficiente dessa rota para comparar com a média.";
  }
  comparacaoHtml = escapeHtml(comparacaoTexto);

  const rotaLabel = `${alvo.origemLabel} → ${alvo.destinoLabel || (destino ? String(destino).toUpperCase() : "")}`;

  const assunto = sanitizarAssunto(`Alerta de preço: ${rotaLabel} por ${precoLabel}`);

  const textoPlano = [
    "Aonde — encontramos um preço que bate com o seu alerta",
    "",
    `Rota: ${rotaLabel}`,
    `Preço encontrado: ${precoLabel}`,
    comparacaoTexto,
    "",
    `Ver oferta: ${offerHref}`,
    "",
    "Importante: este preço foi visto no site do parceiro no momento da busca e pode mudar a qualquer momento — inclusive entre agora e você clicar no link. O preço final é sempre o que aparecer lá, na hora da compra. O Aonde não processa pagamento nem emite passagem: a compra é feita direto com o parceiro.",
    "",
    "--",
    "Aonde — comparador de passagens aéreas",
    linhaDescadastroTexto(unsubscribeUrl),
  ].join("\n");

  const corpoHtml =
    `<p style="margin:0 0 12px 0;">Encontramos um preço que bate com o alerta que você pediu para <strong>${escapeHtml(rotaLabel)}</strong>.</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;width:100%;background-color:#f9fafb;border-radius:6px;">` +
    `<tr><td style="padding:14px 16px;">` +
    `<div style="font-size:13px;color:${COR_MUTED};">Preço encontrado</div>` +
    `<div style="font-size:24px;font-weight:bold;color:${COR_TEXTO};">${escapeHtml(precoLabel)}</div>` +
    `<div style="font-size:13px;color:${COR_MUTED};margin-top:4px;">${comparacaoHtml}</div>` +
    `</td></tr>` +
    `</table>` +
    `<p style="margin:0 0 20px 0;">` +
    `<a href="${escapeHtml(offerHref)}" style="display:inline-block;background-color:${COR_LINK};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">Ver oferta</a>` +
    `</p>` +
    `<p style="margin:0 0 4px 0;font-size:13px;color:${COR_MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${escapeHtml(offerHref)}</p>` +
    `<p style="margin:16px 0 0 0;">Este preço foi visto no site do parceiro no momento da busca e <strong>pode mudar</strong> a qualquer momento — o preço final é sempre o que aparecer lá, na hora da compra. O Aonde não processa pagamento nem emite passagem: a compra é feita direto com o parceiro (cia aérea ou agência).</p>` +
    linhaDescadastroHtml(unsubscribeUrl);

  const html = montarHtml({
    tituloPreheader: `${rotaLabel} por ${precoLabel}. O preço se confirma no site do parceiro.`,
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
  const precoTexto = alvo.precoAlvoCentavos != null ? ` até ${formatBRL(alvo.precoAlvoCentavos)}` : "";

  const assunto = sanitizarAssunto("Inscrição confirmada — você está nos alertas de preço do Aonde");

  const textoPlano = [
    "Aonde — inscrição confirmada",
    "",
    `Pronto: ${email} está cadastrado para receber alertas de ${rotaTexto}${precoTexto}.`,
    "",
    "O que esperar:",
    "- Você só recebe e-mail quando encontrarmos um preço que bate com o que você pediu. Não existe frequência fixa (não é diário nem semanal) — é quando surge, não quando completa um calendário.",
    "- Cada alerta mostra o preço encontrado, como ele se compara à média da rota, e o link para a oferta.",
    "- O preço final é sempre confirmado no site do parceiro, na hora da compra — o Aonde não processa pagamento nem emite passagem.",
    "- Se algo der errado na compra (cancelamento, reembolso, alteração), isso é negociado direto com o parceiro que vendeu a passagem, não com o Aonde. É assim em qualquer comparador de preços — preferimos dizer isso agora a deixar você descobrir depois.",
    "",
    "Cancelar quando quiser, sem perguntas:",
    linhaDescadastroTexto(unsubscribeUrl),
    "",
    "--",
    "Aonde — comparador de passagens aéreas",
  ].join("\n");

  const corpoHtml =
    `<p style="margin:0 0 12px 0;">Pronto: <strong>${escapeHtml(email)}</strong> está cadastrado para receber alertas de ${escapeHtml(rotaTexto)}${escapeHtml(precoTexto)}.</p>` +
    `<p style="margin:0 0 8px 0;font-weight:bold;">O que esperar</p>` +
    `<ul style="margin:0 0 16px 0;padding-left:18px;">` +
    `<li style="margin-bottom:6px;">Você só recebe e-mail quando encontrarmos um preço que bate com o que você pediu. Sem frequência fixa — não é diário nem semanal.</li>` +
    `<li style="margin-bottom:6px;">Cada alerta mostra o preço encontrado, como ele se compara à média da rota, e o link para a oferta.</li>` +
    `<li style="margin-bottom:6px;">O preço final é sempre confirmado no site do parceiro, na hora da compra — o Aonde não processa pagamento nem emite passagem.</li>` +
    `<li>Se algo der errado na compra (cancelamento, reembolso, alteração), isso é negociado direto com o parceiro que vendeu a passagem, não com o Aonde. Preferimos dizer isso agora a deixar você descobrir depois.</li>` +
    `</ul>` +
    linhaDescadastroHtml(unsubscribeUrl);

  const html = montarHtml({
    tituloPreheader: "Inscrição confirmada. Veja o que esperar dos próximos alertas.",
    corpoHtml,
    unsubscribeUrl,
    email,
  });

  return { assunto, textoPlano, html };
}
