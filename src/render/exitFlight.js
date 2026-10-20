// Interstitial de saida para uma BUSCA DE VOO por rota — nao e uma oferta
// especifica do catalogo (com preco e cia definidos), e a lista de resultados
// do parceiro (Aviasales) para origem -> destino. Existe porque a auditoria
// de usuarios apontou um buraco: na lista de voos (renderResultsPage, em
// htmlRenderer.js) o botao "Selecionar" pulava direto para o parceiro, sem
// passar pelo aviso "voce esta saindo do Aonde" que foi o ponto mais elogiado
// do site. Esta pagina fecha esse buraco: GET /saida/voo?origem=X&destino=Y
// (ver src/server.js) monta e serve o mesmo tipo de interstitial, so que para
// uma busca por rota em vez de uma oferta com id.
//
// Reaproveita renderExitPage() de htmlRenderer.js passando um "offer"
// SINTETICO (sem preco_centavos/is_erro_tarifa, entao normalizeContentOffer
// cuida dele) — isso evita duplicar o markup/CSS do card de saida, dos passos
// "o que esperar agora" e do bloco de ajuda, que ja cobrem: para onde a
// pessoa esta indo, que a reserva/pagamento acontece no parceiro (nao no
// Aonde) e que preco/disponibilidade podem mudar la.
//
// A UNICA lacuna do renderExitPage generico para este caso e o aviso sobre
// dados de cartao — como aqui a pessoa ainda vai ESCOLHER entre varias
// opcoes/agencias no parceiro (nao e uma oferta unica ja precificada), vale
// reforcar de forma explicita que o Aonde nunca ve nem guarda cartao. Isso
// entra pelo parametro `notaExtra` de renderExitPage.
//
// NOTA sobre a URL de busca do parceiro: buildAviasalesSearchUrl() abaixo e a
// UNICA implementacao no projeto. O htmlRenderer.js tinha uma versao privada
// (aviasalesSearch), mas ela ficou morta quando o botao "Selecionar" da lista
// de voos passou a apontar para /saida/voo em vez de ir direto ao parceiro —
// e foi removida de la. O marker de comissao vem da mesma fonte de sempre
// (getConfig().travelpayouts.marker).

import { getConfig } from "../config.js";
import { renderExitPage } from "./htmlRenderer.js";

function withMarker(url) {
  let marker = "";
  try {
    marker = (getConfig().travelpayouts && getConfig().travelpayouts.marker) || "";
  } catch {
    marker = "";
  }
  if (!marker) return url;
  return url + (url.includes("?") ? "&" : "?") + "marker=" + encodeURIComponent(marker);
}

/**
 * Monta a URL de busca do parceiro (Aviasales) para uma rota origem->destino.
 * Espera codigos IATA ja validados (3 letras) — quem chama (src/server.js)
 * valida antes.
 *
 * Formato documentado em "Aviasales affiliate links" (Travelpayouts):
 * ORIGEM + DDMM + DESTINO + DDMM + classe + passageiros.
 * Economia não leva letra de classe. Os dígitos seguintes são adultos
 * (obrigatório, 0–9), crianças (0–9) e bebês (0–9). Criança entra antes do
 * bebê; sem o zero de criança, o bebê seria lido como criança.
 * Ex.: 2 adultos, 2 crianças e 1 bebê em econômica = "221".
 * Um dígito a mais depois dos adultos (o antigo "1" de classe) seria uma criança.
 *
 * @param {string} origem codigo IATA de origem (ex.: "GRU")
 * @param {string} destino codigo IATA de destino (ex.: "REC")
 * @returns {string}
 */
function ddmm(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  return m ? `${m[3]}${m[2]}` : "";
}

function lerInteiro(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return { estado: "ausente" };
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return { estado: "invalido" };
  return { estado: "numero", n: Number(texto) };
}

function encaixa(lido, min, max, ausente) {
  if (lido.estado === "ausente") return ausente;
  if (lido.estado === "numero" && lido.n >= min && lido.n <= max) return lido.n;
  return null;
}

