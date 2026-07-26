// Parceiros Promo / Passagens Promo (grupo Amo Promo)
//
// NAO HA API PUBLICA DOCUMENTADA para geracao de links (ver
// docs/PESQUISA-PARCEIROS.md). A geracao e manual, feita no Portal do
// Afiliado (parceirospromo.com.br), apos aprovacao do cadastro (nao
// garantida) e recebimento do codigo de afiliado (FRANQ) por e-mail. Este
// modulo NAO inventa nenhum formato de parametro de URL: ele apenas repassa
// o link ja gerado manualmente. Como cada link e gerado por rota/oferta no
// portal, oferecemos um pequeno registro (PASSAGENS_PROMO_TRACKED_LINKS_JSON)
// para mapear offerId/rota -> link ja traqueado, alem do fallback global
// (PASSAGENS_PROMO_TRACKED_LINK).

import { getConfig } from "../config.js";
import { resolveTrackedLink } from "../manualLinkRegistry.js";

/**
 * getDealLink("passagens-promo", options)
 * options:
 *   - trackedLink: opcionalmente sobrescreve qualquer resolucao (override explicito)
 *   - offerId: identificador da oferta, usado para buscar no registro por chave exata
 *   - origin / destination: usados para buscar no registro por rota ("ORIGIN-DESTINATION")
 */
export async function getDealLinkPassagensPromo(options = {}) {
  const config = getConfig().passagensPromo;

  const resolved = resolveTrackedLink({
    registry: config.trackedLinksRegistry,
    offerId: options.offerId,
    origin: options.origin,
    destination: options.destination,
    explicitLink: options.trackedLink,
    fallbackLink: config.trackedLink,
  });

  if (!resolved) {
    return {
      ok: false,
      partner: "passagens-promo",
      method: "manual",
      error:
        "PASSAGENS_PROMO_TRACKED_LINK nao configurado (nem um link especifico encontrado no registro). A Parceiros Promo nao tem API publica: cadastre-se em parceirospromo.com.br, aguarde aprovacao (com codigo de afiliado FRANQ) e gere o link no Portal do Afiliado; configure a variavel de ambiente PASSAGENS_PROMO_TRACKED_LINK (fallback global), ou cadastre links por rota/oferta em PASSAGENS_PROMO_TRACKED_LINKS_JSON (ou passe options.trackedLink).",
    };
  }

  return {
    ok: true,
    url: resolved.url,
    partner: "passagens-promo",
    method: "manual",
    source: resolved.source,
  };
}
