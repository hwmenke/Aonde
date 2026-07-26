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
 * @param {string} origem codigo IATA de origem (ex.: "GRU")
 * @param {string} destino codigo IATA de destino (ex.: "REC")
 * @returns {string}
 */
export function buildAviasalesSearchUrl(origem, destino) {
  const o = String(origem || "").toUpperCase();
  const d = String(destino || "").toUpperCase();
  return withMarker(`https://www.aviasales.com/search/${encodeURIComponent(o)}${encodeURIComponent(d)}`);
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
export function renderExitFlightPage({ origem, destino, searchUrl }) {
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

  return renderExitPage(syntheticOffer, { affiliateUrl: searchUrl, notaExtra: NOTA_CARTAO });
}