function juntarPedido(partes) {
  if (partes.length <= 1) return partes[0] || "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

function resumoPedido(adultos, criancas, bebes) {
  const partes = [];
  const add = (n, sing, plur) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? sing : plur}`);
  };
  add(adultos, "adulto", "adultos");
  add(criancas, "criança", "crianças");
  add(bebes, "bebê de colo", "bebês de colo");
  return juntarPedido(partes);
}

/**
 * Traduz o pedido para o sufixo documentado do Aviasales.
 * Categoria que não cabe num dígito (0–9) fica de fora do link, com aviso.
 */
export function passageirosAviasales(extras = {}) {
  const lidos = {
    adultos: lerInteiro(extras.adultos),
    criancas: lerInteiro(extras.criancas),
    bebes: lerInteiro(extras.bebes),
  };
  const explicito = Object.values(lidos).some((item) => item.estado !== "ausente");
  const adultos = encaixa(lidos.adultos, 1, 9, 1);
  const criancas = encaixa(lidos.criancas, 0, 9, 0);
  const bebes = encaixa(lidos.bebes, 0, 9, 0);
  const pedidoAdultos = lidos.adultos.estado === "numero" ? lidos.adultos.n : 1;
  const pedidoCriancas = lidos.criancas.estado === "numero" ? lidos.criancas.n : 0;
  const pedidoBebes = lidos.bebes.estado === "numero" ? lidos.bebes.n : 0;
  const criancasNoLink = adultos !== null && criancas !== null;
  const bebesNoLink = criancasNoLink && bebes !== null;
  const fora = [];
  if (lidos.adultos.estado !== "ausente" && adultos === null) fora.push("adultos");
  if (lidos.criancas.estado !== "ausente" && !criancasNoLink) fora.push("crianças");
  // Bebê sem o dígito de criança seria lido como criança. Se a criança pedida
  // não cabe no link, o bebê também fica de fora — mesmo que o número dele caiba.
  if (lidos.bebes.estado !== "ausente" && !bebesNoLink) fora.push("bebês");

  let sufixo = "";
  if (adultos !== null && criancas !== null && bebes !== null) {
    sufixo = String(adultos);
    if (criancas > 0 || bebes > 0) sufixo += String(criancas);
    if (bebes > 0) sufixo += String(bebes);
  } else if (adultos !== null && criancas !== null) {
    sufixo = String(adultos) + (criancas > 0 ? String(criancas) : "");
  } else if (adultos !== null) {
    sufixo = String(adultos);
  }

  const resumo = explicito ? resumoPedido(pedidoAdultos, pedidoCriancas, pedidoBebes) : "";
  const aviso = fora.length
    ? `O link do parceiro não inclui ${juntarPedido(fora)}: o formato documentado dele só aceita um dígito (0 a 9) em cada categoria. Antes de pagar, ajuste esses passageiros no site do parceiro.`
    : "";
  return { sufixo, resumo, aviso, explicito };
}

export function montarBuscaAviasales(origem, destino, extras = {}) {
  const o = String(origem || "").toUpperCase();
  const d = String(destino || "").toUpperCase();
  const ida = ddmm(extras.ida);
  const volta = ddmm(extras.volta);
  const pax = passageirosAviasales(extras);
  let trecho = `${o}${d}`;
  if (ida && volta && pax.sufixo) trecho = `${o}${ida}${d}${volta}${pax.sufixo}`;
  else if (!ida && !volta && pax.explicito && pax.sufixo) trecho = `${o}${d}${pax.sufixo}`;
  else if (ida && volta) trecho = `${o}${ida}${d}${volta}`;
  return {
    url: withMarker(`https://www.aviasales.com/search/${encodeURIComponent(trecho)}`),
    resumo: pax.resumo,
    aviso: pax.aviso,
  };
}

export function buildAviasalesSearchUrl(origem, destino, extras = {}) {
  return montarBuscaAviasales(origem, destino, extras).url;
}

// Frase adicional (nao coberta pelo card generico de renderExitPage): reforca
// que o Aonde nao processa nem guarda dado de cartao — a busca no parceiro
// ainda vai apresentar varias opcoes/agencias antes do pagamento.
const NOTA_CARTAO =
  "O Aonde não vê nem guarda os dados do seu cartão: você escolhe a opção e paga direto no site do parceiro.";

/**
 * Monta a pagina de saida (interstitial) para a busca de voos do parceiro
 * numa rota especifica, reaproveitando renderExitPage com um offer sintetico.
 * @param {{ origem: string, destino: string, searchUrl: string }} params
 * @returns {string} HTML completo da pagina
 */
export function renderExitFlightPage({
  origem,
  destino,
  searchUrl,
  ctaLabel = "Buscar esta rota no parceiro",
  resumoPax = "",
  avisoPax = "",
} = {}) {
  const o = String(origem || "").toUpperCase();
  const d = String(destino || "").toUpperCase();

  // Offer sintetico: sem preco_centavos/is_erro_tarifa -> renderExitPage cai
  // no ramo normalizeContentOffer (pensado para dados ja "prontos", sem
  // formatacao de centavos). "cia" vira o nome do parceiro no titulo — usamos
  // "Aviasales" (o nome real do parceiro), exatamente o tipo de "nome em
  // ingles" que a auditoria apontou como confuso sem aviso previo.
  const syntheticOffer = {
    id: "",
    origem: o,
    destino: d,
    cidade: `voos ${o} → ${d}`,
    cia: "Aviasales",
  };

  const notas = [NOTA_CARTAO];
  if (resumoPax) notas.push(`Passageiros desta busca: ${resumoPax}.`);
  if (avisoPax) notas.push(avisoPax);
  else if (resumoPax) {
    notas.push("O link do parceiro abre com essa quantidade. Confira os passageiros no site dele antes de pagar.");
  }
  return renderExitPage(syntheticOffer, { affiliateUrl: searchUrl, notaExtra: notas.join(" "), ctaLabel });
}
