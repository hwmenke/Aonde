// Hurb / Clube Hurb
//
// NAO HA API PUBLICA DOCUMENTADA para geracao de links (ver
// docs/PESQUISA-PARCEIROS.md). A geracao e manual, feita no painel do
// afiliado (clubehu.com.br), na opcao "Traquear URL". Este modulo NAO
// inventa nenhum formato de parametro de URL: ele apenas repassa o link
// ja gerado manualmente. Como cada link e gerado por rota/oferta no painel,
// oferecemos um pequeno registro (HURB_TRACKED_LINKS_JSON) para mapear
// offerId/rota -> link ja traqueado, alem do fallback global (HURB_TRACKED_LINK).

import { getConfig } from "../config.js";
import { resolveTrackedLink } from "../manualLinkRegistry.js";

/**
 * getDealLink("hurb", options)
 * options:
 *   - trackedLink: opcionalmente sobrescreve qualquer resolucao (override explicito)
 *   - offerId: identificador da oferta, usado para buscar no registro por chave exata
 *   - origin / destination: usados para buscar no registro por rota ("ORIGIN-DESTINATION")
 */
export async function getDealLinkHurb(options = {}) {
  const config = getConfig().hurb;

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
      partner: "hurb",
      method: "manual",
      error:
        'HURB_TRACKED_LINK nao configurado (nem um link especifico encontrado no registro). A Hurb nao tem API publica: gere o link manualmente no painel do Clube Hurb (clubehu.com.br), na opcao "Traquear URL", e configure a variavel de ambiente HURB_TRACKED_LINK (fallback global), ou cadastre links por rota/oferta em HURB_TRACKED_LINKS_JSON (ou passe options.trackedLink).',
    };
  }

  return {
    ok: true,
    url: resolved.url,
    partner: "hurb",
    method: "manual",
    source: resolved.source,
  };
}
